"""Deterministic claims decision engine and replay comparison for AsOf."""

from typing import Any, Dict, List, Optional
from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, to_iso
from backend.app.queries.coverage import resolve_coverage_as_of
from backend.app.queries.fraud import detect_provider_clusters
from backend.app.queries.late_facts import find_late_facts


def decide_claim(claim_id: str, tv: int, ts: int) -> Dict[str, Any]:
    """Deterministically decide claim outcome (approve / deny / escalate) as-of (tv, ts).
    
    Decision Rules:
    1. Fraud & Network Integrity: If claim connects to a suspicious provider/shop cluster as of $ts,
       outcome is ESCALATE for Special Investigation Unit (SIU) review.
    2. Coverage Traversal: Evaluates multi-hop path (Claim -> Policy -> Endorsement -> Coverage)
       using strict bi-temporal validity (valid_from <= $tv < valid_to AND sys_from <= $ts < sys_to).
    3. If active coverage is found and amount <= limit, outcome is APPROVED.
    4. If no active coverage is found for loss type, outcome is DENIED.
    5. Discovers any late facts recorded after $ts.
    """
    g = get_graph()

    # Step 1: Check basic claim details
    c_query = "MATCH (c:Claim {id: $claim_id}) RETURN c.id, c.claim_type, c.amount, c.valid_from LIMIT 1"
    c_res = g.query(c_query, params={"claim_id": claim_id})
    if not c_res.result_set:
        return {
            "claim_id": claim_id,
            "outcome": "DENIED",
            "reasons": [f"Claim '{claim_id}' not found in database."],
            "evidence_path": [],
            "late_facts": [],
            "tv": tv,
            "ts": ts,
        }

    claim_amount = c_res.result_set[0][2]

    # Step 2: Check for Fraud Cluster affiliation as-of $ts
    # Check if this claim or its provider/shop belong to a cluster of >= 4 claims known by $ts
    clusters = detect_provider_clusters(min_claims=4, ts=ts)
    for cl in clusters:
        if cl["is_suspicious"]:
            claim_ids_in_cluster = {c["id"] for c in cl["claims"]}
            if claim_id in claim_ids_in_cluster:
                # Flagged for fraud ring affiliation
                reasons = [
                    f"Affiliated with suspicious provider/shop cluster '{cl['cluster_id']}'.",
                    f"Cluster links {cl['total_providers']} providers and {cl['total_shops']} shops across {cl['total_claims']} coordinated claims.",
                ]
                return {
                    "claim_id": claim_id,
                    "outcome": "ESCALATE",
                    "reasons": reasons,
                    "coverage_resolved": False,
                    "coverage_details": None,
                    "evidence_path": [
                        {"element": "node", "label": "Claim", "id": claim_id},
                        {"element": "cluster", "id": cl["cluster_id"], "size": cl["total_claims"]},
                    ],
                    "late_facts": find_late_facts(claim_id, ts),
                    "tv": tv,
                    "ts": ts,
                }

    # Step 3: Multi-hop coverage resolution
    coverage_result = resolve_coverage_as_of(claim_id, tv, ts)
    reasons = []

    if coverage_result["covered"]:
        cov = coverage_result["coverage"]
        limit = cov.get("limit", 0)

        if claim_amount > limit:
            outcome = "DENIED"
            reasons.append(
                f"Claim amount ${claim_amount:,.2f} exceeds policy coverage limit of ${limit:,.2f} ({cov['name']})."
            )
        else:
            outcome = "APPROVED"
            reasons.append(
                f"Active coverage confirmed: '{cov['name']}' covers '{cov['category']}' up to limit ${limit:,.2f}."
            )
            if coverage_result.get("source_type") == "endorsement":
                reasons.append(
                    f"Coverage provided via Endorsement '{cov['via_endorsement']['id']}' ({cov['via_endorsement']['description']})."
                )
    else:
        outcome = "DENIED"
        reasons.append(coverage_result["reason"])

    # Step 4: Find late facts recorded after $ts
    late_facts = find_late_facts(claim_id, ts)

    return {
        "claim_id": claim_id,
        "outcome": outcome,
        "reasons": reasons,
        "coverage_resolved": coverage_result["covered"],
        "coverage_details": coverage_result.get("coverage"),
        "evidence_path": coverage_result.get("evidence_path", []),
        "late_facts": late_facts,
        "tv": tv,
        "tv_iso": to_iso(tv),
        "ts": ts,
        "ts_iso": to_iso(ts),
    }


def replay_decision(
    claim_id: str,
    current_ts: Optional[int] = None,
    decision_ts: Optional[int] = None,
) -> Dict[str, Any]:
    """Compare the historical decision as made with the decision as now known.
    
    Cypher Query Explanation:
    1. Retrieves the original Decision node recorded for this claim along with its historical
       transaction time ($decision_ts = d.sys_from) and the incident valid time ($tv = c.valid_from).
    2. Runs decide_claim() as of the historical decision time (ts = d.sys_from).
    3. Runs decide_claim() as of current system time (ts = current_ts or SENTINEL_MAX).
    4. Compares the two verdicts and explains whether retroactive facts changed the outcome.
    """
    g = get_graph()
    target_current_ts = current_ts if current_ts is not None else SENTINEL_MAX

    # Step 1: Query historical decision and incident timestamp
    hist_query = """
    MATCH (d:Decision)-[:DECIDES]->(c:Claim {id: $claim_id})
    RETURN d.id, d.outcome, d.reason, d.sys_from, c.valid_from, c.claim_type
    ORDER BY d.sys_from DESC
    LIMIT 1
    """
    res = g.query(hist_query, params={"claim_id": claim_id})

    if not res.result_set:
        # Fallback if no decision node exists yet: lookup claim incident time
        claim_q = "MATCH (c:Claim {id: $claim_id}) RETURN c.valid_from, c.sys_from LIMIT 1"
        c_res = g.query(claim_q, params={"claim_id": claim_id})
        if not c_res.result_set:
            return {"error": f"Claim '{claim_id}' not found"}
        incident_tv = c_res.result_set[0][0]
        original_ts = decision_ts if decision_ts is not None else c_res.result_set[0][1]
        historical_outcome = "PENDING"
    else:
        row = res.result_set[0]
        historical_outcome = row[1]
        original_ts = decision_ts if decision_ts is not None else row[3]
        incident_tv = row[4]

    # Step 2: Evaluate decision at original decision time
    decision_then = decide_claim(claim_id, tv=incident_tv, ts=original_ts)

    # Step 3: Evaluate decision at latest/current system time
    decision_now = decide_claim(claim_id, tv=incident_tv, ts=target_current_ts)

    outcome_changed = decision_then["outcome"] != decision_now["outcome"]

    # Step 4: Discovered facts that entered the system after original decision time
    late_facts = find_late_facts(claim_id, decision_ts=original_ts)
    if outcome_changed:
        explanation = (
            f"Verdict changed from {decision_then['outcome']} to {decision_now['outcome']}. "
            f"At historical decision time ({to_iso(original_ts)}), retroactive facts had not yet been recorded. "
            f"With current knowledge ({to_iso(target_current_ts)}), {len(late_facts)} late fact(s) became known "
            f"that were valid at the time of loss ({to_iso(incident_tv)})."
        )
    else:
        explanation = (
            f"Verdict remained {decision_now['outcome']}. "
            f"No retroactive facts altered the coverage determination between {to_iso(original_ts)} "
            f"and {to_iso(target_current_ts)}."
        )

    return {
        "claim_id": claim_id,
        "incident_ts": incident_tv,
        "incident_iso": to_iso(incident_tv),
        "decision_as_made": {
            "outcome": decision_then["outcome"],
            "decision_ts": original_ts,
            "decision_iso": to_iso(original_ts),
            "reasons": decision_then["reasons"],
            "evidence_path": decision_then["evidence_path"],
        },
        "decision_as_now_known": {
            "outcome": decision_now["outcome"],
            "replay_ts": target_current_ts,
            "replay_iso": to_iso(target_current_ts),
            "reasons": decision_now["reasons"],
            "evidence_path": decision_now["evidence_path"],
        },
        "outcome_changed": outcome_changed,
        "late_facts": late_facts,
        "explanation": explanation,
    }
