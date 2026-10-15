"""FalkorDB database client and graph connection management."""

import os
from typing import Any, Dict, Optional
import falkordb
from falkordb.graph import Graph
from falkordb.query_result import QueryResult
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    falkordb_host: str = "localhost"
    falkordb_port: int = 6379
    falkordb_username: Optional[str] = None
    falkordb_password: Optional[str] = None
    falkordb_ssl: bool = False
    falkordb_graph: str = "asof"
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    llm_provider: str = "mock"
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    llm_model: str = "gpt-4o-mini"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

_client_instance: Optional[falkordb.FalkorDB] = None


def get_client() -> falkordb.FalkorDB:
    """Get or create singleton FalkorDB client instance."""
    global _client_instance
    if _client_instance is None:
        username = settings.falkordb_username or None
        password = settings.falkordb_password or None
        _client_instance = falkordb.FalkorDB(
            host=settings.falkordb_host,
            port=settings.falkordb_port,
            username=username,
            password=password,
            ssl=settings.falkordb_ssl,
            socket_timeout=15,
            socket_connect_timeout=10,
        )
    return _client_instance


def get_graph(graph_name: Optional[str] = None) -> Graph:
    """Select graph by name (defaults to configured FALKORDB_GRAPH)."""
    client = get_client()
    target_graph = graph_name or settings.falkordb_graph
    return client.select_graph(target_graph)


def ping_db() -> bool:
    """Check if FalkorDB connection is active."""
    try:
        client = get_client()
        return bool(client.connection.ping())
    except Exception:
        return False


def execute_cypher(
    query: str,
    params: Optional[Dict[str, Any]] = None,
    graph_name: Optional[str] = None,
    read_only: bool = False,
) -> QueryResult:
    """Execute a parameterized Cypher query against FalkorDB.
    
    Ensures safe parameterized query execution without raw string concatenation.
    """
    g = get_graph(graph_name)
    return g.query(query, params=params, read_only=read_only)
