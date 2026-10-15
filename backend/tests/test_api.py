"""Integration tests for AsOf REST API endpoints."""

import pytest
from fastapi.testclient import TestClient
from backend.app.api.main import app
from backend.app.db.temporal import to_epoch_ms

client = TestClient(app)


def test_api_health():
    """Verify GET /health returns database status and metadata."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["app"] == "AsOf"
    assert data["database"] == "FalkorDB"
    assert data["falkordb_connected"] is True


def test_api_list_claims():
    """Verify GET /claims returns paginated claims with metadata and queries."""
    res = client.get("/claims?limit=10&skip=0")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 10
    assert len(data["claims"]) == 10
    assert len(data["queries"]) >= 1

    claim = data["claims"][0]
    assert "id" in claim
    assert "claim_number" in claim
    assert "claim_type" in claim
    assert "amount" in claim
    assert "status" in claim


def test_api_get_claim_detail():
    """Verify GET /claims/{id} returns rich claim details, policy, and UI graph."""
    res = client.get("/claims/CLM-HERO-001")
    assert res.status_code == 200
    data = res.json()
    assert data["claim"]["id"] == "CLM-HERO-001"
    assert data["policy"]["id"] == "POL-HERO-001"
    assert data["policyholder"]["name"] == "Diana Prince"
    assert len(data["queries"]) >= 1

    graph = data["graph"]
    assert len(graph["nodes"]) > 0
    assert len(graph["edges"]) > 0
    node_ids = {n["id"] for n in graph["nodes"]}
    assert "CLM-HERO-001" in node_ids
    assert "POL-HERO-001" in node_ids


def test_api_claim_as_of_hero_flip_and_temporal_states():
    """Verify GET /claims/{id}/as-of accurately reflects knowledge states:
    - At June 8: Denied, endorsement node state is 'not_yet_known'
    - At June 11: Approved, endorsement node state is 'known'
    """
    tv_incident = "2026-06-05T14:30:00Z"
    ts_june8 = "2026-06-08T11:00:00Z"
    ts_june11 = "2026-06-11T12:00:00Z"

    # 1. Evaluate at June 8
    res_june8 = client.get(f"/claims/CLM-HERO-001/as-of?tv={tv_incident}&ts={ts_june8}")
    assert res_june8.status_code == 200
    data_june8 = res_june8.json()
    assert data_june8["decision"]["outcome"] == "DENIED"
    assert data_june8["coverage"]["covered"] is False
    assert len(data_june8["queries"]) >= 2

    # Check UI graph state at June 8: Endorsement was recorded June 10, so it must be 'not_yet_known'
    nodes_june8 = {n["id"]: n for n in data_june8["graph"]["nodes"]}
    if "END-HERO-001" in nodes_june8:
        assert nodes_june8["END-HERO-001"]["state"] == "not_yet_known"

    # 2. Evaluate at June 11
    res_june11 = client.get(f"/claims/CLM-HERO-001/as-of?tv={tv_incident}&ts={ts_june11}")
    assert res_june11.status_code == 200
    data_june11 = res_june11.json()
    assert data_june11["decision"]["outcome"] == "APPROVED"
    assert data_june11["coverage"]["covered"] is True
    assert len(data_june11["queries"]) >= 2

    # Check UI graph state at June 11: Endorsement was recorded June 10, so it must be 'known'
    nodes_june11 = {n["id"]: n for n in data_june11["graph"]["nodes"]}
    assert "END-HERO-001" in nodes_june11
    assert nodes_june11["END-HERO-001"]["state"] == "known"


def test_api_claim_replay():
    """Verify GET /claims/{id}/replay compares decision at decision_ts vs current_ts."""
    ts_june8 = "2026-06-08T11:00:00Z"
    ts_june11 = "2026-06-11T12:00:00Z"

    res = client.get(f"/claims/CLM-HERO-001/replay?decision_ts={ts_june8}&current_ts={ts_june11}")
    assert res.status_code == 200
    data = res.json()
    assert data["claim_id"] == "CLM-HERO-001"
    assert data["outcome_changed"] is True
    assert data["decision_as_made"]["outcome"] == "DENIED"
    assert data["decision_as_now_known"]["outcome"] == "APPROVED"
    assert len(data["late_facts"]) >= 2
    assert len(data["queries"]) >= 2


def test_api_post_decide_dry_run():
    """Verify POST /claims/{id}/decide evaluates decision without mutating graph when dry_run=True."""
    payload = {
        "tv": "2026-06-05T14:30:00Z",
        "ts": "2026-06-11T12:00:00Z",
        "dry_run": True,
    }
    res = client.post("/claims/CLM-HERO-001/decide", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["persisted"] is False
    assert data["decision"]["outcome"] == "APPROVED"
    assert len(data["queries"]) >= 1
    assert "graph" in data


def test_api_post_flag_claim():
    """Verify POST /claims/{id}/flag attaches ReviewFlag node in FalkorDB."""
    payload = {
        "reason": "Suspected coordinate anomaly requiring manual adjuster review",
        "flag_type": "AUDIT_ESCALATION",
    }
    res = client.post("/claims/CLM-HERO-001/flag", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["claim_id"] == "CLM-HERO-001"
    assert data["reason"] == payload["reason"]
    assert len(data["queries"]) >= 1


def test_api_fraud_clusters():
    """Verify GET /fraud/clusters detects suspicious clusters and returns UI graph payload."""
    ts_late_may = "2026-05-25T00:00:00Z"
    res = client.get(f"/fraud/clusters?ts={ts_late_may}&min_claims=4")
    assert res.status_code == 200
    data = res.json()
    assert data["total_clusters"] >= 1
    assert data["suspicious_clusters"] >= 1
    assert len(data["queries"]) >= 1

    ring = next(c for c in data["clusters"] if c["is_suspicious"])
    assert ring["total_claims"] == 8
    assert ring["total_providers"] == 3
    assert ring["total_shops"] == 3
    assert ring["graph"] is not None
    assert len(ring["graph"]["nodes"]) >= 14  # 8 claims + 3 providers + 3 shops


def test_api_fraud_cluster_timing():
    """Verify GET /fraud/clusters/{id}/timing returns earliest detectable threshold."""
    # First get clusters to obtain the suspicious cluster_id
    res_clusters = client.get("/fraud/clusters?ts=2026-05-25T00:00:00Z&min_claims=4")
    assert res_clusters.status_code == 200
    ring = next(c for c in res_clusters.json()["clusters"] if c["is_suspicious"])
    cluster_id = ring["cluster_id"]

    res_timing = client.get(f"/fraud/clusters/{cluster_id}/timing")
    assert res_timing.status_code == 200
    timing_data = res_timing.json()
    assert timing_data["cluster_id"] == cluster_id
    assert timing_data["first_detectable_ts"] == to_epoch_ms("2026-05-16T09:00:00Z")
    assert timing_data["triggering_claim_id"] == "CLM-RING-05"
    assert len(timing_data["queries"]) >= 1
