"""FastAPI entrypoint for AsOf backend."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.db.connection import ping_db, settings
from backend.app.db.schema import init_schema

from backend.app.api.claims import router as claims_router
from backend.app.api.fraud import router as fraud_router
from backend.app.api.agent import router as agent_router
from backend.app.api.benchmark import router as benchmark_router
from backend.app.api.receipts import router as receipts_router
from backend.app.api.impact import router as impact_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AsOf API server...")
    if ping_db():
        logger.info("Connected to FalkorDB successfully (Graph: '%s')", settings.falkordb_graph)
        try:
            init_schema()
        except Exception as e:
            logger.warning("Schema initialization notice on startup: %s", e)
    else:
        logger.warning("FalkorDB connection check failed on startup")
    yield
    logger.info("Shutting down AsOf API server...")


app = FastAPI(
    title="AsOf API",
    description="Bi-temporal insurance claims decision agent powered by FalkorDB",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(claims_router)
app.include_router(fraud_router)
app.include_router(agent_router)
app.include_router(benchmark_router)
app.include_router(receipts_router)
app.include_router(impact_router)


@app.get("/health")
def health():
    falkordb_ok = ping_db()
    return {
        "status": "healthy" if falkordb_ok else "degraded",
        "app": "AsOf",
        "database": "FalkorDB",
        "graph": settings.falkordb_graph,
        "falkordb_connected": falkordb_ok,
    }


@app.get("/mcp/demo-run")
def run_mcp_client():
    """Execute the real MCP client script and return its stdout for live UI display."""
    import subprocess
    import sys
    res = subprocess.run(
        [sys.executable, "tools/demo_video/mcp_client_demo.py"],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return {"output": res.stdout, "returncode": res.returncode}
