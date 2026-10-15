"""Spike proving the Hero Scenario flips in FalkorDB based on system knowledge time ($ts).

Scenario Specification:
- Endorsement effective June 1, 2026 (valid_from), recorded June 10, 2026 (sys_from).
- Claim filed for a June 5, 2026 incident (tv).
- Historical decision made on June 8, 2026 (ts).
- At system time June 8: Denial is 100% correct (endorsement was unknown to system).
- At system time June 11: Claim must be APPROVED (endorsement is now known and covers June 5).
"""

from backend.app.db.connection import get_graph
from backend.app.db.temporal import to_epoch_ms


def test_hero_scenario_flips_in_falkordb():
    """Verify that FalkorDB correctly returns no coverage at ts=June 8 and full coverage at ts=June 11."""
    g = get_graph()

    claim_id = "CLM-HERO-001"
    tv_incident = to_epoch_ms("2026-06-05T14:30:00Z")
    ts_denial = to_epoch_ms("2026-06-08T11:00:00Z")
    ts_replay = to_epoch_ms("2026-06-11T12:00:00Z")

    # Parameterized multi-hop traversal query checking coverage via Policy or Endorsement
    # Path: (Claim)-[:FILED_AGAINST]->(Policy)-[:AMENDED_BY]->(Endorsement)-[:ADDS]->(Coverage)
    # Using strict bi-temporal predicate:
    #   valid_from <= $tv < valid_to AND sys_from <= $ts < sys_to
    query_endorsement_coverage = """
    MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)
    MATCH (p)-[a:AMENDED_BY]->(e:Endorsement)-[ad:ADDS]->(cov:Coverage)
    WHERE a.valid_from <= $tv AND $tv < a.valid_to
      AND a.sys_from   <= $ts AND $ts < a.sys_to
      AND e.valid_from <= $tv AND $tv < e.valid_to
      AND e.sys_from   <= $ts AND $ts < e.sys_to
      AND ad.valid_from <= $tv AND $tv < ad.valid_to
      AND ad.sys_from   <= $ts AND $ts < ad.sys_to
      AND cov.valid_from <= $tv AND $tv < cov.valid_to
      AND cov.sys_from   <= $ts AND $ts < cov.sys_to
      AND cov.category = c.claim_type
    RETURN c.id, c.claim_type, p.id, e.id, cov.id, cov.category
    """

    # Also check base policy coverage: (Policy)-[:COVERS]->(Coverage)
    query_base_coverage = """
    MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)
    MATCH (p)-[r:COVERS]->(cov:Coverage)
    WHERE r.valid_from <= $tv AND $tv < r.valid_to
      AND r.sys_from   <= $ts AND $ts < r.sys_to
      AND cov.valid_from <= $tv AND $tv < cov.valid_to
      AND cov.sys_from   <= $ts AND $ts < cov.sys_to
      AND cov.category = c.claim_type
    RETURN c.id, cov.id
    """

    # 1. EVALUATION AT DECISION TIME (June 8, 2026)
    # At this time, the endorsement had not yet been recorded (sys_from is June 10)
    base_res_june8 = g.query(query_base_coverage, params={"claim_id": claim_id, "tv": tv_incident, "ts": ts_denial})
    end_res_june8 = g.query(query_endorsement_coverage, params={"claim_id": claim_id, "tv": tv_incident, "ts": ts_denial})

    has_coverage_at_june8 = (len(base_res_june8.result_set) > 0) or (len(end_res_june8.result_set) > 0)
    decision_at_june8 = "APPROVED" if has_coverage_at_june8 else "DENIED"

    print("\n--- HERO SPIKE EVALUATION AT June 8, 2026 ($ts) ---")
    print(f"Base coverage matches: {len(base_res_june8.result_set)}")
    print(f"Endorsement coverage matches: {len(end_res_june8.result_set)}")
    print(f"Verdict as known on June 8: {decision_at_june8}")
    assert decision_at_june8 == "DENIED", f"Expected DENIED on June 8, got {decision_at_june8}"

    # 2. EVALUATION AT REPLAY TIME (June 11, 2026)
    # At this time, the endorsement is known (sys_from June 10 <= June 11)
    # and its real-world validity covers the June 5 incident (valid_from June 1 <= June 5)
    base_res_june11 = g.query(query_base_coverage, params={"claim_id": claim_id, "tv": tv_incident, "ts": ts_replay})
    end_res_june11 = g.query(query_endorsement_coverage, params={"claim_id": claim_id, "tv": tv_incident, "ts": ts_replay})

    has_coverage_at_june11 = (len(base_res_june11.result_set) > 0) or (len(end_res_june11.result_set) > 0)
    decision_at_june11 = "APPROVED" if has_coverage_at_june11 else "DENIED"

    print("\n--- HERO SPIKE EVALUATION AT June 11, 2026 ($ts) ---")
    print(f"Base coverage matches: {len(base_res_june11.result_set)}")
    print(f"Endorsement coverage matches: {len(end_res_june11.result_set)}")
    print(f"Matched Endorsement Path: {end_res_june11.result_set[0] if end_res_june11.result_set else 'None'}")
    print(f"Verdict as known on June 11: {decision_at_june11}")
    assert decision_at_june11 == "APPROVED", f"Expected APPROVED on June 11, got {decision_at_june11}"

    print("\nSUCCESS: FalkorDB spike proved hero scenario decision flips from DENIED to APPROVED!")


if __name__ == "__main__":
    test_hero_scenario_flips_in_falkordb()
