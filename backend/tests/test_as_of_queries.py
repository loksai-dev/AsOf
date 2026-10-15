"""Unit and integration tests for AsOf core query engine."""

import pytest
from backend.app.db.temporal import to_epoch_ms
from backend.app.queries.policy import get_policy_as_of
from backend.app.queries.coverage import resolve_coverage_as_of
from backend.app.queries.late_facts import find_late_facts
from backend.app.queries.fraud import detect_provider_clusters, get_cluster_first_detectable
from backend.app.queries.decision import decide_claim, replay_decision


def test_hero_coverage_resolution():
    """Test that CLM-HERO-001 coverage fails at ts=June 8 and resolves at ts=June 11."""
    claim_id = "CLM-HERO-001"
    tv_incident = to_epoch_ms("2026-06-05T14:30:00Z")
    ts_june8 = to_epoch_ms("2026-06-08T11:00:00Z")
    ts_june11 = to_epoch_ms("2026-06-11T12:00:00Z")

    # At decision time June 8: Endorsement was recorded June 10, so it must not resolve
    res_june8 = resolve_coverage_as_of(claim_id, tv=tv_incident, ts=ts_june8)
    assert res_june8["covered"] is False
    assert res_june8["source_type"] is None

    # At replay time June 11: Endorsement was recorded June 10 and was effective June 1
    res_june11 = resolve_coverage_as_of(claim_id, tv=tv_incident, ts=ts_june11)
    assert res_june11["covered"] is True
    assert res_june11["source_type"] == "endorsement"
    assert res_june11["coverage"]["id"] == "COV-HERO-WATER"

    # Verify evidence path has 7 hops (Claim -> FILED_AGAINST -> Policy -> AMENDED_BY -> Endorsement -> ADDS -> Coverage)
    path = res_june11["evidence_path"]
    assert len(path) == 7
    assert path[0]["label"] == "Claim"
    assert path[2]["label"] == "Policy"
    assert path[4]["label"] == "Endorsement"
    assert path[6]["label"] == "Coverage"


def test_hero_decision_and_replay():
    """Test deterministic decision logic and replay comparison for the Hero scenario."""
    claim_id = "CLM-HERO-001"
    tv_incident = to_epoch_ms("2026-06-05T14:30:00Z")
    ts_june8 = to_epoch_ms("2026-06-08T11:00:00Z")
    ts_june11 = to_epoch_ms("2026-06-11T12:00:00Z")

    # Decide at June 8
    dec_june8 = decide_claim(claim_id, tv=tv_incident, ts=ts_june8)
    assert dec_june8["outcome"] == "DENIED"

    # Decide at June 11
    dec_june11 = decide_claim(claim_id, tv=tv_incident, ts=ts_june11)
    assert dec_june11["outcome"] == "APPROVED"

    # Replay comparison
    replay = replay_decision(claim_id, current_ts=ts_june11)
    assert replay["outcome_changed"] is True
    assert replay["decision_as_made"]["outcome"] == "DENIED"
    assert replay["decision_as_now_known"]["outcome"] == "APPROVED"
    assert len(replay["late_facts"]) >= 2


def test_find_late_facts_hero():
    """Verify late facts discovery finds endorsement facts recorded after June 8."""
    claim_id = "CLM-HERO-001"
    ts_june8 = to_epoch_ms("2026-06-08T11:00:00Z")

    late_facts = find_late_facts(claim_id, decision_ts=ts_june8)
    assert len(late_facts) >= 2

    fact_ids = [f["id"] for f in late_facts]
    assert "END-HERO-001" in fact_ids
    assert "COV-HERO-WATER" in fact_ids

    end_fact = next(f for f in late_facts if f["id"] == "END-HERO-001")
    assert end_fact["sys_from"] > ts_june8
    assert end_fact["recording_delay_days"] > 0


def test_get_policy_as_of_temporal_awareness():
    """Verify get_policy_as_of respects system time ($ts) for endorsements."""
    policy_id = "POL-HERO-001"
    tv_june5 = to_epoch_ms("2026-06-05T14:30:00Z")
    ts_june8 = to_epoch_ms("2026-06-08T11:00:00Z")
    ts_june11 = to_epoch_ms("2026-06-11T12:00:00Z")

    # June 8: Endorsement not yet recorded
    pol_june8 = get_policy_as_of(policy_id, tv=tv_june5, ts=ts_june8)
    assert pol_june8 is not None
    assert len(pol_june8["endorsements"]) == 0
    assert len(pol_june8["base_coverages"]) == 2

    # June 11: Endorsement recorded on June 10 is visible
    pol_june11 = get_policy_as_of(policy_id, tv=tv_june5, ts=ts_june11)
    assert pol_june11 is not None
    assert len(pol_june11["endorsements"]) == 1
    assert pol_june11["endorsements"][0]["endorsement_id"] == "END-HERO-001"


def test_late_filed_claim_scenario():
    """Test that CLM-LATE-001 (incident March 15, filed August 15) is approved at incident tv."""
    claim_id = "CLM-LATE-001"
    tv_incident = to_epoch_ms("2026-03-15T16:00:00Z")
    ts_filing = to_epoch_ms("2026-08-15T10:00:00Z")

    dec = decide_claim(claim_id, tv=tv_incident, ts=ts_filing)
    assert dec["outcome"] == "APPROVED"
    assert dec["coverage_resolved"] is True


def test_fraud_ring_clustering_and_escalation():
    """Verify provider/shop clustering identifies the seeded ring and flags ring claims."""
    # Detect clusters as of late May
    ts_late_may = to_epoch_ms("2026-05-25T00:00:00Z")
    clusters = detect_provider_clusters(min_claims=4, ts=ts_late_may)

    assert len(clusters) >= 1
    ring_cluster = next(c for c in clusters if c["is_suspicious"])
    assert ring_cluster["total_claims"] == 8
    assert ring_cluster["total_providers"] == 3
    assert ring_cluster["total_shops"] == 3

    # First detectable time check
    detectable = get_cluster_first_detectable(ring_cluster["cluster_id"])
    assert detectable["first_detectable_ts"] == to_epoch_ms("2026-05-16T09:00:00Z")

    # Ring claim should ESCALATE
    ring_dec = decide_claim("CLM-RING-01", tv=to_epoch_ms("2026-05-11T18:00:00Z"), ts=ts_late_may)
    assert ring_dec["outcome"] == "ESCALATE"
    assert any("cluster" in r.lower() for r in ring_dec["reasons"])


def test_corrections_preserve_history():
    """Verify that both versions of POL-CORR-001 are queryable at their respective system times."""
    policy_id = "POL-CORR-001"
    tv_jan = to_epoch_ms("2026-01-15T12:00:00Z")
    ts_before_corr = to_epoch_ms("2026-02-01T12:00:00Z")
    ts_after_corr = to_epoch_ms("2026-03-01T12:00:00Z")

    # As of Feb 1: Old version with deductible $1500
    pol_v1 = get_policy_as_of(policy_id, tv=tv_jan, ts=ts_before_corr)
    assert pol_v1 is not None
    assert pol_v1["deductible"] == 1500

    # As of March 1: Corrected version with deductible $500
    pol_v2 = get_policy_as_of(policy_id, tv=tv_jan, ts=ts_after_corr)
    assert pol_v2 is not None
    assert pol_v2["deductible"] == 500
