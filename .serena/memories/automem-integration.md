# AutoMem Integration in SecondMe

## Overview

AutoMem is the memory system for SecondMe, providing:
- **FalkorDB**: Knowledge graph for entities (people, topics, events) and relationships
- **Qdrant**: Vector database for semantic search/recall of memories

## Architecture

```
SecondMe Services (localhost)
├── Gateway (3001)
├── Orchestrator (3002) ──→ AutoMem API (8001)
├── Graph-Worker (3003) ──→ AutoMem API (8001)
└── Frontend (3000) ──────→ AutoMem API (8001)

AutoMem Stack (from /Users/jazlim/Projects/automem)
├── Flask API (8001) - python app.py
├── FalkorDB (6379) - docker compose
└── Qdrant (6333) - docker compose
```

## Configuration

### SecondMe `.env`
```bash
AUTOMEM_API_URL=http://localhost:8001
AUTOMEM_API_TOKEN=local-dev-token
```

### AutoMem `.env` (in /Users/jazlim/Projects/automem)
```bash
PORT=8001
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_GRAPH=memories
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=memories
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=<key>
AUTOMEM_API_TOKEN=local-dev-token
```

## Local Development Setup

### Step 1: Start AutoMem Databases
```bash
cd /Users/jazlim/Projects/automem
docker compose up -d falkordb qdrant
```

### Step 2: Start AutoMem Flask Server
```bash
cd /Users/jazlim/Projects/automem
source venv/bin/activate
python app.py
```

### Step 3: Start SecondMe
```bash
cd /Users/jazlim/Projects/SecondMe
docker compose up -d redis
npm run dev
```

## API Endpoints (AutoMem)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (FalkorDB + Qdrant status) |
| `/memory` | POST | Store a new memory |
| `/recall` | GET | Recall memories by tags/query |
| `/graph/query` | POST | Execute Cypher query on knowledge graph |

## SecondMe Integration Points

1. **Orchestrator** (`services/orchestrator/src/automem/client.ts`)
   - Retrieves context for AI responses via knowledge graph
   - Uses skill system to query memories

2. **Graph-Worker** (`services/graph-worker/`)
   - Ingests new information into the knowledge graph
   - Processes messages for entity extraction

3. **Frontend** (`frontend/src/app/api/`)
   - Dashboard for viewing/managing memories (if applicable)

## Docker Compose Changes

SecondMe's `docker-compose.yml` has AutoMem services **commented out** for local development:
- `automem-falkordb` (was port 6378)
- `qdrant` (was port 6333)
- `automem` (was port 8001)

Services use `AUTOMEM_API_URL` env var to connect to local AutoMem instead.

## Port Summary

| Service | Port | Source |
|---------|------|--------|
| AutoMem API | 8001 | Local Python |
| FalkorDB | 6379 | AutoMem docker-compose |
| Qdrant | 6333 | AutoMem docker-compose |
| Redis | 6380 | SecondMe docker-compose |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Connection refused :8001` | Start AutoMem: `python app.py` |
| `Connection refused :6379` | Start FalkorDB: `docker compose up -d falkordb` |
| `401 Unauthorized` | Check `AUTOMEM_API_TOKEN` matches in both .env files |
| Port 6379 conflict | Stop old containers: `docker stop secondme_falkordb` |
| Port 3000 conflict | FalkorDB browser UI disabled in docker-compose |
