"""Late facts query engine for AsOf."""

from typing import Any, Dict, List
from backend.app.db.connection import get_graph
from backend.app.db.temporal import to_iso


def find_late_facts(claim_id: str, decision_ts: int) -> List[Dict[str, Any]]:
    """Find facts valid at incident time but recorded by the system after decision_ts.
    
    Cypher Query Explanation:
    1. Looks up the claim's real-world incident timestamp ($tv = c.valid_from).
    2. Searches for Endorsement and Coverage entities connected to the claim's policy
       that were effective in the real world at the incident time (valid_from <= $tv < valid_to),
       but whose system transaction time occurred strictly after the historical decision (sys_from > $decision_ts).
    3. Checks both nodes and edges to capture full graph provenance of retroactive updates.
    """
    g = get_graph()

    # Step 1: Get claim incident time
    claim_q = "MATCH (c:Claim {id: $claim_id}) RETURN c.valid_from, c.claim_type, c.id LIMIT 1"
    res = g.query(claim_q, params={"claim_id": claim_id})
    if not res.result_set:
        return []

    incident_ts = res.result_set[0][0]
    claim_type = res.result_set[0][1]

    late_facts: List[Dict[str, Any]] = []

    # Step 2: Query for Endorsements recorded after decision_ts that cover the incident
    late_end_query = """
    MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)
    MATCH (p)-[ab:AMENDED_BY]->(e:Endorsement)-[ad:ADDS]->(cov:Coverage)
    WHERE ab.valid_from <= $incident_ts AND $incident_ts < ab.valid_to
      AND ab.sys_from   > $decision_ts
      AND $decision_ts  < ab.sys_to
      AND ad.valid_from <= $incident_ts AND $incident_ts < ad.valid_to
      AND ad.sys_from   > $decision_ts
      AND $decision_ts  < ad.sys_to
      AND cov.valid_from <= $incident_ts AND $incident_ts < cov.valid_to
      AND cov.sys_from   > $decision_ts
      AND $decision_ts   < cov.sys_to
    RETURN e.id, e.description, ab.valid_from, ab.sys_from,
           cov.id, cov.name, cov.category, cov.sys_from
    """
    end_res = g.query(
        late_end_query,
        params={"claim_id": claim_id, "incident_ts": incident_ts, "decision_ts": decision_ts},
    )

    for row in end_res.result_set:
        e_id, e_desc, v_from, s_from, cov_id, cov_name, cov_cat, cov_sys_from = row
        delay_ms = s_from - decision_ts
        delay_days = round(delay_ms / (1000 * 86400), 1)

        late_facts.append({
            "entity_type": "Endorsement",
            "id": e_id,
            "description": e_desc,
            "valid_from": v_from,
            "valid_from_iso": to_iso(v_from),
            "sys_from": s_from,
            "sys_from_iso": to_iso(s_from),
            "decision_ts": decision_ts,
            "decision_ts_iso": to_iso(decision_ts),
            "recording_delay_ms": delay_ms,
            "recording_delay_days": delay_days,
            "relationship": "AMENDED_BY",
        })

        late_facts.append({
            "entity_type": "Coverage",
            "id": cov_id,
            "description": f"Added coverage '{cov_name}' ({cov_cat})",
            "valid_from": v_from,
            "valid_from_iso": to_iso(v_from),
            "sys_from": cov_sys_from,
            "sys_from_iso": to_iso(cov_sys_from),
            "decision_ts": decision_ts,
            "decision_ts_iso": to_iso(decision_ts),
            "recording_delay_ms": cov_sys_from - decision_ts,
            "recording_delay_days": round((cov_sys_from - decision_ts) / (1000 * 86400), 1),
            "relationship": "ADDS",
        })

    # Step 3: Check for Policy revisions/corrections recorded after decision_ts
    late_pol_query = """
    MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)
    WHERE p.valid_from <= $incident_ts AND $incident_ts < p.valid_to
      AND p.sys_from   > $decision_ts
      AND $decision_ts < p.sys_to
    RETURN p.id, p.policy_number, p.valid_from, p.sys_from, p.deductible, p.coverage_limit
    """
    pol_res = g.query(
        late_pol_query,
        params={"claim_id": claim_id, "incident_ts": incident_ts, "decision_ts": decision_ts},
    )

    for row in pol_res.result_set:
        p_id, p_num, v_from, s_from, ded, lim = row
        delay_ms = s_from - decision_ts
        late_facts.append({
            "entity_type": "Policy",
            "id": p_id,
            "description": f"Policy revision for {p_num} (deductible: ${ded}, limit: ${lim})",
            "valid_from": v_from,
            "valid_from_iso": to_iso(v_from),
            "sys_from": s_from,
            "sys_from_iso": to_iso(s_from),
            "decision_ts": decision_ts,
            "decision_ts_iso": to_iso(decision_ts),
            "recording_delay_ms": delay_ms,
            "recording_delay_days": round(delay_ms / (1000 * 86400), 1),
            "relationship": "FILED_AGAINST",
        })

    return late_facts
