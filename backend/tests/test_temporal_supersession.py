"""Tests verifying that superseded versions (where sys_to <= ts) are strictly excluded."""

import pytest
from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, to_epoch_ms
from backend.app.queries.fraud import detect_provider_clusters
from backend.app.queries.late_facts import find_late_facts
from backend.app.queries.policy import get_policy_as_of


def test_superseded_edge_excluded_from_clustering():
    """Verify that a provider-claim edge closed with sys_to is excluded when ts >= sys_to."""
    g = get_graph()
    jan_1 = to_epoch_ms("2026-01-01T00:00:00Z")
    feb_1 = to_epoch_ms("2026-02-01T00:00:00Z")
    mar_1 = to_epoch_ms("2026-03-01T00:00:00Z")

    p_id = "PRV-SUPERSEDED-TEST"
    s_id = "SHP-SUPERSEDED-TEST"
    c_id = "CLM-SUPERSEDED-TEST"
    test_ids = [p_id, s_id, c_id]

    try:
        g.query(
            "CREATE (:Provider {id: $pid, name: 'Old Provider', specialty: 'General', valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent})",
            params={"pid": p_id, "v": jan_1, "sent": SENTINEL_MAX},
        )
        g.query(
            "CREATE (:Shop {id: $sid, name: 'Old Shop', valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent})",
            params={"sid": s_id, "v": jan_1, "sent": SENTINEL_MAX},
        )
        g.query(
            "CREATE (:Claim {id: $cid, claim_number: 'CLM-SUP-01', amount: 5000.0, status: 'denied', valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent})",
            params={"cid": c_id, "v": jan_1, "sent": SENTINEL_MAX},
        )

        # Create HANDLED_BY edge that was superseded on Feb 1 (sys_to = feb_1)
        g.query(
            """
            MATCH (c:Claim {id: $cid}), (p:Provider {id: $pid}), (s:Shop {id: $sid})
            CREATE (c)-[:HANDLED_BY {valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $close_ts}]->(p)
            CREATE (c)-[:REPAIRED_AT {valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent}]->(s)
            """,
            params={"cid": c_id, "pid": p_id, "sid": s_id, "v": jan_1, "close_ts": feb_1, "sent": SENTINEL_MAX},
        )

        # 1. At ts = Jan 15 (before supersession): Edge was active in system
        clusters_before = detect_provider_clusters(min_claims=1, ts=to_epoch_ms("2026-01-15T00:00:00Z"))
        found_before = any(
            any(p["id"] == p_id for p in cl["providers"])
            for cl in clusters_before
        )
        assert found_before is True, "Expected provider edge to be active at Jan 15"

        # 2. At ts = March 1 (after supersession where ts >= sys_to): Edge MUST BE EXCLUDED
        clusters_after = detect_provider_clusters(min_claims=1, ts=mar_1)
        found_after = any(
            any(p["id"] == p_id for p in cl["providers"])
            for cl in clusters_after
        )
        assert found_after is False, "Expected superseded edge with sys_to <= ts to be excluded at March 1"

    finally:
        g.query("MATCH (n) WHERE n.id IN $ids DETACH DELETE n", params={"ids": test_ids})


def test_superseded_endorsement_excluded_from_late_facts():
    """Verify that a retracted/superseded endorsement is excluded from late_facts."""
    g = get_graph()
    jan_1 = to_epoch_ms("2026-01-01T00:00:00Z")
    jan_10 = to_epoch_ms("2026-01-10T00:00:00Z")
    jan_20 = to_epoch_ms("2026-01-20T00:00:00Z")
    jan_25 = to_epoch_ms("2026-01-25T00:00:00Z")

    c_id = "CLM-RETRACT-TEST"
    p_id = "POL-RETRACT-TEST"
    e_id = "END-RETRACT-TEST"
    cov_id = "COV-RETRACT-TEST"
    test_ids = [c_id, p_id, e_id, cov_id]

    try:
        g.query(
            "CREATE (:Claim {id: $cid, valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent, claim_type: 'collision'})",
            params={"cid": c_id, "v": jan_1, "sent": SENTINEL_MAX},
        )
        g.query(
            "CREATE (:Policy {id: $pid, valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent})",
            params={"pid": p_id, "v": jan_1, "sent": SENTINEL_MAX},
        )
        g.query(
            "CREATE (:Endorsement {id: $eid, description: 'Flawed Endorsement', valid_from: $v, valid_to: $sent, sys_from: $s, sys_to: $close_ts})",
            params={"eid": e_id, "v": jan_1, "s": jan_10, "close_ts": jan_20, "sent": SENTINEL_MAX},
        )
        g.query(
            "CREATE (:Coverage {id: $covid, category: 'collision', name: 'Flawed Cov', valid_from: $v, valid_to: $sent, sys_from: $s, sys_to: $close_ts})",
            params={"covid": cov_id, "v": jan_1, "s": jan_10, "close_ts": jan_20, "sent": SENTINEL_MAX},
        )

        g.query(
            """
            MATCH (c:Claim {id: $cid}), (p:Policy {id: $pid}), (e:Endorsement {id: $eid}), (cov:Coverage {id: $covid})
            CREATE (c)-[:FILED_AGAINST {valid_from: $v, valid_to: $sent, sys_from: $v, sys_to: $sent}]->(p)
            CREATE (p)-[:AMENDED_BY {valid_from: $v, valid_to: $sent, sys_from: $s, sys_to: $close_ts}]->(e)
            CREATE (e)-[:ADDS {valid_from: $v, valid_to: $sent, sys_from: $s, sys_to: $close_ts}]->(cov)
            """,
            params={"cid": c_id, "pid": p_id, "eid": e_id, "covid": cov_id, "v": jan_1, "s": jan_10, "close_ts": jan_20, "sent": SENTINEL_MAX},
        )

        # Query late facts with decision_ts = Jan 25 (after the endorsement was already retracted on Jan 20)
        # Because decision_ts >= sys_to, this superseded endorsement must NOT be reported as active late fact
        late_facts = find_late_facts(c_id, decision_ts=jan_25)
        assert not any(f["id"] == e_id for f in late_facts), "Superseded endorsement must not appear in late facts"

    finally:
        g.query("MATCH (n) WHERE n.id IN $ids DETACH DELETE n", params={"ids": test_ids})
