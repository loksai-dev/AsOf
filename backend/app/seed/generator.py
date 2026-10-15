"""Synthetic bi-temporal data generator for AsOf insurance claims graph."""

import json
import random
from typing import Any, Dict, List, Tuple
from backend.app.db.temporal import SENTINEL_MAX, to_epoch_ms, to_iso

RANDOM_SEED = 42

# Predefined names for synthetic generation
FIRST_NAMES = [
    "Alexander", "Beatrice", "Carlos", "Daphne", "Ethan", "Fatima", "Gabriel",
    "Hannah", "Isaac", "Jasmine", "Kieran", "Leila", "Marcus", "Nadia",
    "Oliver", "Penelope", "Quentin", "Rachel", "Samuel", "Tara", "Ulysses",
    "Valerie", "Wyatt", "Ximena", "Yosef", "Zoe", "Arthur", "Brianna",
    "Cameron", "Devon", "Elena", "Felix", "Grace", "Henry", "Iris",
    "Julian", "Kayla", "Leo", "Maya", "Nathan", "Olivia", "Patrick",
    "Quinn", "Ruby", "Sebastian", "Thea", "Victor", "Willa", "Xavier", "Yara"
]

LAST_NAMES = [
    "Vance", "Stone", "Chen", "Sterling", "Holloway", "Cross", "Mercer",
    "Blackwood", "Sinclair", "Montgomery", "Kowalski", "O'Connor", "Ramirez",
    "Patel", "Nakamura", "Dubois", "Gallagher", "Lindqvist", "Al-Mansoor",
    "Novak", "Hawthorne", "Kovacs", "Rousseau", "Castillo", "Fletcher",
    "Winter", "Sommers", "Barrett", "Donovan", "Monroe", "Carlisle", "Adler"
]

CLAIM_TYPES = [
    ("collision", "COV-COLLISION", 2500, 12000),
    ("comprehensive", "COV-COMPREHENSIVE", 1200, 8000),
    ("glass", "COV-GLASS", 300, 1500),
    ("water_damage", "COV-WATER", 4000, 25000),
    ("bodily_injury", "COV-BODILY-INJURY", 3500, 30000),
    ("theft", "COV-COMPREHENSIVE", 5000, 22000),
    ("rental", "COV-RENTAL", 400, 2000),
    ("roadside", "COV-ROADSIDE", 150, 600),
]


def generate_synthetic_data(seed: int = RANDOM_SEED) -> Dict[str, Any]:
    """Generate deterministic bi-temporal synthetic graph dataset for 2026."""
    rng = random.Random(seed)

    policyholders: List[Dict[str, Any]] = []
    policies: List[Dict[str, Any]] = []
    endorsements: List[Dict[str, Any]] = []
    coverages: List[Dict[str, Any]] = []
    claims: List[Dict[str, Any]] = []
    providers: List[Dict[str, Any]] = []
    shops: List[Dict[str, Any]] = []
    decisions: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    ground_truth: Dict[str, Any] = {}

    # 1. Base Coverage Catalog for Auto & Property Claims
    standard_coverages = [
        {"id": "COV-COLLISION", "code": "COLL", "name": "Collision Physical Damage", "category": "collision", "limit": 50000, "deductible": 500},
        {"id": "COV-COMPREHENSIVE", "code": "COMP", "name": "Comprehensive Auto & Storm Damage", "category": "comprehensive", "limit": 50000, "deductible": 500},
        {"id": "COV-LIABILITY", "code": "LIAB", "name": "Property Damage Liability", "category": "liability", "limit": 100000, "deductible": 0},
        {"id": "COV-BODILY-INJURY", "code": "BI", "name": "Bodily Injury Liability", "category": "bodily_injury", "limit": 100000, "deductible": 0},
        {"id": "COV-GLASS", "code": "GLAS", "name": "Full Safety Glass & Windshield Coverage", "category": "glass", "limit": 2500, "deductible": 50},
        {"id": "COV-WATER", "code": "WATER", "name": "Water Damage & Flash Flood Endorsement", "category": "water_damage", "limit": 50000, "deductible": 500},
        {"id": "COV-RENTAL", "code": "RENT", "name": "Rental Vehicle Reimbursement", "category": "rental", "limit": 3000, "deductible": 0},
        {"id": "COV-ROADSIDE", "code": "ROAD", "name": "24/7 Towing & Roadside Assistance", "category": "roadside", "limit": 1000, "deductible": 0},
    ]

    jan_1_2026 = to_epoch_ms("2026-01-01T00:00:00Z")
    dec_31_2026 = to_epoch_ms("2026-12-31T23:59:59Z")

    for cov in standard_coverages:
        coverages.append({
            **cov,
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })

    # 2. Providers (Medical clinics for auto injury + Property restoration contractors)
    provider_specialties = [
        ("Orthopedic Trauma Surgery", "Medical Orthopedics"),
        ("Physical Therapy & Rehabilitation", "Physical Therapy"),
        ("Emergency Diagnostic Medicine", "Emergency Medicine"),
        ("Chiropractic & Spine Therapy", "Chiropractic"),
        ("Neurology & Traumatic Brain Diagnostics", "Neurology"),
        ("Disaster Restoration & Drying Services", "Property Restoration"),
        ("Structural & Roof Reconstruction Contractors", "Property Contractor"),
    ]

    for i in range(1, 21):
        spec, label_prefix = rng.choice(provider_specialties)
        providers.append({
            "id": f"PRV-{i:03d}",
            "name": f"{rng.choice(LAST_NAMES)} {label_prefix} Center {i}",
            "specialty": spec,
            "address": f"{100 + i * 12} Healthcare & Restoration Way, Suite {i * 10}",
            "is_synthetic": True,
        })

    # 20 regular auto collision repair & glass facilities
    shop_prefixes = [
        "Certified Collision Care",
        "Precision Paint & Body Works",
        "Vanguard Auto Restoration",
        "Apex Frame & Collision Center",
        "Metro Glass & Collision Specialists",
    ]

    for i in range(1, 21):
        prefix = rng.choice(shop_prefixes)
        shops.append({
            "id": f"SHP-{i:03d}",
            "name": f"{rng.choice(LAST_NAMES)} {prefix} {i}",
            "address": f"{200 + i * 15} Industrial Blvd, Bay {i}",
            "rating": round(rng.uniform(3.8, 4.9), 1),
            "is_synthetic": True,
        })

    # =========================================================================
    # SCENARIO 1: HERO SCENARIO (Mandatory exact specifications)
    # Policy amended by endorsement effective June 1 (valid_from) recorded June 10 (sys_from).
    # Claim on June 5 incident denied on June 8.
    # At June 8: Denial correct. At June 11: Approved!
    # =========================================================================
    hero_ph_id = "PH-HERO-001"
    hero_pol_id = "POL-HERO-001"
    hero_end_id = "END-HERO-001"
    hero_cov_id = "COV-HERO-WATER"
    hero_clm_id = "CLM-HERO-001"
    hero_dec_id = "DEC-HERO-001"

    june_1_2026 = to_epoch_ms("2026-06-01T00:00:00Z")
    june_5_2026 = to_epoch_ms("2026-06-05T14:30:00Z")
    june_6_2026 = to_epoch_ms("2026-06-06T09:15:00Z")
    june_8_2026 = to_epoch_ms("2026-06-08T11:00:00Z")
    june_10_2026 = to_epoch_ms("2026-06-10T10:00:00Z")

    policyholders.append({
        "id": hero_ph_id,
        "name": "Diana Prince",
        "email": "diana.prince@example.synthetic",
        "phone": "+1-555-019-4820",
        "is_synthetic": True,
    })

    policies.append({
        "id": hero_pol_id,
        "policy_number": "POL-2026-HERO",
        "type": "Auto Gold Package",
        "deductible": 500,
        "coverage_limit": 50000,
        "valid_from": jan_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })

    edges.append({
        "source": hero_ph_id,
        "target": hero_pol_id,
        "type": "HAS_POLICY",
        "valid_from": jan_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
    })

    # Base policy covers Collision and Liability from Jan 1, but NOT water damage
    edges.append({
        "source": hero_pol_id,
        "target": "COV-COLLISION",
        "type": "COVERS",
        "valid_from": jan_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
    })
    edges.append({
        "source": hero_pol_id,
        "target": "COV-LIABILITY",
        "type": "COVERS",
        "valid_from": jan_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
    })

    # Hero Endorsement: Effective June 1, but recorded June 10
    endorsements.append({
        "id": hero_end_id,
        "endorsement_number": "END-2026-0601-WATER",
        "description": "Flash Flood and High-Water Storm Damage Rider",
        "valid_from": june_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_10_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })

    # Endorsement adds Water Damage Coverage
    coverages.append({
        "id": hero_cov_id,
        "code": "WATER-SPECIAL",
        "name": "Comprehensive Water & Flood Damage Rider",
        "category": "water_damage",
        "limit": 35000,
        "deductible": 500,
        "valid_from": june_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_10_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })

    # Policy AMENDED_BY Endorsement: valid June 1, recorded June 10
    edges.append({
        "source": hero_pol_id,
        "target": hero_end_id,
        "type": "AMENDED_BY",
        "valid_from": june_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_10_2026,
        "sys_to": SENTINEL_MAX,
    })

    # Endorsement ADDS Coverage: valid June 1, recorded June 10
    edges.append({
        "source": hero_end_id,
        "target": hero_cov_id,
        "type": "ADDS",
        "valid_from": june_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_10_2026,
        "sys_to": SENTINEL_MAX,
    })

    # Hero Claim: Incident June 5, filed June 6
    claims.append({
        "id": hero_clm_id,
        "claim_number": "CLM-2026-HERO",
        "incident_date": "2026-06-05T14:30:00Z",
        "filing_date": "2026-06-06T09:15:00Z",
        "claim_type": "water_damage",
        "amount": 8500.0,
        "description": "Vehicle submerged in flash flood basement parking garage during heavy storm",
        "status": "denied",
        "valid_from": june_5_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_6_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })

    edges.append({
        "source": hero_clm_id,
        "target": hero_pol_id,
        "type": "FILED_AGAINST",
        "valid_from": june_5_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_6_2026,
        "sys_to": SENTINEL_MAX,
    })
    edges.append({
        "source": hero_clm_id,
        "target": "SHP-001",
        "type": "REPAIRED_AT",
        "valid_from": june_5_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_6_2026,
        "sys_to": SENTINEL_MAX,
    })

    # Historical decision recorded June 8: DENIED
    decisions.append({
        "id": hero_dec_id,
        "outcome": "DENIED",
        "reason": "Coverage for water_damage not active on policy POL-HERO-001 as of June 8 system knowledge",
        "rule_applied": "RULE_STRICT_COVERAGE_CHECK",
        "valid_from": june_5_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_8_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })
    edges.append({
        "source": hero_dec_id,
        "target": hero_clm_id,
        "type": "DECIDES",
        "valid_from": june_5_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": june_8_2026,
        "sys_to": SENTINEL_MAX,
    })

    ground_truth[hero_clm_id] = {
        "scenario": "HERO_SCENARIO",
        "incident_ts": june_5_2026,
        "decision_ts": june_8_2026,
        "replay_ts": to_epoch_ms("2026-06-11T12:00:00Z"),
        "expected_at_decision_ts": "DENIED",
        "expected_at_replay_ts": "APPROVED",
        "late_fact_count": 4,  # Endorsement node, Coverage node, AMENDED_BY edge, ADDS edge
    }

    # =========================================================================
    # SCENARIO 2: LATE-FILED CLAIM SCENARIO
    # Policy was valid Jan 1 to March 31. Incident occurred March 15 (during policy).
    # Claim filed August 15 (after policy expired).
    # Bi-temporal valid_time reveals it IS covered because accident happened within coverage window.
    # =========================================================================
    late_ph_id = "PH-LATE-001"
    late_pol_id = "POL-LATE-001"
    late_clm_id = "CLM-LATE-001"
    march_15_2026 = to_epoch_ms("2026-03-15T16:00:00Z")
    march_31_2026 = to_epoch_ms("2026-03-31T23:59:59Z")
    august_15_2026 = to_epoch_ms("2026-08-15T10:00:00Z")

    policyholders.append({
        "id": late_ph_id,
        "name": "Arthur Curry",
        "email": "arthur.curry@example.synthetic",
        "phone": "+1-555-019-7711",
        "is_synthetic": True,
    })

    policies.append({
        "id": late_pol_id,
        "policy_number": "POL-2026-Q1-TERM",
        "type": "Commercial Fleet Q1",
        "deductible": 1000,
        "coverage_limit": 100000,
        "valid_from": jan_1_2026,
        "valid_to": march_31_2026,  # Expired in real world end of March
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })

    edges.append({
        "source": late_ph_id,
        "target": late_pol_id,
        "type": "HAS_POLICY",
        "valid_from": jan_1_2026,
        "valid_to": march_31_2026,
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
    })
    edges.append({
        "source": late_pol_id,
        "target": "COV-COLLISION",
        "type": "COVERS",
        "valid_from": jan_1_2026,
        "valid_to": march_31_2026,
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
    })

    claims.append({
        "id": late_clm_id,
        "claim_number": "CLM-2026-LATE-01",
        "incident_date": "2026-03-15T16:00:00Z",
        "filing_date": "2026-08-15T10:00:00Z",
        "claim_type": "collision",
        "amount": 6200.0,
        "description": "Late-reported multi-vehicle interstate pileup occurring during Q1 term",
        "status": "pending_review",
        "valid_from": march_15_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": august_15_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })
    edges.append({
        "source": late_clm_id,
        "target": late_pol_id,
        "type": "FILED_AGAINST",
        "valid_from": march_15_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": august_15_2026,
        "sys_to": SENTINEL_MAX,
    })
    edges.append({
        "source": late_clm_id,
        "target": "SHP-002",
        "type": "REPAIRED_AT",
        "valid_from": march_15_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": august_15_2026,
        "sys_to": SENTINEL_MAX,
    })

    ground_truth[late_clm_id] = {
        "scenario": "LATE_FILED",
        "incident_ts": march_15_2026,
        "filing_ts": august_15_2026,
        "expected_at_incident_tv": "APPROVED",
        "expected_without_bitemporal": "DENIED_POLICY_EXPIRED",
    }

    # =========================================================================
    # SCENARIO 3: FRAUD RING (5 to 8 connected providers, shops and claims)
    # 3 Providers + 3 Shops = 6 entities sharing 8 coordinated claims
    # High-density cluster detectable via connected components / WCC
    # =========================================================================
    ring_providers = [
        {"id": "PRV-RING-01", "name": "Apex Spinal Trauma & Pain Diagnostics", "specialty": "Chiropractic & Trauma Pain", "address": "900 Metro Medical Plaza, Suite 101", "is_synthetic": True},
        {"id": "PRV-RING-02", "name": "Metro Integrated Physical Therapy Care", "specialty": "Physical Therapy & Rehabilitation", "address": "902 Metro Medical Plaza, Suite 200", "is_synthetic": True},
        {"id": "PRV-RING-03", "name": "Paramount Diagnostic Imaging & Neurology", "specialty": "Neurology & Soft Tissue MRI", "address": "904 Metro Medical Plaza, Suite 305", "is_synthetic": True},
    ]
    ring_shops = [
        {"id": "SHP-RING-01", "name": "Prestige Precision Auto Body & Paint", "address": "888 Commerce Industrial Way, Bay A", "rating": 2.4, "is_synthetic": True},
        {"id": "SHP-RING-02", "name": "Grand Collision Restoration & Frame Specialists", "address": "890 Commerce Industrial Way, Bay B", "rating": 2.5, "is_synthetic": True},
        {"id": "SHP-RING-03", "name": "Express Touch Certified Body Works", "address": "892 Commerce Industrial Way, Bay C", "rating": 2.3, "is_synthetic": True},
    ]

    for p in ring_providers:
        providers.append(p)
    for s in ring_shops:
        shops.append(s)

    # 8 Suspicious coordinated claims forming a bipartite / tripartite web
    ring_pairings = [
        ("PRV-RING-01", "SHP-RING-01"),
        ("PRV-RING-01", "SHP-RING-02"),
        ("PRV-RING-02", "SHP-RING-02"),
        ("PRV-RING-02", "SHP-RING-03"),
        ("PRV-RING-03", "SHP-RING-01"),
        ("PRV-RING-03", "SHP-RING-03"),
        ("PRV-RING-01", "SHP-RING-03"),
        ("PRV-RING-02", "SHP-RING-01"),
    ]

    for idx, (prv_id, shp_id) in enumerate(ring_pairings, 1):
        c_id = f"CLM-RING-{idx:02d}"
        ph_id = f"PH-RING-{idx:02d}"
        pol_id = f"POL-RING-{idx:02d}"
        inc_date = f"2026-05-{10 + idx:02d}T18:00:00Z"
        file_date = f"2026-05-{11 + idx:02d}T09:00:00Z"
        inc_ts = to_epoch_ms(inc_date)
        file_ts = to_epoch_ms(file_date)

        policyholders.append({
            "id": ph_id,
            "name": f"Syndicate Participant {idx}",
            "email": f"syndicate.{idx}@example.synthetic",
            "phone": f"+1-555-900-{idx:04d}",
            "is_synthetic": True,
        })

        policies.append({
            "id": pol_id,
            "policy_number": f"POL-RING-2026-{idx:02d}",
            "type": "Standard Auto Premium",
            "deductible": 500,
            "coverage_limit": 50000,
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })

        edges.append({
            "source": ph_id,
            "target": pol_id,
            "type": "HAS_POLICY",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })
        edges.append({
            "source": pol_id,
            "target": "COV-COLLISION",
            "type": "COVERS",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })
        edges.append({
            "source": pol_id,
            "target": "COV-BODILY-INJURY",
            "type": "COVERS",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })

        claims.append({
            "id": c_id,
            "claim_number": f"CLM-2026-RING-{idx:02d}",
            "incident_date": inc_date,
            "filing_date": file_date,
            "claim_type": "collision",
            "amount": 14850.0 + idx * 50.0,
            "description": f"Staged low-speed rear collision with maximum soft tissue injury billing pattern #{idx}",
            "status": "flagged_fraud",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })

        edges.append({
            "source": c_id,
            "target": pol_id,
            "type": "FILED_AGAINST",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
        })
        edges.append({
            "source": c_id,
            "target": prv_id,
            "type": "HANDLED_BY",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
        })
        edges.append({
            "source": c_id,
            "target": shp_id,
            "type": "REPAIRED_AT",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
        })

        ground_truth[c_id] = {
            "scenario": "FRAUD_RING",
            "is_fraud": True,
            "provider": prv_id,
            "shop": shp_id,
            "expected_decision": "ESCALATE",
            "reason": "Connected provider-shop fraud cluster detected",
        }

    # Ground truth summary for fraud ring
    ground_truth["fraud_ring_metadata"] = {
        "provider_ids": ["PRV-RING-01", "PRV-RING-02", "PRV-RING-03"],
        "shop_ids": ["SHP-RING-01", "SHP-RING-02", "SHP-RING-03"],
        "claim_ids": [f"CLM-RING-{idx:02d}" for idx in range(1, 9)],
        "first_detectable_ts": to_epoch_ms("2026-05-16T09:00:00Z"),
        "first_detectable_iso": "2026-05-16T09:00:00Z",
    }

    # =========================================================================
    # SCENARIO 4: IMPACT SCENARIO (Backdated endorsement affecting 5 claims across 3 policies)
    # A backdated endorsement effective July 1, recorded July 20, adding comprehensive hail coverage.
    # 5 claims across 3 policies decided prior to July 20 were DENIED.
    # At ts > July 20, all 5 flip to APPROVED.
    # =========================================================================
    july_1_2026 = to_epoch_ms("2026-07-01T00:00:00Z")
    july_20_2026 = to_epoch_ms("2026-07-20T10:00:00Z")
    impact_end_id = "END-IMP-HAIL"
    impact_cov_id = "COV-IMP-COMP"
    impact_evt_id = "EVT-BACKDATED-HAIL"

    # Event node representing ingestion of the backdated endorsement
    events.append({
        "id": impact_evt_id,
        "event_type": "BACKDATED_ENDORSEMENT",
        "title": "Statewide Catastrophic Hail & Storm Coverage Rider",
        "endorsement_id": impact_end_id,
        "valid_from": july_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": july_20_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })

    # Endorsement node
    endorsements.append({
        "id": impact_end_id,
        "endorsement_number": "END-2026-HAIL-RIDER",
        "description": "Catastrophic Hail & Severe Windstorm Comprehensive Rider",
        "valid_from": july_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": july_20_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })

    # Coverage added by endorsement
    coverages.append({
        "id": impact_cov_id,
        "code": "COMP-HAIL",
        "name": "Catastrophic Hail & Storm Coverage",
        "category": "comprehensive",
        "limit": 40000,
        "deductible": 500,
        "valid_from": july_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": july_20_2026,
        "sys_to": SENTINEL_MAX,
        "is_synthetic": True,
    })

    edges.append({
        "source": impact_end_id,
        "target": impact_cov_id,
        "type": "ADDS",
        "valid_from": july_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": july_20_2026,
        "sys_to": SENTINEL_MAX,
    })

    # 3 Policies
    impact_policies = ["POL-IMP-001", "POL-IMP-002", "POL-IMP-003"]
    impact_holders = [
        ("PH-IMP-001", "Bruce Wayne", "bruce.wayne@example.synthetic"),
        ("PH-IMP-002", "Selina Kyle", "selina.kyle@example.synthetic"),
        ("PH-IMP-003", "Barry Allen", "barry.allen@example.synthetic"),
    ]

    for (ph_id, ph_name, ph_email), pol_id in zip(impact_holders, impact_policies):
        policyholders.append({
            "id": ph_id,
            "name": ph_name,
            "email": ph_email,
            "phone": "+1-555-777-1000",
            "is_synthetic": True,
        })
        policies.append({
            "id": pol_id,
            "policy_number": f"{pol_id}-2026",
            "type": "Auto Preferred Plus",
            "deductible": 500,
            "coverage_limit": 50000,
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })
        edges.append({
            "source": ph_id,
            "target": pol_id,
            "type": "HAS_POLICY",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })
        # Base policy only covers Collision & Liability (NO comprehensive)
        edges.append({
            "source": pol_id,
            "target": "COV-COLLISION",
            "type": "COVERS",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })
        edges.append({
            "source": pol_id,
            "target": "COV-LIABILITY",
            "type": "COVERS",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })
        # Policy is amended by the backdated endorsement
        edges.append({
            "source": pol_id,
            "target": impact_end_id,
            "type": "AMENDED_BY",
            "valid_from": july_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": july_20_2026,
            "sys_to": SENTINEL_MAX,
        })

    # 5 Claims across the 3 policies
    impact_claim_defs = [
        ("CLM-IMP-001", "POL-IMP-001", "2026-07-03T14:00:00Z", "2026-07-04T09:00:00Z", "2026-07-06T11:00:00Z", 4500.0, "Severe hail body panel damage"),
        ("CLM-IMP-002", "POL-IMP-001", "2026-07-07T16:30:00Z", "2026-07-08T10:00:00Z", "2026-07-09T14:00:00Z", 3200.0, "Fallen oak branch in storm shattered roof glass"),
        ("CLM-IMP-003", "POL-IMP-002", "2026-07-05T12:00:00Z", "2026-07-06T08:30:00Z", "2026-07-08T10:00:00Z", 5100.0, "Golf-ball sized hail shattered panoramic sunroof"),
        ("CLM-IMP-004", "POL-IMP-002", "2026-07-12T17:15:00Z", "2026-07-13T09:30:00Z", "2026-07-14T15:00:00Z", 3900.0, "Windstorm microburst hood deformation"),
        ("CLM-IMP-005", "POL-IMP-003", "2026-07-10T11:45:00Z", "2026-07-11T13:00:00Z", "2026-07-13T16:00:00Z", 6800.0, "Torrential cloudburst engine water ingestion"),
    ]

    impact_claim_ids = []
    for c_id, pol_id, inc_str, file_str, dec_str, amt, desc in impact_claim_defs:
        impact_claim_ids.append(c_id)
        inc_ts = to_epoch_ms(inc_str)
        file_ts = to_epoch_ms(file_str)
        dec_ts = to_epoch_ms(dec_str)
        dec_id = f"DEC-{c_id}"

        claims.append({
            "id": c_id,
            "claim_number": f"CLM-2026-{c_id}",
            "incident_date": inc_str,
            "filing_date": file_str,
            "claim_type": "comprehensive",
            "amount": amt,
            "description": desc,
            "status": "denied",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })
        edges.append({
            "source": c_id,
            "target": pol_id,
            "type": "FILED_AGAINST",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
        })
        edges.append({
            "source": c_id,
            "target": "SHP-003",
            "type": "REPAIRED_AT",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
        })

        # Decision as made before July 20: DENIED
        decisions.append({
            "id": dec_id,
            "outcome": "DENIED",
            "reason": "Comprehensive coverage not active on policy at decision time",
            "rule_applied": "RULE_STRICT_COVERAGE_CHECK",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": dec_ts,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })
        edges.append({
            "source": dec_id,
            "target": c_id,
            "type": "DECIDES",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": dec_ts,
            "sys_to": SENTINEL_MAX,
        })
        # Event AFFECTS Claim edge
        edges.append({
            "source": impact_evt_id,
            "target": c_id,
            "type": "AFFECTS",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": july_20_2026,
            "sys_to": SENTINEL_MAX,
        })

        ground_truth[c_id] = {
            "scenario": "IMPACT_SCENARIO",
            "incident_ts": inc_ts,
            "decision_ts": dec_ts,
            "replay_ts": to_epoch_ms("2026-07-25T12:00:00Z"),
            "expected_at_decision_ts": "DENIED",
            "expected_at_replay_ts": "APPROVED",
            "trigger_event": impact_evt_id,
        }

    ground_truth["impact_scenario_summary"] = {
        "trigger_event_id": impact_evt_id,
        "endorsement_id": impact_end_id,
        "event_valid_from": july_1_2026,
        "event_sys_from": july_20_2026,
        "affected_claim_ids": impact_claim_ids,
        "affected_policies": impact_policies,
        "prior_decision": "DENIED",
        "flipped_decision": "APPROVED",
    }

    # =========================================================================
    # SCENARIO 5: CORRECTION SCENARIO (Corrections preserve history)
    # Policy deductible was corrected on Feb 15 from $1500 to $500.
    # Old version closed with sys_to = Feb 15, new version created with sys_from = Feb 15.
    # =========================================================================
    corr_ph_id = "PH-CORR-001"
    corr_pol_id = "POL-CORR-001"
    feb_15_2026 = to_epoch_ms("2026-02-15T12:00:00Z")

    policyholders.append({
        "id": corr_ph_id,
        "name": "Clark Kent",
        "email": "clark.kent@example.synthetic",
        "phone": "+1-555-019-3388",
        "is_synthetic": True,
    })

    # Version 1 (active Jan 1 to Feb 15 in system)
    policies.append({
        "id": corr_pol_id,
        "policy_number": "POL-2026-CORR",
        "type": "Metropolis Personal Comprehensive",
        "deductible": 1500,
        "coverage_limit": 25000,
        "valid_from": jan_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": jan_1_2026,
        "sys_to": feb_15_2026,  # Closed in system on Feb 15
        "version": 1,
        "is_synthetic": True,
    })

    # Version 2 (active Feb 15 onwards in system)
    policies.append({
        "id": corr_pol_id,
        "policy_number": "POL-2026-CORR",
        "type": "Metropolis Personal Comprehensive",
        "deductible": 500,
        "coverage_limit": 50000,
        "valid_from": jan_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": feb_15_2026,  # New system record
        "sys_to": SENTINEL_MAX,
        "version": 2,
        "is_synthetic": True,
    })

    edges.append({
        "source": corr_ph_id,
        "target": corr_pol_id,
        "type": "HAS_POLICY",
        "valid_from": jan_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
    })
    edges.append({
        "source": corr_pol_id,
        "target": "COV-COLLISION",
        "type": "COVERS",
        "valid_from": jan_1_2026,
        "valid_to": SENTINEL_MAX,
        "sys_from": jan_1_2026,
        "sys_to": SENTINEL_MAX,
    })

    # =========================================================================
    # SCENARIO 4: NORMAL BACKGROUND CLAIMS AND POLICIES
    # Total policyholders ~ 50, Total claims ~ 200
    # =========================================================================
    existing_ph_count = len(policyholders)
    target_ph_count = 50

    for i in range(existing_ph_count + 1, target_ph_count + 1):
        ph_id = f"PH-{i:03d}"
        pol_id = f"POL-{i:03d}"
        fname = rng.choice(FIRST_NAMES)
        lname = rng.choice(LAST_NAMES)

        policyholders.append({
            "id": ph_id,
            "name": f"{fname} {lname}",
            "email": f"{fname.lower()}.{lname.lower()}{i}@example.synthetic",
            "phone": f"+1-555-01{i:02d}-{rng.randint(1000, 9999)}",
            "is_synthetic": True,
        })

        # Randomized standard policy
        pol_type = rng.choice(["Standard Auto", "Preferred Auto", "Commercial Van", "Family SUV"])
        deductible = rng.choice([250, 500, 1000])
        limit = rng.choice([25000, 50000, 100000])

        policies.append({
            "id": pol_id,
            "policy_number": f"POL-2026-{i:04d}",
            "type": pol_type,
            "deductible": deductible,
            "coverage_limit": limit,
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })

        edges.append({
            "source": ph_id,
            "target": pol_id,
            "type": "HAS_POLICY",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })

        # All policies get liability and collision
        edges.append({
            "source": pol_id,
            "target": "COV-LIABILITY",
            "type": "COVERS",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })
        edges.append({
            "source": pol_id,
            "target": "COV-COLLISION",
            "type": "COVERS",
            "valid_from": jan_1_2026,
            "valid_to": SENTINEL_MAX,
            "sys_from": jan_1_2026,
            "sys_to": SENTINEL_MAX,
        })

        # 50% get comprehensive, 30% get glass
        if rng.random() > 0.5:
            edges.append({
                "source": pol_id,
                "target": "COV-COMPREHENSIVE",
                "type": "COVERS",
                "valid_from": jan_1_2026,
                "valid_to": SENTINEL_MAX,
                "sys_from": jan_1_2026,
                "sys_to": SENTINEL_MAX,
            })
        if rng.random() > 0.7:
            edges.append({
                "source": pol_id,
                "target": "COV-GLASS",
                "type": "COVERS",
                "valid_from": jan_1_2026,
                "valid_to": SENTINEL_MAX,
                "sys_from": jan_1_2026,
                "sys_to": SENTINEL_MAX,
            })

    # Now generate background claims up to ~200 total claims
    existing_claims_count = len(claims)
    target_claims_count = 200
    claims_to_generate = target_claims_count - existing_claims_count

    all_pol_ids = [p["id"] for p in policies if p["id"] not in [hero_pol_id, late_pol_id] and not p["id"].startswith("POL-RING-")]

    for i in range(1, claims_to_generate + 1):
        clm_id = f"CLM-{i:03d}"
        chosen_pol = rng.choice(all_pol_ids)
        c_type, req_cov, min_amt, max_amt = rng.choice(CLAIM_TYPES)
        amount = round(rng.uniform(min_amt, max_amt), 2)

        # Spread across months Feb to Nov 2026
        month = rng.randint(2, 11)
        day = rng.randint(1, 28)
        inc_date = f"2026-{month:02d}-{day:02d}T{rng.randint(8, 20):02d}:{rng.randint(0, 59):02d}:00Z"
        inc_ts = to_epoch_ms(inc_date)
        file_lag_days = rng.randint(1, 7)
        file_ts = inc_ts + (file_lag_days * 86400 * 1000)

        # Check if chosen policy has required coverage
        has_cov = any(
            e["source"] == chosen_pol and e["target"] == req_cov
            for e in edges
        )

        expected_outcome = "APPROVED" if has_cov else "DENIED"
        status = "approved" if has_cov else "denied"

        claims.append({
            "id": clm_id,
            "claim_number": f"CLM-2026-{1000 + i}",
            "incident_date": inc_date,
            "filing_date": to_iso(file_ts),
            "claim_type": c_type,
            "amount": amount,
            "description": f"Standard claim incident #{i} for {c_type}",
            "status": status,
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })

        edges.append({
            "source": clm_id,
            "target": chosen_pol,
            "type": "FILED_AGAINST",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
        })

        # Random provider (only for medical/bodily injury) and shop
        shop = rng.choice(shops[:20])  # Normal shops, not ring
        edges.append({
            "source": clm_id,
            "target": shop["id"],
            "type": "REPAIRED_AT",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": file_ts,
            "sys_to": SENTINEL_MAX,
        })

        if c_type in ["bodily_injury", "collision"]:
            provider = rng.choice(providers[:20])  # Normal providers, not ring
            edges.append({
                "source": clm_id,
                "target": provider["id"],
                "type": "HANDLED_BY",
                "valid_from": inc_ts,
                "valid_to": SENTINEL_MAX,
                "sys_from": file_ts,
                "sys_to": SENTINEL_MAX,
            })

        # Record decision
        dec_ts = file_ts + (86400 * 1000 * rng.randint(1, 3))
        dec_id = f"DEC-{i:03d}"
        decisions.append({
            "id": dec_id,
            "outcome": expected_outcome,
            "reason": f"Automated decision based on coverage {req_cov} presence",
            "rule_applied": "RULE_STANDARD_COVERAGE_MATCH",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": dec_ts,
            "sys_to": SENTINEL_MAX,
            "is_synthetic": True,
        })
        edges.append({
            "source": dec_id,
            "target": clm_id,
            "type": "DECIDES",
            "valid_from": inc_ts,
            "valid_to": SENTINEL_MAX,
            "sys_from": dec_ts,
            "sys_to": SENTINEL_MAX,
        })

        ground_truth[clm_id] = {
            "scenario": "NORMAL",
            "incident_ts": inc_ts,
            "filing_ts": file_ts,
            "expected_decision": expected_outcome,
            "required_coverage": req_cov,
            "policy_id": chosen_pol,
        }

    return {
        "metadata": {
            "seed": seed,
            "year": 2026,
            "total_policyholders": len(policyholders),
            "total_policies": len(policies),
            "total_claims": len(claims),
            "total_providers": len(providers),
            "total_shops": len(shops),
            "total_decisions": len(decisions),
            "total_edges": len(edges),
            "is_synthetic": True,
        },
        "policyholders": policyholders,
        "policies": policies,
        "endorsements": endorsements,
        "coverages": coverages,
        "claims": claims,
        "providers": providers,
        "shops": shops,
        "decisions": decisions,
        "events": events,
        "edges": edges,
        "ground_truth": ground_truth,
    }
