"""Database seeding script for AsOf bi-temporal claims graph."""

import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional

from backend.app.db.connection import get_graph, settings
from backend.app.db.schema import clear_graph, init_schema
from backend.app.seed.generator import RANDOM_SEED, generate_synthetic_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def seed_database(graph_name: Optional[str] = None, seed: int = RANDOM_SEED) -> Dict[str, int]:
    """Wipe and re-seed the bi-temporal insurance graph with synthetic 2026 data."""
    target_graph = graph_name or settings.falkordb_graph
    logger.info("Starting database seed on graph '%s' with random seed %d...", target_graph, seed)

    # 1. Clear existing graph
    clear_graph(target_graph)

    # 2. Initialize schema & range indexes
    init_schema(target_graph)

    # 3. Generate deterministic dataset
    data = generate_synthetic_data(seed=seed)
    g = get_graph(target_graph)

    # 4. Insert Nodes in batches
    node_collections = [
        ("Policyholder", data["policyholders"]),
        ("Policy", data["policies"]),
        ("Endorsement", data["endorsements"]),
        ("Coverage", data["coverages"]),
        ("Claim", data["claims"]),
        ("Provider", data["providers"]),
        ("Shop", data["shops"]),
        ("Decision", data["decisions"]),
        ("Event", data.get("events", [])),
    ]

    stats = {}
    for label, items in node_collections:
        if not items:
            continue
        query = f"UNWIND $batch AS item CREATE (n:{label}) SET n = item"
        g.query(query, params={"batch": items})
        stats[f"nodes_{label}"] = len(items)
        logger.info("Inserted %d nodes of label :%s", len(items), label)

    # 5. Insert Relationships by specific type & node labels for index efficiency
    edge_type_mappings = {
        "HAS_POLICY": ("Policyholder", "Policy"),
        "AMENDED_BY": ("Policy", "Endorsement"),
        "COVERS": ("Policy", "Coverage"),
        "ADDS": ("Endorsement", "Coverage"),
        "FILED_AGAINST": ("Claim", "Policy"),
        "HANDLED_BY": ("Claim", "Provider"),
        "REPAIRED_AT": ("Claim", "Shop"),
        "DECIDES": ("Decision", "Claim"),
        "AFFECTS": ("Event", "Claim"),
        "FLAGS": ("ReviewFlag", "Claim"),
        "RECEIPT_OF": ("Receipt", "Decision"),
        "RAN_TOOL": ("AgentRun", "ToolCall"),
        "TRIGGERED_BY": ("AgentRun", "Event"),
    }

    # Group edges by type
    grouped_edges: Dict[str, List[dict]] = {}
    for edge in data["edges"]:
        grouped_edges.setdefault(edge["type"], []).append(edge)

    for edge_type, (src_label, tgt_label) in edge_type_mappings.items():
        batch = grouped_edges.get(edge_type, [])
        if not batch:
            continue
        query = f"""
        UNWIND $batch AS e
        MATCH (src:{src_label} {{id: e.source}})
        MATCH (tgt:{tgt_label} {{id: e.target}})
        CREATE (src)-[r:{edge_type} {{
            valid_from: e.valid_from,
            valid_to: e.valid_to,
            sys_from: e.sys_from,
            sys_to: e.sys_to
        }}]->(tgt)
        """
        g.query(query, params={"batch": batch})
        stats[f"edges_{edge_type}"] = len(batch)
        logger.info("Inserted %d edges of type :%s", len(batch), edge_type)

    # 6. Save ground truth file for benchmark verification
    seed_dir = Path(__file__).parent
    gt_path = seed_dir / "ground_truth.json"
    with open(gt_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "metadata": data["metadata"],
                "ground_truth": data["ground_truth"],
            },
            f,
            indent=2,
        )
    logger.info("Saved ground truth metadata to %s", gt_path)

    # 7. Print summary
    total_nodes = sum(v for k, v in stats.items() if k.startswith("nodes_"))
    total_edges = sum(v for k, v in stats.items() if k.startswith("edges_"))
    logger.info(
        "Seeding complete! Summary: %d nodes, %d edges created in graph '%s'.",
        total_nodes,
        total_edges,
        target_graph,
    )
    return stats


if __name__ == "__main__":
    seed_database()
