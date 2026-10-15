"""Policy as-of queries for AsOf."""

from typing import Any, Dict, List, Optional
from backend.app.db.connection import get_graph


def get_policy_as_of(policy_id: str, tv: int, ts: int) -> Optional[Dict[str, Any]]:
    """Retrieve the policy state, holder, coverages, and active endorsements as-of (tv, ts).
    
    Cypher Query Explanation:
    1. Matches the Policy node by ID that is valid at $tv in the real world and known by the system at $ts.
    2. Traverses incoming HAS_POLICY edge from Policyholder (also constrained to $tv, $ts).
    3. Traverses active COVERS edges to base Coverage nodes.
    4. Traverses active AMENDED_BY edges to active Endorsement nodes and their ADDS edges to added Coverages.
    """
    g = get_graph()

    # Query for the version of the Policy active at (tv, ts)
    policy_query = """
    MATCH (ph:Policyholder)-[hp:HAS_POLICY]->(p:Policy {id: $policy_id})
    WHERE p.valid_from <= $tv AND $tv < p.valid_to
      AND p.sys_from   <= $ts AND $ts < p.sys_to
      AND hp.valid_from <= $tv AND $tv < hp.valid_to
      AND hp.sys_from   <= $ts AND $ts < hp.sys_to
    RETURN p.id, p.policy_number, p.type, p.deductible, p.coverage_limit,
           p.valid_from, p.valid_to, p.sys_from, p.sys_to,
           ph.id, ph.name, ph.email
    LIMIT 1
    """
    pol_res = g.query(policy_query, params={"policy_id": policy_id, "tv": tv, "ts": ts})
    if not pol_res.result_set:
        return None

    row = pol_res.result_set[0]
    policy_info = {
        "id": row[0],
        "policy_number": row[1],
        "type": row[2],
        "deductible": row[3],
        "coverage_limit": row[4],
        "valid_from": row[5],
        "valid_to": row[6],
        "sys_from": row[7],
        "sys_to": row[8],
        "policyholder": {
            "id": row[9],
            "name": row[10],
            "email": row[11],
        },
        "base_coverages": [],
        "endorsements": [],
    }

    # Query for base coverages active at (tv, ts)
    base_cov_query = """
    MATCH (p:Policy {id: $policy_id})-[r:COVERS]->(cov:Coverage)
    WHERE r.valid_from <= $tv AND $tv < r.valid_to
      AND r.sys_from   <= $ts AND $ts < r.sys_to
      AND cov.valid_from <= $tv AND $tv < cov.valid_to
      AND cov.sys_from   <= $ts AND $ts < cov.sys_to
    RETURN cov.id, cov.code, cov.name, cov.category, cov.limit, cov.deductible
    """
    base_res = g.query(base_cov_query, params={"policy_id": policy_id, "tv": tv, "ts": ts})
    for cov_row in base_res.result_set:
        policy_info["base_coverages"].append({
            "id": cov_row[0],
            "code": cov_row[1],
            "name": cov_row[2],
            "category": cov_row[3],
            "limit": cov_row[4],
            "deductible": cov_row[5],
        })

    # Query for endorsements and added coverages active at (tv, ts)
    end_query = """
    MATCH (p:Policy {id: $policy_id})-[a:AMENDED_BY]->(e:Endorsement)-[ad:ADDS]->(cov:Coverage)
    WHERE a.valid_from <= $tv AND $tv < a.valid_to
      AND a.sys_from   <= $ts AND $ts < a.sys_to
      AND e.valid_from <= $tv AND $tv < e.valid_to
      AND e.sys_from   <= $ts AND $ts < e.sys_to
      AND ad.valid_from <= $tv AND $tv < ad.valid_to
      AND ad.sys_from   <= $ts AND $ts < ad.sys_to
      AND cov.valid_from <= $tv AND $tv < cov.valid_to
      AND cov.sys_from   <= $ts AND $ts < cov.sys_to
    RETURN e.id, e.endorsement_number, e.description,
           cov.id, cov.code, cov.name, cov.category, cov.limit, cov.deductible
    """
    end_res = g.query(end_query, params={"policy_id": policy_id, "tv": tv, "ts": ts})
    for e_row in end_res.result_set:
        policy_info["endorsements"].append({
            "endorsement_id": e_row[0],
            "endorsement_number": e_row[1],
            "description": e_row[2],
            "added_coverage": {
                "id": e_row[3],
                "code": e_row[4],
                "name": e_row[5],
                "category": e_row[6],
                "limit": e_row[7],
                "deductible": e_row[8],
            },
        })

    return policy_info
