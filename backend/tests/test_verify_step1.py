"""Verification script for Step 1: docker-compose + schema + seed."""

from backend.app.db.connection import get_graph
from backend.app.db.temporal import to_epoch_ms


def test_step1():
    g = get_graph()

    # 1. Check index count
    idx_res = g.query("CALL db.indexes()")
    total_indexed_props = sum(len(r[1]) for r in idx_res.result_set)
    print(f"Total active index labels: {len(idx_res.result_set)}, total indexed properties: {total_indexed_props}")
    assert total_indexed_props >= 29, f"Expected at least 29 indexed properties, got {total_indexed_props}"

    # 2. Check Hero scenario claim and policy
    hero_res = g.query(
        "MATCH (c:Claim {id: $cid})-[:FILED_AGAINST]->(p:Policy) RETURN c.id, c.claim_type, p.id",
        params={"cid": "CLM-HERO-001"},
    )
    assert len(hero_res.result_set) == 1
    print(f"Hero Claim found: {hero_res.result_set[0]}")

    # 3. Check Hero Endorsement and Coverage
    end_res = g.query(
        "MATCH (p:Policy {id: 'POL-HERO-001'})-[r1:AMENDED_BY]->(e:Endorsement)-[r2:ADDS]->(cov:Coverage) "
        "RETURN e.id, e.valid_from, e.sys_from, cov.category"
    )
    assert len(end_res.result_set) == 1
    row = end_res.result_set[0]
    print(f"Hero Endorsement: ID={row[0]}, valid_from={row[1]}, sys_from={row[2]}, cov={row[3]}")

    june_1 = to_epoch_ms("2026-06-01T00:00:00Z")
    june_10 = to_epoch_ms("2026-06-10T10:00:00Z")
    assert row[1] == june_1, f"Expected valid_from {june_1}, got {row[1]}"
    assert row[2] == june_10, f"Expected sys_from {june_10}, got {row[2]}"

    # 4. Check Fraud Ring claims
    ring_res = g.query(
        "MATCH (c:Claim)-[:HANDLED_BY]->(prv:Provider) "
        "WHERE prv.id STARTS WITH 'PRV-RING' "
        "RETURN count(c)"
    )
    print(f"Fraud Ring claims handled by ring providers: {ring_res.result_set[0][0]}")
    assert ring_res.result_set[0][0] == 8

    # 5. Check Late-filed claim
    late_res = g.query(
        "MATCH (c:Claim {id: 'CLM-LATE-001'})-[:FILED_AGAINST]->(p:Policy) "
        "RETURN c.incident_date, c.filing_date, p.valid_to"
    )
    assert len(late_res.result_set) == 1
    print(f"Late-filed claim found: {late_res.result_set[0]}")

    # 6. Check Correction Scenario (history preservation)
    corr_res = g.query(
        "MATCH (p:Policy {id: 'POL-CORR-001'}) "
        "RETURN p.version, p.deductible, p.sys_from, p.sys_to ORDER BY p.version"
    )
    assert len(corr_res.result_set) == 2
    print(f"Correction versions preserved in graph:")
    for v in corr_res.result_set:
        print(f"  Version {v[0]}: deductible=${v[1]}, sys_from={v[2]}, sys_to={v[3]}")

    print("\nALL STEP 1 VERIFICATIONS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_step1()
