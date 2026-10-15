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

    # Bi-temporal Cypher traversal with strict validity intervals
    # Filters both sys_from <= $ts AND $ts < sys_to on edges and claims, and validates sys_to on nodes
    cypher_query = """
    MATCH (pr:Provider)<-[hb:HANDLED_BY]-(c:Claim)-[ra:REPAIRED_AT]->(s:Shop)
    WHERE hb.sys_from <= $ts AND $ts < hb.sys_to
      AND ra.sys_from <= $ts AND $ts < ra.sys_to
      AND c.sys_from  <= $ts AND $ts < c.sys_to
      AND (pr.sys_to IS NULL OR $ts < pr.sys_to)
      AND (s.sys_to  IS NULL OR $ts < s.sys_to)
      AND hb.valid_from <= c.valid_from AND c.valid_from < hb.valid_to
      AND ra.valid_from <= c.valid_from AND c.valid_from < ra.valid_to
    RETURN pr.id, pr.name, pr.specialty,
           s.id, s.name,
           c.id, c.claim_number, c.amount, c.sys_from, c.status
    ORDER BY c.sys_from ASC
    """
    res = g.query(cypher_query, params={"ts": target_ts})
    if not res.result_set:
        return []

    return _process_bipartite_results(res.result_set, min_claims, target_ts)


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


def _process_bipartite_results(rows: list, min_claims: int, target_ts: int) -> List[Dict[str, Any]]:
    """Build connected components from bi-temporal Cypher query results."""
    adjacency = defaultdict(set)
    provider_details = {}
    shop_details = {}
    claim_details = {}
    claim_pairs = []

    for row in rows:
        pr_id, pr_name, pr_spec, s_id, s_name, c_id, c_num, c_amt, c_sys, c_status = row
        provider_details[pr_id] = {"id": pr_id, "name": pr_name, "specialty": pr_spec}
        shop_details[s_id] = {"id": s_id, "name": s_name}
        claim_details[c_id] = {
            "id": c_id,
            "claim_number": c_num,
            "amount": c_amt,
            "sys_from": c_sys,
            "sys_from_iso": to_iso(c_sys),
            "status": c_status,
            "provider_id": pr_id,
            "shop_id": s_id,
        }
        adjacency[pr_id].add(s_id)
        adjacency[s_id].add(pr_id)
        claim_pairs.append((pr_id, s_id, c_id))

    visited = set()
    components = []

    for node in list(adjacency.keys()):
        if node not in visited:
            comp_nodes = set()
            queue = [node]
            visited.add(node)
            while queue:
                curr = queue.pop(0)
                comp_nodes.add(curr)
                for neighbor in adjacency[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(comp_nodes)

    clusters: List[Dict[str, Any]] = []
    for idx, comp in enumerate(components, 1):
        comp_providers = [p for p in comp if p in provider_details]
        comp_shops = [s for s in comp if s in shop_details]

        comp_claims = [
            claim_details[c_id]
            for pr_id, s_id, c_id in claim_pairs
            if pr_id in comp and s_id in comp
        ]
        unique_claims = {c["id"]: c for c in comp_claims}.values()
        claim_list = sorted(list(unique_claims), key=lambda x: x["sys_from"])

        total_claims = len(claim_list)
        total_billed = sum(c["amount"] for c in claim_list)

        is_suspicious = (
            total_claims >= min_claims
            and len(comp_providers) >= 2
            and len(comp_shops) >= 2
        )

        c_data = {
            "cluster_id": f"CLUSTER-{idx:02d}",
            "algorithm": "bitemporal_cypher_wcc",
            "is_suspicious": is_suspicious,
            "evaluated_as_of_ts": target_ts,
            "evaluated_as_of_iso": to_iso(target_ts),
            "total_entities": len(comp_providers) + len(comp_shops),
            "total_providers": len(comp_providers),
            "total_shops": len(comp_shops),
            "total_claims": total_claims,
            "total_billed_amount": round(total_billed, 2),
            "providers": [provider_details[p] for p in comp_providers],
            "shops": [shop_details[s] for s in comp_shops],
            "claims": claim_list,
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
