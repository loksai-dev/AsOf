"""Graph serializer converting FalkorDB query results into UI-shaped JSON payloads."""

from typing import Any, Dict, List, Optional, Set
from backend.app.api.models import GraphEdge, GraphNode, GraphPayload, PathElement
from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, to_iso


def determine_temporal_state(sys_from: Optional[int], sys_to: Optional[int], ts: Optional[int]) -> str:
    """Determine UI state ('known', 'not_yet_known', 'superseded') relative to target system time ts."""
    if ts is None or ts >= SENTINEL_MAX:
        if sys_to is not None and sys_to < SENTINEL_MAX:
            return "superseded"
        return "known"

    # If the fact was recorded in the system after ts, it was not yet known
    if sys_from is not None and sys_from > ts:
        return "not_yet_known"

    # If the fact was closed/superseded before or at ts, it is superseded
    if sys_to is not None and sys_to <= ts:
        return "superseded"

    return "known"


def build_claim_graph_payload(
    claim_id: str,
    ts: Optional[int] = None,
    evidence_path: Optional[List[Dict[str, Any]]] = None,
) -> GraphPayload:
    """Build UI-shaped graph payload for a claim subgraph with 'known' vs 'not_yet_known' states."""
    g = get_graph()
    target_ts = ts if ts is not None else SENTINEL_MAX

    # Multi-branch traversal fetching the entire claim context
    cypher = """
    MATCH (c:Claim {id: $claim_id})
    OPTIONAL MATCH (c)-[fa:FILED_AGAINST]->(p:Policy)
    OPTIONAL MATCH (ph:Policyholder)-[hp:HAS_POLICY]->(p)
    OPTIONAL MATCH (p)-[cov_edge:COVERS]->(base_cov:Coverage)
    OPTIONAL MATCH (p)-[ab:AMENDED_BY]->(e:Endorsement)
    OPTIONAL MATCH (e)-[adds_edge:ADDS]->(end_cov:Coverage)
    OPTIONAL MATCH (c)-[hb:HANDLED_BY]->(pr:Provider)
    OPTIONAL MATCH (c)-[ra:REPAIRED_AT]->(s:Shop)
    OPTIONAL MATCH (d:Decision)-[dec_edge:DECIDES]->(c)
    OPTIONAL MATCH (rf:ReviewFlag)-[flg_edge:FLAGS]->(c)
    RETURN c, fa, p, hp, ph, cov_edge, base_cov, ab, e, adds_edge, end_cov,
           hb, pr, ra, s, dec_edge, d, flg_edge, rf
    """
    res = g.query(cypher, params={"claim_id": claim_id})

    node_dict: Dict[str, GraphNode] = {}
    edge_dict: Dict[str, GraphEdge] = {}

    def add_node(raw_node, default_label: str):
        if raw_node is None:
            return
        props = dict(raw_node.properties) if hasattr(raw_node, "properties") else dict(raw_node)
        n_id = props.get("id")
        if not n_id or n_id in node_dict:
            return

        label = getattr(raw_node, "labels", [default_label])[0] if hasattr(raw_node, "labels") and raw_node.labels else default_label
        s_from = props.get("sys_from")
        s_to = props.get("sys_to")
        v_from = props.get("valid_from")
        v_to = props.get("valid_to")

        state = determine_temporal_state(s_from, s_to, target_ts)

        node_dict[n_id] = GraphNode(
            id=n_id,
            label=label,
            type=label,
            state=state,
            name=props.get("name") or props.get("claim_number") or props.get("policy_number") or props.get("description"),
            title=props.get("title") or props.get("description"),
            amount=props.get("amount"),
            status=props.get("status") or props.get("outcome"),
            sys_from=s_from,
            sys_from_iso=to_iso(s_from) if s_from else None,
            sys_to=s_to,
            valid_from=v_from,
            valid_from_iso=to_iso(v_from) if v_from else None,
            valid_to=v_to,
            properties=props,
        )

    def add_edge(src_node, raw_edge, tgt_node, default_type: str):
        if raw_edge is None or src_node is None or tgt_node is None:
            return
        src_props = dict(src_node.properties) if hasattr(src_node, "properties") else dict(src_node)
        tgt_props = dict(tgt_node.properties) if hasattr(tgt_node, "properties") else dict(tgt_node)
        src_id = src_props.get("id")
        tgt_id = tgt_props.get("id")
        if not src_id or not tgt_id:
            return

        edge_type = getattr(raw_edge, "relation", default_type) if hasattr(raw_edge, "relation") else default_type
        edge_key = f"{src_id}->{edge_type}->{tgt_id}"
        if edge_key in edge_dict:
            return

        edge_props = dict(raw_edge.properties) if hasattr(raw_edge, "properties") else dict(raw_edge)
        s_from = edge_props.get("sys_from")
        s_to = edge_props.get("sys_to")
        v_from = edge_props.get("valid_from")
        v_to = edge_props.get("valid_to")

        state = determine_temporal_state(s_from, s_to, target_ts)

        edge_dict[edge_key] = GraphEdge(
            source=src_id,
            target=tgt_id,
            type=edge_type,
            state=state,
            sys_from=s_from,
            sys_to=s_to,
            valid_from=v_from,
            valid_to=v_to,
            properties=edge_props,
        )

    if res.result_set:
        for row in res.result_set:
            (
                c, fa, p, hp, ph, cov_edge, base_cov, ab, e, adds_edge, end_cov,
                hb, pr, ra, s, dec_edge, d, flg_edge, rf
            ) = row

            add_node(c, "Claim")
            add_node(p, "Policy")
            add_node(ph, "Policyholder")
            add_node(base_cov, "Coverage")
            add_node(e, "Endorsement")
            add_node(end_cov, "Coverage")
            add_node(pr, "Provider")
            add_node(s, "Shop")
            add_node(d, "Decision")
            add_node(rf, "ReviewFlag")

            add_edge(c, fa, p, "FILED_AGAINST")
            add_edge(ph, hp, p, "HAS_POLICY")
            add_edge(p, cov_edge, base_cov, "COVERS")
            add_edge(p, ab, e, "AMENDED_BY")
            add_edge(e, adds_edge, end_cov, "ADDS")
            add_edge(c, hb, pr, "HANDLED_BY")
            add_edge(c, ra, s, "REPAIRED_AT")
            add_edge(d, dec_edge, c, "DECIDES")
            add_edge(rf, flg_edge, c, "FLAGS")

    # Serialize path elements
    path_elements: List[PathElement] = []
    if evidence_path:
        for item in evidence_path:
            path_elements.append(
                PathElement(
                    id=item.get("id"),
                    label=item.get("label"),
                    type=item.get("type") or item.get("label"),
                    name=item.get("name") or item.get("policy_number") or item.get("claim_number"),
                    description=item.get("description"),
                    status=item.get("status") or item.get("outcome"),
                )
            )

    return GraphPayload(
        nodes=list(node_dict.values()),
        edges=list(edge_dict.values()),
        path=path_elements,
    )


def build_cluster_graph_payload(
    cluster: Dict[str, Any],
    ts: Optional[int] = None,
) -> GraphPayload:
    """Build UI graph payload for a provider-shop fraud cluster."""
    target_ts = ts if ts is not None else SENTINEL_MAX
    nodes: Dict[str, GraphNode] = {}
    edges: List[GraphEdge] = []

    # 1. Add Provider nodes
    for p in cluster.get("providers", []):
        p_id = p["id"]
        nodes[p_id] = GraphNode(
            id=p_id,
            label="Provider",
            type="Provider",
            state="known",
            name=p.get("name"),
            properties=p,
        )

    # 2. Add Shop nodes
    for s in cluster.get("shops", []):
        s_id = s["id"]
        nodes[s_id] = GraphNode(
            id=s_id,
            label="Shop",
            type="Shop",
            state="known",
            name=s.get("name"),
            properties=s,
        )

    # 3. Add Claim nodes and connecting edges
    for c in cluster.get("claims", []):
        c_id = c["id"]
        s_from = c.get("sys_from")
        state = determine_temporal_state(s_from, SENTINEL_MAX, target_ts)

        nodes[c_id] = GraphNode(
            id=c_id,
            label="Claim",
            type="Claim",
            state=state,
            name=c.get("claim_number") or c_id,
            amount=c.get("amount"),
            status=c.get("status"),
            sys_from=s_from,
            sys_from_iso=to_iso(s_from) if s_from else None,
            properties=c,
        )

        p_id = c.get("provider_id")
        if p_id and p_id in nodes:
            edges.append(
                GraphEdge(
                    source=c_id,
                    target=p_id,
                    type="HANDLED_BY",
                    state=state,
                    sys_from=s_from,
                )
            )

        shp_id = c.get("shop_id")
        if shp_id and shp_id in nodes:
            edges.append(
                GraphEdge(
                    source=c_id,
                    target=shp_id,
                    type="REPAIRED_AT",
                    state=state,
                    sys_from=s_from,
                )
            )

    return GraphPayload(
        nodes=list(nodes.values()),
        edges=edges,
        path=[],
    )
