# AsOf: Bi-Temporal Claims Decision Agent

> *"Was the decision right, given what we knew then?"*

AsOf is an AI agent that investigates and decides insurance claims on a **FalkorDB** graph where every fact carries two timelines: when it was true in the real world, and when the system learned about it. It can reconstruct what an insurer knew at any past moment, flag decisions that would change with later information, and explain every verdict as a path through the graph.

**Hackathon:** Graph Hacks (WeMakeDevs)
**Track:** 01, Agents That Act on Connected Data
**Primary database:** FalkorDB
**Demo video:** `<add link>`


> All data in this project is **synthetic**. AsOf is a hackathon prototype, not a production claims system and not legal or financial advice.

---

## Table of contents

1. [Problem](#problem)
2. [Solution](#solution)
3. [Why the graph is essential](#why-the-graph-is-essential)
4. [Bi-temporal model](#bi-temporal-model)
5. [Graph data model](#graph-data-model)
6. [Key Cypher queries and graph algorithms](#key-cypher-queries-and-graph-algorithms)
7. [Agent and MCP tools](#agent-and-mcp-tools)
8. [Hero scenario](#hero-scenario)
9. [Architecture](#architecture)
10. [Local setup](#local-setup)
11. [API overview](#api-overview)
12. [Testing and benchmark](#testing-and-benchmark)
13. [Project structure](#project-structure)
14. [Limitations](#limitations)
15. [AI usage disclosure](#ai-usage-disclosure)
16. [License](#license)

---

## Problem

Insurance data changes after the fact. Endorsements are backdated, claims are filed late, and records are corrected long after a decision was made. Most systems store only the current state, so they can say what a policy covers today but not what the system actually knew on the day a claim was decided.

This leads to:

- **Unnoticed wrong decisions.** A claim denied on June 8 may be valid once a June 10 endorsement (backdated to June 1) is recorded.
- **Guesswork audits.** "What did you know when you decided?" is hard to answer reliably.
- **Future-information leakage in AI.** Agents using latest-state data judge old decisions with facts that did not exist yet.
- **Hidden fraud.** Suspicious provider rings span many claims and many hops.

## Solution

AsOf keeps complete bi-temporal history in FalkorDB and gives an agent graph-based tools to investigate and act.

1. Model policies, endorsements, coverages, claims, providers and shops as a graph.
2. Store valid time and system time on every versioned fact. Corrections add versions and never overwrite history.
3. Answer "as-of" queries that return only facts valid at time `Tv` and recorded by time `Ts`.
4. Expose graph tools to an agent through MCP. The agent picks tools, the graph decides coverage, and the agent explains the result using only tool outputs.
5. Show the result on a time slider so you can watch a verdict change as system time moves forward.

## Why the graph is essential

Remove FalkorDB and the core logic stops working:

- **Coverage resolution** is a multi-hop traversal from Claim to Policy to Endorsement to Coverage.
- **Late-fact tracing** walks versioned edges to find facts that were valid then but recorded later.
- **Provider-ring detection** is a graph algorithm over providers, shops and claims.
- **Explanations** are literally the traversed path, returned as evidence.

## Bi-temporal model

Every versioned node and edge stores four properties, as epoch milliseconds:

| Property | Meaning |
| --- | --- |
| `valid_from`, `valid_to` | When the fact was true in the real world |
| `sys_from`, `sys_to` | When the system knew the fact |

Open-ended intervals use a large sentinel value (`9999999999999`) instead of `null`.

**As-of rule used throughout:**

```
valid_from <= $tv < valid_to   AND   sys_from <= $ts < sys_to
```

**Corrections never update or delete.** To correct a fact, close the old version by setting its `sys_to`, then create a new version. Old versions stay queryable.

## Graph data model

**Nodes**

| Label | Key properties |
| --- | --- |
| `Policyholder` | `id`, `name` |
| `Policy` | `id`, `number`, temporal properties |
| `Endorsement` | `id`, `description`, temporal properties |
| `Coverage` | `id`, `type`, `limit`, temporal properties |
| `Claim` | `id`, `loss_type`, `incident_ts`, `filed_ts`, `amount` |
| `Provider` | `id`, `name` |
| `Shop` | `id`, `name` |
| `Decision` | `id`, `outcome`, `decided_ts`, `reasons` |
| `ReviewFlag` | `id`, `reason`, `created_ts` |

**Relationships**

```
(Policyholder)-[:HAS_POLICY]->(Policy)
(Policy)-[:AMENDED_BY]->(Endorsement)
(Policy)-[:COVERS]->(Coverage)
(Endorsement)-[:ADDS]->(Coverage)
(Claim)-[:FILED_AGAINST]->(Policy)
(Claim)-[:HANDLED_BY]->(Provider)
(Claim)-[:REPAIRED_AT]->(Shop)
(Decision)-[:DECIDES]->(Claim)
(ReviewFlag)-[:FLAGS]->(Claim)
```

Versioned relationships (for example `AMENDED_BY`) also carry the four temporal properties.

> Add a diagram here: `docs/graph-model.png`

## Key Cypher queries and graph algorithms

All queries are parameterized. The versions below are the intended logic; keep this section in sync with `backend/app/queries/`.

> FalkorDB uses openCypher with its own client, not Neo4j's Bolt driver. Check the FalkorDB documentation for supported functions and algorithms before changing queries.

### 1. Resolve coverage as-of (multi-hop)

Finds coverage added by an endorsement that was valid at the incident time and known by the decision time.

```cypher
MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)
OPTIONAL MATCH (p)-[a:AMENDED_BY]->(e:Endorsement)-[:ADDS]->(cov:Coverage)
WHERE a.valid_from <= $tv AND $tv < a.valid_to
  AND a.sys_from   <= $ts AND $ts < a.sys_to
  AND cov.type = c.loss_type
RETURN p, a, e, cov
```

Base coverage on the policy itself uses the same as-of rule on `(p)-[:COVERS]->(cov:Coverage)`.

### 2. Find late facts

Facts that were valid at the incident time but recorded after the decision.

```cypher
MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)-[a:AMENDED_BY]->(e:Endorsement)
WHERE a.valid_from <= c.incident_ts AND c.incident_ts < a.valid_to
  AND a.sys_from > $decision_ts
RETURN e, a.sys_from AS recorded_at
```

### 3. Provider and shop clusters

Preferred approach: use a native FalkorDB graph algorithm (for example weakly connected components) if your FalkorDB version supports it. Check the docs for the exact procedure name.

Fallback, still inside the graph engine:

```cypher
MATCH (pr:Provider)<-[:HANDLED_BY]-(c:Claim)-[:REPAIRED_AT]->(s:Shop)
WITH pr, s, count(c) AS shared_claims
WHERE shared_claims >= $min_shared
RETURN pr.id AS provider, s.id AS shop, shared_claims
ORDER BY shared_claims DESC
```

### 4. Replay a past decision

Run the decision logic twice for the same claim:

- **As decided:** `ts = decision time`
- **As now known:** `ts = latest system time`

Report whether the outcome changes.

## Agent and MCP tools

The agent loop lets an LLM choose tools and write a short explanation grounded only in tool outputs. **Coverage decisions come from the graph, not from the LLM.** The agent never receives data newer than the `ts` it is given.

| Tool | Purpose |
| --- | --- |
| `get_policy_as_of(policy_id, tv, ts)` | Policy state at a valid time and knowledge time |
| `trace_coverage_path(claim_id, tv, ts)` | Multi-hop path from claim to covering clause |
| `find_late_facts(claim_id, decision_ts)` | Facts recorded after the decision |
| `detect_provider_clusters()` | Suspicious provider and shop clusters |
| `decide_claim(claim_id, tv, ts)` | Approve, deny or escalate, with evidence path |
| `replay_decision(claim_id)` | Compare decision as made vs. as now known |
| `flag_for_review(claim_id, reason)` | Create a review flag node in the graph |

## Hero scenario

> A policy was amended on **June 10**, backdated to **June 1**. A claim for a **June 5** incident was denied on **June 8**.
>
> - At system time **June 8**, the denial was correct.
> - At system time **June 11**, the claim should be approved, and the agent flags it for reconsideration.

Move the system-time slider in the UI to see the verdict flip and the evidence path change.

## Architecture

```
Next.js UI (time slider, graph view)
        |
   FastAPI REST  <----->  MCP server (agent tools)
        |                        |
        +----------+-------------+
                   |
        Query engine (parameterized Cypher)
                   |
               FalkorDB
```

**Stack:** Python, FastAPI, FalkorDB, MCP (Python SDK), Next.js, TypeScript, Tailwind CSS, pytest.

> Add an architecture diagram here: `docs/architecture.png`

## Local setup

### Prerequisites

- Docker
- Python 3.11+
- Node.js 20+
- An LLM API key (set in `.env`)

### 1. Clone and configure

```bash
git clone <repo-url>
cd asof
cp .env.example .env
# edit .env: FALKORDB_HOST, FALKORDB_PORT, LLM_API_KEY, etc.
```

### 2. Start FalkorDB

```bash
docker compose up -d falkordb
```

### 3. Install and seed the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.seed --seed 42
```

The seed script creates synthetic policyholders and claims, including the hero scenario, a late-filed claim and a provider ring. A fixed seed makes results reproducible.

### 4. Run the API and MCP server

```bash
uvicorn app.api.main:app --reload --port 8000
python -m app.mcp_server
```

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

> Adjust commands to match the final repository layout before submitting.

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Service health |
| GET | `/claims` | List claims (filter by status) |
| GET | `/claims/{id}` | Claim details |
| GET | `/claims/{id}/as-of?tv=&ts=` | Verdict, evidence path and graph for a time pair |
| GET | `/claims/{id}/replay` | Decision as made vs. as now known |
| POST | `/claims/{id}/decide` | Run the agent |
| POST | `/claims/{id}/flag` | Create a review flag |
| GET | `/fraud/clusters` | Detected provider clusters |
| POST | `/benchmark/run` | Run the benchmark |
| GET | `/benchmark/results` | Latest benchmark results |

Graph responses use `{ nodes: [{id, label, type, state}], edges: [{source, target, type}], path: [...] }`, where `state` is `known` or `not_yet_known` relative to `ts`.

## Testing and benchmark

```bash
cd backend
pytest
python -m app.benchmark --seed 42
```

**Tests cover:**

- Hero scenario: denied at June 8, approved at June 11
- No future leakage: nothing with `sys_from > ts` is returned
- Corrections preserve history
- Cluster detection finds the seeded ring
- Benchmark reproducibility with a fixed seed

**Benchmark:** the same agent runs over synthetic claims in two modes, latest-state data and AsOf data, compared against ground-truth labels from the seed script. Results are computed at runtime and never hardcoded.

| Metric | Latest-state agent | AsOf agent |
| --- | --- | --- |
| Claims evaluated | `<fill from run>` | `<fill from run>` |
| Decisions using future information | `<fill from run>` | `<fill from run>` |
| Accuracy vs. ground truth | `<fill from run>` | `<fill from run>` |
| Query latency p50 / p95 | n/a | `<fill from run>` |

> Only report numbers produced by an actual run on your machine. State the hardware and dataset size next to any latency figure.

## Project structure

```
asof/
  backend/
    app/
      api/
      db/
      queries/
      agent/
      mcp_server/
      seed/
      benchmark/
    tests/
  frontend/
  docs/
  docker-compose.yml
  .env.example
  README.md
```

## Limitations

- Synthetic data only. Real insurance data would require privacy, security, access-control and regulatory work.
- Decision rules are simplified for the prototype and are not real underwriting logic.
- The agent explains and acts on graph results. Final claims decisions would need human oversight in practice.

## AI usage disclosure

AI coding assistants were used during development: `<list tools, e.g. Claude, Cursor>`. They were used for `<describe: scaffolding, test generation, UI prompts, etc.>`. The graph model, queries and architecture were reviewed and are understood by the author(s).

## License

`<choose a license, e.g. MIT>`

## Team

`<names, links>`