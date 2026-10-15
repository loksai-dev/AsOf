"""Tests verifying that fraud clustering does not rely on ID prefixes."""

import pytest
from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, to_epoch_ms
from backend.app.queries.fraud import detect_provider_clusters, get_cluster_first_detectable


def test_clustering_with_arbitrary_renamed_ids():
    """Verify that detect_provider_clusters discovers fraud clusters based purely on
    graph connectivity and claim count, with zero reliance on 'PRV-RING' or 'RING' string prefixes.
    """
    g = get_graph()
    jan_1 = to_epoch_ms("2026-01-01T00:00:00Z")
    may_10 = to_epoch_ms("2026-05-10T00:00:00Z")

    # Insert a cluster with completely arbitrary IDs containing no 'RING' prefix
    prov_ids = ["PRV-CLINIC-ALPHA", "PRV-CLINIC-BETA", "PRV-CLINIC-GAMMA"]
    shop_ids = ["SHP-GARAGE-DELTA", "SHP-GARAGE-EPSILON", "SHP-GARAGE-ZETA"]
    claim_ids = [f"CLM-CUSTOM-CASE-{i:02d}" for i in range(1, 7)]

    cleanup_cypher = """
    MATCH (n) WHERE n.id IN $all_ids
    DETACH DELETE n
    """
    all_test_ids = prov_ids + shop_ids + claim_ids

    try:
        # 1. Create 3 arbitrary providers
        for p_id in prov_ids:
            g.query(
                "CREATE (p:Provider {id: $id, name: $name, specialty: 'Trauma Care', valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent})",
                params={"id": p_id, "name": f"Facility {p_id}", "v": jan_1, "sent": SENTINEL_MAX},
            )

        # 2. Create 3 arbitrary shops
        for s_id in shop_ids:
            g.query(
                "CREATE (s:Shop {id: $id, name: $name, valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent})",
                params={"id": s_id, "name": f"Shop {s_id}", "v": jan_1, "sent": SENTINEL_MAX},
            )

        # 3. Create 6 interconnected claims
        pairings = [
            (prov_ids[0], shop_ids[0]),
            (prov_ids[0], shop_ids[1]),
            (prov_ids[1], shop_ids[1]),
            (prov_ids[1], shop_ids[2]),
            (prov_ids[2], shop_ids[0]),
            (prov_ids[2], shop_ids[2]),
        ]

        for idx, (c_id, (p_id, s_id)) in enumerate(zip(claim_ids, pairings), 1):
            c_time = may_10 + idx * 86400 * 1000
            g.query(
                "CREATE (c:Claim {id: $id, claim_number: $cnum, amount: 9500.0, status: 'flagged', valid_from: $t, valid_to: $sent, sys_from: $t, sys_to: $sent})",
                params={"id": c_id, "cnum": f"NUM-{c_id}", "t": c_time, "sent": SENTINEL_MAX},
            )
            g.query(
                """
                MATCH (c:Claim {id: $cid}), (p:Provider {id: $pid}), (s:Shop {id: $sid})
                CREATE (c)-[:HANDLED_BY {valid_from: $t, valid_to: $sent, sys_from: $t, sys_to: $sent}]->(p)
                CREATE (c)-[:REPAIRED_AT {valid_from: $t, valid_to: $sent, sys_from: $t, sys_to: $sent}]->(s)
                """,
                params={"cid": c_id, "pid": p_id, "sid": s_id, "t": c_time, "sent": SENTINEL_MAX},
            )

        # 4. Run clustering without any prefix filter
        clusters = detect_provider_clusters(min_claims=4, ts=to_epoch_ms("2026-06-01T00:00:00Z"))

        # Find the cluster containing our arbitrary nodes
        matched_cluster = None
        for cl in clusters:
            provider_ids_in_cl = {p["id"] for p in cl["providers"]}
            if prov_ids[0] in provider_ids_in_cl:
                matched_cluster = cl
                break

        assert matched_cluster is not None, "Failed to find cluster with arbitrary IDs"
        assert matched_cluster["is_suspicious"] is True
        assert matched_cluster["total_claims"] == 6
        assert matched_cluster["total_providers"] == 3
        assert matched_cluster["total_shops"] == 3

        # 5. Verify get_cluster_first_detectable works with arbitrary IDs
        first_det = get_cluster_first_detectable(matched_cluster["cluster_id"])
        assert first_det["first_detectable_ts"] is not None
        assert first_det["total_ring_claims"] == 6

    finally:
        # Cleanup test entities
        g.query(cleanup_cypher, params={"all_ids": all_test_ids})
