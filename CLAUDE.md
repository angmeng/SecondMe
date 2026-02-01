# CLAUDE.md

This file provides guidance for Claude Code when working with the SecondMe project.

## Quick Navigation

- [Backend Services Guidelines](services/CLAUDE.md)
- [Frontend Dashboard Guidelines](frontend/CLAUDE.md)
- [Infrastructure Guidelines](infra/CLAUDE.md)
- [Project Specifications](specs/001-personal-ai-clone/)

## Project Overview

SecondMe is a **Context-Adaptive Multi-Channel Bot** that acts as a personal AI clone. It supports WhatsApp and Telegram, using Claude AI with knowledge graph memory for context-aware conversations.

```
SecondMe/
├── packages/
│   ├── shared-types/        # Shared TypeScript types (@secondme/shared-types)
│   └── cli/                 # Developer CLI tools (@secondme/cli)
├── frontend/                # Next.js 16.1.1 Dashboard
│   └── src/
│       ├── app/             # App Router pages & API routes
│       ├── components/      # React 19.2 components
│       └── lib/             # Utilities (socket, redis)
├── services/
│   ├── gateway/             # Multi-channel messaging (WhatsApp/Telegram, port 3001)
│   ├── orchestrator/        # LangGraph AI workflow (port 3002)
│   └── graph-worker/        # Knowledge graph ingestion (port 3003)
├── specs/                   # Project specifications & contracts
├── infra/                   # Redis, FalkorDB, Caddy configs
└── docker-compose.yml       # Service orchestration
```

## Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Runtime | Node.js | 24.12.0 LTS |
| Language | TypeScript | 5.9.3 |
| Frontend | Next.js (App Router) | 16.1.1 |
| UI | React + Tailwind CSS | 19.2 + 4.1.18 |
| AI | LangGraph.js + Anthropic SDK | 1.0.7 + 0.71.2 |
| Graph DB | FalkorDB | 4.14.11 |
| Cache/Queue | Redis + ioredis | 8.4 + 5.9.1 |
| WhatsApp | whatsapp-web.js | 1.34.2 |
| Real-time | Socket.io | 4.8.3 |
| Testing | Vitest + Playwright | 4.0.16 + 1.57.0 |

## Core Commands

```bash
# Development
npm run dev              # Start all services concurrently
npm run build            # Build all workspaces
npm run type-check       # TypeScript validation

# CLI Tools (Phase 6)
npm run cli doctor       # Comprehensive health check
npm run cli status       # Quick status overview
npm run cli onboard      # Interactive setup wizard

# Testing
npm run test             # Unit tests (Vitest)
npm run test:contract    # Contract tests
npm run test:integration # Integration tests (requires Docker)
npm run test:e2e         # E2E tests (Playwright)

# Code Quality
npm run lint             # ESLint (flat config)
npm run format           # Prettier formatting
npm run format:check     # Check formatting

# Docker
docker compose up -d     # Start all services
docker compose logs -f   # View logs
docker compose down      # Stop services
```

## Architecture Principles

1. **Microservices Communication**: Services communicate via Redis Streams (`QUEUE:messages`, `QUEUE:responses`)
2. **State Management**: Redis for transient state, FalkorDB for persistent knowledge graph
3. **Real-time Updates**: Socket.io events from Gateway to Frontend
4. **AI Workflow**: LangGraph orchestrates Claude Haiku (classification) → Sonnet (generation)

## Data Flow

```
WhatsApp/Telegram Message → Gateway → QUEUE:messages → Orchestrator → Claude
        ↓                      ↓                            ↓
    [media?]              downloadMedia()           mediaProcessingNode
        ↓                      ↓                    ├── audio → Whisper
    voice/image         base64 + mimeType           └── image → Vision
                                                            ↓
WhatsApp/Telegram ← Gateway ← QUEUE:responses ← Orchestrator ←
```

## Code Style

- **Formatting**: Prettier with project defaults (`.prettierrc.json`)
- **Linting**: ESLint 9 flat config (`eslint.config.js`)
- **Imports**: Use workspace aliases when available
- **Types**: Strict TypeScript, avoid `any`
- **Async**: Always handle promise rejections
- **Logging**: Use structured logger from `src/utils/logger.ts`

### Code Quality Rules (Phase 6)

| Rule | Threshold | Level |
|------|-----------|-------|
| `max-lines` | 700 lines | Error |
| `complexity` | 15 per function | Warning |
| `max-depth` | 4 levels | Warning |
| `max-nested-callbacks` | 3 | Warning |
| Coverage (lines/functions/branches) | 70% | Enforced |

## Critical Patterns

### Redis Keys
- `PAUSE:ALL` - Global kill switch
- `PAUSE:{contactId}` - Contact-specific pause
- `RATE:{contactId}` - Rate limit counter
- `PERSONA:{id}` - Cached persona (30-min TTL)
- `HISTORY:{contactId}` - Conversation history for RAG context (configurable TTL)
- `PAIRING:pending:{contactId}` - Pending pairing request (no TTL)
- `PAIRING:approved:{contactId}` - Approved contact record (no TTL)
- `PAIRING:denied:{contactId}` - Denied contact with cooldown (24h TTL)
- `SKILLS:enabled` - Set of enabled skill IDs (no TTL)
- `SKILLS:config:{skillId}` - JSON config per skill (no TTL)
- `CACHE:voice:{contactId}` - Cached voice preferences (30-min TTL)
- `LINKED:phone:{normalizedPhone}` - Cross-channel contact linking by phone (no TTL)
- `LINKED:contact:{contactId}` - Reverse lookup: contactId → phone (no TTL)
- `EMB:{provider}:{hash}` - Cached embeddings (5-min TTL)
- `EMB:voyage:{type}:{hash}` - Voyage embeddings with input type (5-min TTL)
- `INDEXED:conversation:{chunkId}` - Indexed conversation chunk marker (no TTL)

### Environment Variables
Required in `.env`:
- `ANTHROPIC_API_KEY` - Claude API access
- `FALKORDB_PASSWORD` - Graph database auth
- `NODE_ENV` - development/production
- `USE_SKILL_SYSTEM` - Enable skill-based context retrieval (`true` to enable)

Optional for Telegram channel:
- `TELEGRAM_ENABLED` - Enable Telegram channel (`true` to enable)
- `TELEGRAM_BOT_TOKEN` - Telegram Bot API token from @BotFather

Optional for voice output (TTS):
- `ELEVENLABS_API_KEY` - ElevenLabs API key for text-to-speech
- `VOICE_OUTPUT_ENABLED` - Enable voice message responses (`true` to enable)

Optional for media processing (Phase 4):
- `OPENAI_API_KEY` - Required for voice transcription (Whisper API)
- `VOICE_TRANSCRIPTION_ENABLED` - Feature flag (default: `true` if API key present)
- `IMAGE_PROCESSING_ENABLED` - Feature flag (default: `true`)
- `MEDIA_MAX_SIZE_MB` - Whisper file size limit (default: `25`)
- `TRANSCRIPTION_TIMEOUT_MS` - API timeout (default: `30000`)
- `MAX_QUEUE_PAYLOAD_MB` - Redis queue payload limit (default: `10`)

Optional for enhanced RAG (Phase 5):
- `EMBEDDING_PROVIDER` - Embedding provider: `voyage` or `openai` (default: `voyage`)
- `VOYAGE_API_KEY` - Required for Voyage embeddings
- `CONVERSATION_INDEXING_ENABLED` - Auto-index conversations (default: `false`)
- `RETRIEVAL_FUSION_ENABLED` - Multi-source retrieval fusion (default: `false`)
- `SEMANTIC_RAG_ENABLED` - Enable semantic RAG with AutoMem (default: `false`)

## Environment Setup

### Local Development (services run on host)

Start infrastructure in Docker, run services locally:

```bash
# Start only Redis and FalkorDB
docker compose up -d redis falkordb

# Configure .env for local development
REDIS_HOST=localhost
REDIS_PORT=6380          # Docker exposes Redis on 6380
FALKORDB_HOST=localhost
FALKORDB_PORT=6379

# Run services locally
npm run dev
```

### Docker Development (all services in containers)

Run everything in Docker:

```bash
# Configure .env for Docker networking
REDIS_HOST=redis
REDIS_PORT=6379          # Container internal port
FALKORDB_HOST=falkordb
FALKORDB_PORT=6379

# Start all services
docker compose up -d
```

### Port Mapping Reference

| Service | Container Port | Host Port |
|---------|---------------|-----------|
| Redis | 6379 | **6380** |
| FalkorDB | 6379 | 6379 |
| Gateway | 3001 | 3001 |
| Orchestrator | 3002 | 3002 |
| Graph Worker | 3003 | 3003 |
| Frontend | 3000 | 3000 |

### Common Setup Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `ENOTFOUND redis` | Using Docker hostname locally | Set `REDIS_HOST=localhost` |
| `ECONNREFUSED :6379` | Wrong Redis port locally | Set `REDIS_PORT=6380` |
| `NOAUTH Authentication required` | Missing FalkorDB password | Set `FALKORDB_PASSWORD` in `.env` |
| `EADDRINUSE` | Port conflict | Stop conflicting process or change port |

### Version Gotchas

**Node.js 24**: OpenSSL 3.5 rejects keys < 2048 bits

**React 19**: `useRef()` requires argument → `useRef(null)`

**Next.js 16**: Route params are async → `const { id } = await params`

**LangGraph 1.0**: Stable API, `toolsCondition` undeprecated

## Skill System

The orchestrator uses a skill-based architecture for context retrieval. Skills are **context providers** that execute during message processing and return structured data for the Claude prompt.

### Built-in Skills

| Skill | Description |
|-------|-------------|
| `knowledge-graph` | Retrieves context from FalkorDB (people, topics, events) |
| `persona` | Gets persona style guide based on relationship type |
| `style-profile` | Retrieves communication style profile |
| `conversation-history` | Gets recent conversation with keyword chunking |

### Skill API (Orchestrator port 3002)

```
GET    /skills              # List all skills with status
GET    /skills/:skillId     # Get skill details
POST   /skills/:skillId/enable  # Enable skill
POST   /skills/:skillId/disable # Disable skill
PUT    /skills/:skillId/config  # Update skill configuration
```

### Feature Flag

Set `USE_SKILL_SYSTEM=true` in `.env` to enable. When disabled, falls back to legacy `graphAndPersonaNode` function.

## Developer CLI

The `@secondme/cli` package provides tools for setup, diagnostics, and management.

### Commands

| Command | Description |
|---------|-------------|
| `npm run cli doctor` | Comprehensive health check with actionable fix suggestions |
| `npm run cli status` | Quick overview of service and connection status |
| `npm run cli onboard` | Interactive setup wizard for new installations |

### Doctor Health Checks

| Category | Checks |
|----------|--------|
| Prerequisites | Node.js ≥24, npm, Docker, Docker Compose, Git |
| Infrastructure | Redis, FalkorDB (TCP connectivity) |
| Services | Gateway, Orchestrator, Graph Worker, Frontend (HTTP health) |
| External | AutoMem, WhatsApp session, Telegram |
| API Keys | Anthropic (required), OpenAI, Voyage, ElevenLabs |

### Exit Codes

- `doctor`: 0 = healthy, 1 = issues found
- `status`: 0 = all running, 1 = some stopped
- `onboard`: 0 = success, 1 = failed/cancelled

## Testing Strategy

- **Unit**: Vitest for isolated function testing
- **Contract**: Service boundary validation
- **Integration**: Full flow with Docker services
- **E2E**: Playwright for dashboard interactions

## Safety Constraints

The bot includes constitutional guardrails (see `specs/001-personal-ai-clone/`):
- No financial/medical advice
- Auto-pause on user message (60 min)
- Rate limiting (10 msgs/min → auto-pause)
- Sleep hours enforcement

## Security Guidelines

### Secret Management
- **Never commit** `.env`, credentials, or API keys
- Store secrets in `.env` (gitignored) or environment variables
- Use `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` naming convention
- Rotate keys if accidentally exposed; revoke immediately

### API Security
| Endpoint Type | Protection |
|---------------|------------|
| Dashboard APIs (state-changing) | API key required if `DASHBOARD_API_KEY` set |
| Dashboard APIs (read-only) | Internal only (no auth required) |
| Service health (`/health`) | Public, read-only |
| Redis Streams | Internal network only |
| FalkorDB | Password-protected (`FALKORDB_PASSWORD`) |

**Protected Endpoints** (require API key when `DASHBOARD_API_KEY` is set):
- `POST/DELETE /api/pairing/*` - Approve/deny contacts
- `PUT/DELETE /api/pairing/approved/*` - Update tier/revoke approval
- `POST/PUT/DELETE /api/skills/*` - Enable/disable/configure skills
- `POST/DELETE /api/pause` - Pause/resume contacts
- `POST/DELETE /api/kill-switch` - Global pause control

**Authentication Methods:**
```bash
# Bearer token
curl -X POST http://localhost:3000/api/kill-switch \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"duration": 3600}'

# X-API-Key header
curl -X POST http://localhost:3000/api/kill-switch \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"duration": 3600}'
```

**Audit Logging:**
All state-changing operations are logged with structured JSON:
```
[AUDIT] {"action":"ENABLE_KILL_SWITCH","resource":"kill-switch","timestamp":"2024-...","ip":"...","userAgent":"..."}
```

### Input Validation
- Sanitize all user input before graph queries (Cypher injection risk)
- Validate `contactId` format before Redis operations
- Limit message size at Gateway level (`MAX_QUEUE_PAYLOAD_MB`)

### Rate Limiting
```typescript
// Per-contact rate limiting (Gateway)
const count = await redis.incr(`RATE:${contactId}`);
await redis.expire(`RATE:${contactId}`, 60);
if (count > 10) { /* pause contact */ }
```

## Debugging

### Log Locations
| Service | Log Output | Debug Flag |
|---------|------------|------------|
| Gateway | stdout/stderr | `DEBUG=gateway:*` |
| Orchestrator | stdout/stderr | `DEBUG=orchestrator:*` |
| Graph Worker | stdout/stderr | `DEBUG=graph-worker:*` |
| All services | `docker compose logs -f` | - |

### Common Debug Commands
```bash
# Watch all service logs
docker compose logs -f

# Check Redis state
docker exec secondme-redis redis-cli -p 6379
# Then: KEYS PAUSE:*
# Then: XLEN QUEUE:messages

# Check FalkorDB
docker exec secondme-falkordb redis-cli
# Then: GRAPH.QUERY secondme "MATCH (n) RETURN labels(n), count(n)"

# Test service connectivity
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### State Inspection
```bash
# Check paused contacts
docker exec secondme-redis redis-cli -p 6379 KEYS "PAUSE:*"

# View pending messages in queue
docker exec secondme-redis redis-cli -p 6379 XLEN QUEUE:messages

# Check skill status
curl http://localhost:3002/skills | jq

# View contact linking
docker exec secondme-redis redis-cli -p 6379 KEYS "LINKED:*"
```

### Workflow Tracing
Enable verbose logging in Orchestrator:
```bash
LOG_LEVEL=debug npm run dev -w services/orchestrator
```

## Schema & Migration Guidelines

### FalkorDB Schema Changes
1. **Additive changes** (new properties, nodes, relationships): Safe to deploy
2. **Breaking changes** (rename, remove): Requires migration script
3. **Index changes**: Run via `infra/falkordb/init-schema.cypher`

### Migration Pattern
```cypher
-- Example: Add new property with default
MATCH (c:Contact) WHERE c.newField IS NULL
SET c.newField = 'default_value'
RETURN count(c) AS updated;
```

### Redis Key Changes
- **Adding keys**: No migration needed
- **Renaming keys**: Use `RENAME` or dual-write during transition
- **Changing TTL**: Update in code, existing keys expire naturally
- **Removing keys**: Clean up with `SCAN` + `DEL` pattern

## Performance Considerations

### Token Optimization
- Use prompt caching for system prompts (`cache_control: { type: 'ephemeral' }`)
- Haiku for classification, Sonnet for generation
- Monitor `tokens_used_total` metric

### Caching Strategy
| Data | Cache Location | TTL | Invalidation |
|------|---------------|-----|--------------|
| Personas | Redis (`PERSONA:{id}`) | 30 min | Manual on update |
| Voice Prefs | Redis (`CACHE:voice:{contactId}`) | 30 min | On preference change |
| Embeddings | Redis (`EMB:*`) | 5 min | Hash-based key |
| History | In-memory LRU | Session | On disconnect |
| Graph context | None | - | Real-time query |

### Batch Operations
```typescript
// Prefer batch embedding over single calls
const results = await provider.embedBatch(['text1', 'text2', 'text3']);

// Use Redis pipeline for multiple operations
const pipeline = redis.pipeline();
pipeline.get(`PAUSE:${contactId}`);
pipeline.get(`RATE:${contactId}`);
const results = await pipeline.exec();
```

## Contributing

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code improvements
- `docs/description` - Documentation updates

### Commit Messages
```
type(scope): description

feat(gateway): add Telegram channel support
fix(orchestrator): handle empty graph context
refactor(frontend): extract ContactCard component
docs(claude): add security guidelines
```

### PR Checklist
- [ ] Tests pass (`npm run test`)
- [ ] Types check (`npm run type-check`)
- [ ] Lint clean (`npm run lint`)
- [ ] CLAUDE.md updated if architecture changed
