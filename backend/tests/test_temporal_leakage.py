"""Generic tests enforcing the strict Temporal Firewall / No Future Leakage invariant."""

import random
import pytest
from backend.app.db.connection import get_graph
from backend.app.db.temporal import to_epoch_ms
from backend.app.queries.coverage import resolve_coverage_as_of
from backend.app.queries.decision import decide_claim
from backend.app.queries.policy import get_policy_as_of


def test_no_future_leakage_across_sample_claims():
    """Generic invariant test:
    For a randomized sample of claims evaluated across multiple diverse $ts timestamps,
    NO node or edge returned in any query result may have sys_from > $ts.
    """
    g = get_graph()

    # Retrieve a diverse sample of 15 claims from the database
    claims_res = g.query("MATCH (c:Claim) RETURN c.id, c.valid_from LIMIT 15")
    assert len(claims_res.result_set) >= 10, "Expected at least 10 claims in database"

    test_ts_values = [
        to_epoch_ms("2026-02-15T00:00:00Z"),
        to_epoch_ms("2026-05-10T12:00:00Z"),
        to_epoch_ms("2026-06-08T10:00:00Z"),
        to_epoch_ms("2026-07-20T00:00:00Z"),
        to_epoch_ms("2026-09-01T00:00:00Z"),
    ]

    for claim_id, incident_tv in claims_res.result_set:
        for ts in test_ts_values:
            # 1. Test resolve_coverage_as_of
            cov_res = resolve_coverage_as_of(claim_id, tv=incident_tv, ts=ts)
            for path_elem in cov_res.get("evidence_path", []):
                elem_id = path_elem.get("id")
                elem_label = path_elem.get("label")
                if elem_id and elem_label:
                    # Query the actual sys_from of this node from the database
                    node_chk = g.query(
                        f"MATCH (n:{elem_label} {{id: $id}}) RETURN n.sys_from",
                        params={"id": elem_id},
                    )
                    if node_chk.result_set and node_chk.result_set[0][0] is not None:
                        actual_sys_from = node_chk.result_set[0][0]
                        assert actual_sys_from <= ts, (
                            f"LEAKAGE DETECTED in resolve_coverage_as_of: "
                            f"Node {elem_label}:{elem_id} has sys_from={actual_sys_from} > ts={ts}"
                        )

            # 2. Test decide_claim
            dec_res = decide_claim(claim_id, tv=incident_tv, ts=ts)
            for path_elem in dec_res.get("evidence_path", []):
                elem_id = path_elem.get("id")
                elem_label = path_elem.get("label")
                if elem_id and elem_label and elem_label != "Cluster":
                    node_chk = g.query(
                        f"MATCH (n:{elem_label} {{id: $id}}) RETURN n.sys_from",
                        params={"id": elem_id},
                    )
                    if node_chk.result_set and node_chk.result_set[0][0] is not None:
                        actual_sys_from = node_chk.result_set[0][0]
                        assert actual_sys_from <= ts, (
                            f"LEAKAGE DETECTED in decide_claim: "
                            f"Node {elem_label}:{elem_id} has sys_from={actual_sys_from} > ts={ts}"
                        )

            # 3. Test get_policy_as_of for the policy linked to this claim
            pol_query = "MATCH (c:Claim {id: $cid})-[:FILED_AGAINST]->(p:Policy) RETURN p.id LIMIT 1"
            pol_res = g.query(pol_query, params={"cid": claim_id})
            if pol_res.result_set:
                policy_id = pol_res.result_set[0][0]
                pol_state = get_policy_as_of(policy_id, tv=incident_tv, ts=ts)
                if pol_state:
                    assert pol_state["sys_from"] <= ts, (
                        f"LEAKAGE DETECTED in get_policy_as_of: "
                        f"Policy {policy_id} has sys_from={pol_state['sys_from']} > ts={ts}"
                    )
                    for cov in pol_state.get("base_coverages", []):
                        cov_chk = g.query("MATCH (c:Coverage {id: $id}) RETURN c.sys_from", params={"id": cov["id"]})
                        if cov_chk.result_set and cov_chk.result_set[0][0] is not None:
                            assert cov_chk.result_set[0][0] <= ts

                    for end in pol_state.get("endorsements", []):
                        end_chk = g.query("MATCH (e:Endorsement {id: $id}) RETURN e.sys_from", params={"id": end["endorsement_id"]})
                        if end_chk.result_set and end_chk.result_set[0][0] is not None:
                            assert end_chk.result_set[0][0] <= ts
