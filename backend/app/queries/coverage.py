"""Coverage resolution as-of queries for AsOf."""

from typing import Any, Dict, List, Optional
from backend.app.db.connection import get_graph


def resolve_coverage_as_of(claim_id: str, tv: int, ts: int) -> Dict[str, Any]:
    """Resolve whether a claim is covered as-of (tv, ts) and return the ordered evidence path.
    
    Cypher Query Explanation:
    1. First tries resolving coverage through policy amendments (Endorsements):
       Traverses (Claim)-[:FILED_AGAINST]->(Policy)-[:AMENDED_BY]->(Endorsement)-[:ADDS]->(Coverage)
       where all nodes, edges, and coverage category match the claim type as of $tv, $ts.
    2. If no endorsement covers it, traverses direct policy coverage:
       Traverses (Claim)-[:FILED_AGAINST]->(Policy)-[:COVERS]->(Coverage)
       where all nodes, edges, and coverage category match the claim type as of $tv, $ts.
    3. Returns the structured evidence path as an ordered list of node and edge dictionaries.
    """
    g = get_graph()

    # Step 1: Check claim existence and type
    claim_query = """
    MATCH (c:Claim {id: $claim_id})
    RETURN c.id, c.claim_type, c.amount, c.valid_from, c.sys_from
    LIMIT 1
    """
    c_res = g.query(claim_query, params={"claim_id": claim_id})
    if not c_res.result_set:
        return {
            "claim_id": claim_id,
            "covered": False,
            "reason": f"Claim '{claim_id}' not found in database.",
            "source_type": None,
            "coverage": None,
            "evidence_path": [],
        }

    c_row = c_res.result_set[0]
    claim_type = c_row[1]
    claim_amt = c_row[2]
    claim_sys_from = c_row[4]

    # Temporal Firewall Guard: If claim was not yet known to the system at $ts,
    # return immediately with empty evidence path to prevent future leakage.
    if claim_sys_from > ts:
        return {
            "claim_id": claim_id,
            "covered": False,
            "reason": f"Claim '{claim_id}' was not yet recorded in the system as of system time {ts}.",
            "source_type": None,
            "coverage": None,
            "evidence_path": [],
        }
    # (Claim)-[:FILED_AGAINST]->(Policy)-[:AMENDED_BY]->(Endorsement)-[:ADDS]->(Coverage)
    endorsement_path_query = """
    MATCH (c:Claim {id: $claim_id})-[fa:FILED_AGAINST]->(p:Policy)
    MATCH (p)-[ab:AMENDED_BY]->(e:Endorsement)-[ad:ADDS]->(cov:Coverage)
    WHERE fa.valid_from <= $tv AND $tv < fa.valid_to
      AND fa.sys_from   <= $ts AND $ts < fa.sys_to
      AND p.valid_from  <= $tv AND $tv < p.valid_to
      AND p.sys_from    <= $ts AND $ts < p.sys_to
      AND ab.valid_from <= $tv AND $tv < ab.valid_to
      AND ab.sys_from   <= $ts AND $ts < ab.sys_to
      AND e.valid_from  <= $tv AND $tv < e.valid_to
      AND e.sys_from    <= $ts AND $ts < e.sys_to
      AND ad.valid_from <= $tv AND $tv < ad.valid_to
      AND ad.sys_from   <= $ts AND $ts < ad.sys_to
      AND cov.valid_from <= $tv AND $tv < cov.valid_to
      AND cov.sys_from   <= $ts AND $ts < cov.sys_to
      AND cov.category  = c.claim_type
    RETURN c.id, p.id, e.id, cov.id, cov.code, cov.name, cov.limit, cov.deductible, e.description
    LIMIT 1
    """
    end_res = g.query(
        endorsement_path_query,
        params={"claim_id": claim_id, "tv": tv, "ts": ts},
    )

    if end_res.result_set:
        row = end_res.result_set[0]
        cov_info = {
            "id": row[3],
            "code": row[4],
            "name": row[5],
            "limit": row[6],
            "deductible": row[7],
            "category": claim_type,
            "via_endorsement": {
                "id": row[2],
                "description": row[8],
            },
        }

        # Construct ordered evidence path: Claim -> FILED_AGAINST -> Policy -> AMENDED_BY -> Endorsement -> ADDS -> Coverage
        evidence_path = [
            {"element": "node", "label": "Claim", "id": row[0]},
            {"element": "edge", "type": "FILED_AGAINST", "source": row[0], "target": row[1]},
            {"element": "node", "label": "Policy", "id": row[1]},
            {"element": "edge", "type": "AMENDED_BY", "source": row[1], "target": row[2]},
            {"element": "node", "label": "Endorsement", "id": row[2]},
            {"element": "edge", "type": "ADDS", "source": row[2], "target": row[3]},
            {"element": "node", "label": "Coverage", "id": row[3]},
        ]

        return {
            "claim_id": claim_id,
            "covered": True,
            "reason": f"Covered under Endorsement '{row[2]}' adding '{cov_info['name']}'.",
            "source_type": "endorsement",
            "coverage": cov_info,
            "evidence_path": evidence_path,
        }

    # Step 3: Traversal via Base Policy:
    # (Claim)-[:FILED_AGAINST]->(Policy)-[:COVERS]->(Coverage)
    base_path_query = """
    MATCH (c:Claim {id: $claim_id})-[fa:FILED_AGAINST]->(p:Policy)
    MATCH (p)-[cov_rel:COVERS]->(cov:Coverage)
    WHERE fa.valid_from <= $tv AND $tv < fa.valid_to
      AND fa.sys_from   <= $ts AND $ts < fa.sys_to
      AND p.valid_from  <= $tv AND $tv < p.valid_to
      AND p.sys_from    <= $ts AND $ts < p.sys_to
      AND cov_rel.valid_from <= $tv AND $tv < cov_rel.valid_to
      AND cov_rel.sys_from   <= $ts AND $ts < cov_rel.sys_to
      AND cov.valid_from <= $tv AND $tv < cov.valid_to
      AND cov.sys_from   <= $ts AND $ts < cov.sys_to
      AND cov.category  = c.claim_type
    RETURN c.id, p.id, cov.id, cov.code, cov.name, cov.limit, cov.deductible
    LIMIT 1
    """
    base_res = g.query(
        base_path_query,
        params={"claim_id": claim_id, "tv": tv, "ts": ts},
    )

    if base_res.result_set:
        row = base_res.result_set[0]
        cov_info = {
            "id": row[2],
            "code": row[3],
            "name": row[4],
            "limit": row[5],
            "deductible": row[6],
            "category": claim_type,
            "via_endorsement": None,
        }

        # Construct ordered evidence path: Claim -> FILED_AGAINST -> Policy -> COVERS -> Coverage
        evidence_path = [
            {"element": "node", "label": "Claim", "id": row[0]},
            {"element": "edge", "type": "FILED_AGAINST", "source": row[0], "target": row[1]},
            {"element": "node", "label": "Policy", "id": row[1]},
            {"element": "edge", "type": "COVERS", "source": row[1], "target": row[2]},
            {"element": "node", "label": "Coverage", "id": row[2]},
        ]

        return {
            "claim_id": claim_id,
            "covered": True,
            "reason": f"Covered directly under base Policy '{row[1]}' ({cov_info['name']}).",
            "source_type": "policy",
            "coverage": cov_info,
            "evidence_path": evidence_path,
        }

    # Step 4: No coverage found at (tv, ts)
    # Check if policy was at least filed against as of (tv, ts)
    pol_match_query = """
    MATCH (c:Claim {id: $claim_id})-[fa:FILED_AGAINST]->(p:Policy)
    WHERE fa.sys_from <= $ts AND $ts < fa.sys_to
      AND p.sys_from   <= $ts AND $ts < p.sys_to
    RETURN p.id
    LIMIT 1
    """
    pm_res = g.query(pol_match_query, params={"claim_id": claim_id, "ts": ts})
    if pm_res.result_set:
        pol_id = pm_res.result_set[0][0]
        partial_path = [
            {"element": "node", "label": "Claim", "id": claim_id},
            {"element": "edge", "type": "FILED_AGAINST", "source": claim_id, "target": pol_id},
            {"element": "node", "label": "Policy", "id": pol_id},
        ]
    else:
        pol_id = "UNKNOWN"
        partial_path = [
            {"element": "node", "label": "Claim", "id": claim_id},
        ]

    return {
        "claim_id": claim_id,
        "covered": False,
        "reason": f"No active coverage for loss type '{claim_type}' on policy '{pol_id}' as of system knowledge time.",
        "source_type": None,
        "coverage": None,
        "evidence_path": partial_path,
    }
