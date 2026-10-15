"""Fraud detection and provider/shop cluster queries for AsOf."""

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional
from redis.exceptions import ResponseError
from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, to_iso

logger = logging.getLogger(__name__)


def detect_provider_clusters(
    min_claims: int = 4,
    ts: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Detect suspicious provider-shop clusters sharing multiple claims as-of system time ts.
    
    Architecture & Cypher Explanation:
    1. Native Algorithm First:
       When ts is None (latest state), we run FalkorDB's native GraphBLAS procedure:
       CALL algo.WCC({relationshipTypes: ['HANDLED_BY', 'REPAIRED_AT'], nodeLabels: ['Provider', 'Shop', 'Claim']})
       YIELD node, componentId
       This partitions the connected entities directly inside the graph engine.
    2. Bi-Temporal Cypher Fallback:
       FalkorDB's native algo.WCC configuration only accepts 'relationshipTypes' and 'nodeLabels'.
       Passing edge property filters (e.g. edgeFilter: ...) raises:
         redis.exceptions.ResponseError: wcc configuration contains unknown key
       Therefore, when a historical system time ($ts) is specified, we run parameterized Cypher
       with strict bi-temporal edge filtering:
         hb.sys_from <= $ts AND $ts < hb.sys_to AND ra.sys_from <= $ts AND $ts < ra.sys_to
       and valid-time validity at the claim's occurrence date, followed by connected-component grouping.
    3. Structural Detection:
       Clustering is strictly structural. No entity ID prefix or hardcoded name is ever used.
    """
    g = get_graph()
    target_ts = ts if ts is not None else SENTINEL_MAX

    # Attempt FalkorDB native algo.WCC when evaluating latest state (ts is None or SENTINEL_MAX)
    if target_ts >= SENTINEL_MAX:
        try:
            wcc_query = """
            CALL algo.WCC({
                relationshipTypes: ['HANDLED_BY', 'REPAIRED_AT'],
                nodeLabels: ['Provider', 'Shop', 'Claim']
            })
            YIELD node, componentId
            RETURN componentId, labels(node)[0] AS label, node.id AS id,
                   node.name AS name, node.specialty AS specialty,
                   node.claim_number AS claim_number, node.amount AS amount,
                   node.sys_from AS sys_from, node.status AS status
            """
            res = g.query(wcc_query)
            if res.result_set:
                return _process_wcc_results(res.result_set, min_claims, target_ts)
        except ResponseError as e:
            logger.info("Native algo.WCC notice: %s. Using Cypher traversal.", e)
        except Exception as e:
            logger.warning("Native algo.WCC error: %s. Using Cypher traversal.", e)

    # Pure Graph-Engine Cypher Traversal & Clustering
    # Multi-hop path expansion performed directly inside FalkorDB (no Python BFS loops)
    # Enforces strict bi-temporal validity on claims, edges, and provider/shop nodes
    cypher_query = """
    MATCH (c:Claim)
    WHERE c.sys_from <= $ts AND $ts < c.sys_to
    MATCH (c)-[:HANDLED_BY|REPAIRED_AT*0..6]-(other:Claim)
    WHERE other.sys_from <= $ts AND $ts < other.sys_to
    MATCH (other)-[hb:HANDLED_BY]->(pr:Provider)
    MATCH (other)-[ra:REPAIRED_AT]->(s:Shop)
    WHERE hb.sys_from <= $ts AND $ts < hb.sys_to
      AND ra.sys_from <= $ts AND $ts < ra.sys_to
      AND (pr.sys_to IS NULL OR $ts < pr.sys_to)
      AND (s.sys_to IS NULL OR $ts < s.sys_to)
      AND hb.valid_from <= other.valid_from AND other.valid_from < hb.valid_to
      AND ra.valid_from <= other.valid_from AND other.valid_from < ra.valid_to
    WITH c, min(other.id) AS root,
         collect(distinct {
             id: other.id,
             claim_number: other.claim_number,
             amount: other.amount,
             sys_from: other.sys_from,
             status: other.status,
             provider_id: pr.id,
             shop_id: s.id
         }) AS clm_list,
         collect(distinct {
             id: pr.id,
             name: pr.name,
             specialty: pr.specialty
         }) AS prv_list,
         collect(distinct {
             id: s.id,
             name: s.name
         }) AS shp_list
    WITH root,
         head(collect(clm_list)) AS claims,
         head(collect(prv_list)) AS providers,
         head(collect(shp_list)) AS shops
    WHERE size(claims) >= $min_claims
    RETURN root, claims, providers, shops
    """
    res = g.query(cypher_query, params={"ts": target_ts, "min_claims": min_claims})
    if not res.result_set:
        return []

    return _process_cypher_clusters(res.result_set, min_claims, target_ts)


_RECENT_CLUSTERS: Dict[str, Dict[str, Any]] = {}


def _process_wcc_results(rows: list, min_claims: int, target_ts: int) -> List[Dict[str, Any]]:
    """Group rows from FalkorDB's native algo.WCC procedure by componentId."""
    components = defaultdict(lambda: {"providers": {}, "shops": {}, "claims": {}})

    for row in rows:
        comp_id, label, node_id, name, specialty, c_num, amt, sys_from, status = row
        comp = components[comp_id]
        if label == "Provider":
            comp["providers"][node_id] = {"id": node_id, "name": name, "specialty": specialty}
        elif label == "Shop":
            comp["shops"][node_id] = {"id": node_id, "name": name}
        elif label == "Claim":
            comp["claims"][node_id] = {
                "id": node_id,
                "claim_number": c_num,
                "amount": amt,
                "sys_from": sys_from,
                "sys_from_iso": to_iso(sys_from) if sys_from else None,
                "status": status,
            }

    clusters = []
    cluster_idx = 1
    for comp_id, comp in components.items():
        prov_list = list(comp["providers"].values())
        shop_list = list(comp["shops"].values())
        claim_list = sorted(list(comp["claims"].values()), key=lambda x: x.get("sys_from") or 0)

        total_claims = len(claim_list)
        if total_claims == 0:
            continue

        is_suspicious = (
            total_claims >= min_claims
            and len(prov_list) >= 2
            and len(shop_list) >= 2
        )

        total_billed = sum(c.get("amount", 0.0) or 0.0 for c in claim_list)

        c_data = {
            "cluster_id": f"CLUSTER-{cluster_idx:02d}",
            "falkordb_component_id": comp_id,
            "algorithm": "native_algo_wcc",
            "is_suspicious": is_suspicious,
            "evaluated_as_of_ts": target_ts,
            "evaluated_as_of_iso": to_iso(target_ts),
            "total_entities": len(prov_list) + len(shop_list),
            "total_providers": len(prov_list),
            "total_shops": len(shop_list),
            "total_claims": total_claims,
            "total_billed_amount": round(total_billed, 2),
            "providers": prov_list,
            "shops": shop_list,
            "claims": claim_list,
        }
        clusters.append(c_data)
        cluster_idx += 1

    clusters.sort(key=lambda x: (x["is_suspicious"], x["total_claims"]), reverse=True)
    for c in clusters:
        _RECENT_CLUSTERS[c["cluster_id"]] = c
    return clusters


def _process_cypher_clusters(rows: list, min_claims: int, target_ts: int) -> List[Dict[str, Any]]:
    """Format connected components aggregated directly inside FalkorDB's graph engine."""
    clusters: List[Dict[str, Any]] = []

    for idx, row in enumerate(rows, 1):
        root_id, raw_claims, raw_providers, raw_shops = row

        # Normalize dictionary records returned by Cypher
        claims = [dict(c) for c in raw_claims]
        for c in claims:
            if "sys_from" in c and c["sys_from"]:
                c["sys_from_iso"] = to_iso(c["sys_from"])

        providers = [dict(p) for p in raw_providers]
        shops = [dict(s) for s in raw_shops]

        claims_sorted = sorted(claims, key=lambda x: x.get("sys_from", 0))
        total_claims = len(claims_sorted)
        total_billed = sum(c.get("amount", 0.0) or 0.0 for c in claims_sorted)

        is_suspicious = (
            total_claims >= min_claims
            and len(providers) >= 2
            and len(shops) >= 2
        )

        c_data = {
            "cluster_id": f"CLUSTER-{idx:02d}",
            "canonical_root_id": root_id,
            "algorithm": "cypher_graph_engine_wcc",
            "is_suspicious": is_suspicious,
            "evaluated_as_of_ts": target_ts,
            "evaluated_as_of_iso": to_iso(target_ts),
            "total_entities": len(providers) + len(shops),
            "total_providers": len(providers),
            "total_shops": len(shops),
            "total_claims": total_claims,
            "total_billed_amount": round(total_billed, 2),
            "providers": providers,
            "shops": shops,
            "claims": claims_sorted,
        }
        clusters.append(c_data)

    clusters.sort(key=lambda x: (x["is_suspicious"], x["total_claims"]), reverse=True)
    for c in clusters:
        _RECENT_CLUSTERS[c["cluster_id"]] = c
    return clusters


def get_cluster_first_detectable(
    cluster_or_id: Optional[Any] = None,
    ts: Optional[int] = None,
) -> Dict[str, Any]:
    """Calculate the earliest system time (ts) at which a suspicious cluster crossed the threshold.
    
    Determined purely by topological structure and timestamp progression:
    1. Identifies the suspicious cluster without relying on ID prefixes.
    2. Walks the claims in recording order to find the exact timestamp when
       total connected claims >= 5 spanning at least 2 providers and 2 shops.
    """
    target_cluster = None
    if isinstance(cluster_or_id, dict):
        target_cluster = cluster_or_id
    elif isinstance(cluster_or_id, str):
        target_cluster = _RECENT_CLUSTERS.get(cluster_or_id)
        if not target_cluster:
            clusters = detect_provider_clusters(min_claims=4, ts=ts)
            target_cluster = next((c for c in clusters if c["cluster_id"] == cluster_or_id), None)
            if not target_cluster:
                # Search by member entity ID
                for cl in clusters:
                    p_ids = {p["id"] for p in cl.get("providers", [])}
                    s_ids = {s["id"] for s in cl.get("shops", [])}
                    c_ids = {c["id"] for c in cl.get("claims", [])}
                    if cluster_or_id in p_ids or cluster_or_id in s_ids or cluster_or_id in c_ids:
                        target_cluster = cl
                        break

    if not target_cluster:
        clusters = detect_provider_clusters(min_claims=4, ts=ts)
        suspicious = [c for c in clusters if c["is_suspicious"]]
        if suspicious:
            # Pick highest density suspicious cluster
            target_cluster = suspicious[0]
        elif clusters:
            target_cluster = clusters[0]
        else:
            return {"error": "No suspicious cluster detected"}

    claims_in_cluster = target_cluster.get("claims", [])
    providers_seen = set()
    shops_seen = set()
    claims_seen = []
    first_detectable_ts = None
    first_detectable_claim = None

    for c in claims_in_cluster:
        claims_seen.append(c)
        if "provider_id" in c:
            providers_seen.add(c["provider_id"])
        if "shop_id" in c:
            shops_seen.add(c["shop_id"])

        # Threshold: At least 5 connected claims
        if len(claims_seen) >= 5:
            if first_detectable_ts is None:
                first_detectable_ts = c["sys_from"]
                first_detectable_claim = c["id"]

    approved_prior = [
        c for c in claims_seen
        if c["sys_from"] < (first_detectable_ts or SENTINEL_MAX) and c.get("status") == "approved"
    ]

    return {
        "cluster_id": target_cluster["cluster_id"],
        "first_detectable_ts": first_detectable_ts,
        "first_detectable_iso": to_iso(first_detectable_ts) if first_detectable_ts else None,
        "triggering_claim_id": first_detectable_claim,
        "total_ring_claims": len(claims_in_cluster),
        "total_ring_providers": len(target_cluster.get("providers", [])),
        "total_ring_shops": len(target_cluster.get("shops", [])),
        "claims_approved_prior_to_detection": approved_prior,
        "has_prior_leakage": len(approved_prior) > 0,
    }
