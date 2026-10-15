"""Graph schema definitions, constraints, and index initialization for AsOf."""

import logging
from typing import Optional
from redis.exceptions import ResponseError
from backend.app.db.connection import get_graph

logger = logging.getLogger(__name__)

# List of (Label, property) pairs to index
INDEXED_PROPERTIES = [
    # Primary identifiers
    ("Policyholder", "id"),
    ("Policy", "id"),
    ("Endorsement", "id"),
    ("Coverage", "id"),
    ("Claim", "id"),
    ("Provider", "id"),
    ("Shop", "id"),
    ("Decision", "id"),
    ("ReviewFlag", "id"),
    ("Receipt", "id"),
    ("AgentRun", "id"),
    ("ToolCall", "id"),
    ("Event", "id"),
    ("Event", "valid_from"),
    ("Event", "sys_from"),
    # Bi-temporal timestamp indexes on versioned nodes
    ("Policy", "valid_from"),
    ("Policy", "valid_to"),
    ("Policy", "sys_from"),
    ("Policy", "sys_to"),
    ("Endorsement", "valid_from"),
    ("Endorsement", "valid_to"),
    ("Endorsement", "sys_from"),
    ("Endorsement", "sys_to"),
    ("Coverage", "valid_from"),
    ("Coverage", "valid_to"),
    ("Coverage", "sys_from"),
    ("Coverage", "sys_to"),
    ("Claim", "valid_from"),
    ("Claim", "valid_to"),
    ("Claim", "sys_from"),
    ("Claim", "sys_to"),
    ("Decision", "valid_from"),
    ("Decision", "valid_to"),
    ("Decision", "sys_from"),
    ("Decision", "sys_to"),
]


def init_schema(graph_name: Optional[str] = None) -> None:
    """Initialize graph schema and create indexes idempotently."""
    g = get_graph(graph_name)
    logger.info("Initializing schema and indexes on graph '%s'...", g.name)

    created = 0
    existing = 0

    for label, prop in INDEXED_PROPERTIES:
        query = f"CREATE INDEX FOR (n:{label}) ON (n.{prop})"
        try:
            g.query(query)
            created += 1
            logger.debug("Created index on :%s(%s)", label, prop)
        except ResponseError as e:
            err_msg = str(e).lower()
            if "already indexed" in err_msg or "already exists" in err_msg:
                existing += 1
            else:
                logger.warning("Could not create index for :%s(%s): %s", label, prop, e)
        except Exception as e:
            logger.warning("Error creating index for :%s(%s): %s", label, prop, e)

    logger.info(
        "Schema initialized for '%s': %d indexes created, %d already existed.",
        g.name,
        created,
        existing,
    )


def clear_graph(graph_name: Optional[str] = None) -> None:
    """Safely drop or empty all nodes and relationships in the graph."""
    g = get_graph(graph_name)
    try:
        g.delete()
        logger.info("Graph '%s' deleted successfully.", g.name)
    except Exception as e:
        logger.info("Graph '%s' could not be dropped directly (%s), clearing via Cypher...", g.name, e)
        try:
            g.query("MATCH (n) DETACH DELETE n")
        except Exception as inner_e:
            logger.warning("Failed to clear graph nodes: %s", inner_e)
