# CLAUDE.md

This file provides guidance for Claude Code when working with the SecondMe project.

## Quick Navigation

- [Backend Services Guidelines](services/CLAUDE.md)
- [Frontend Dashboard Guidelines](frontend/CLAUDE.md)
- [Project Specifications](specs/001-personal-ai-clone/)

## Project Overview

SecondMe is a **Context-Adaptive WhatsApp Bot** that acts as a personal AI clone. It uses Claude AI with knowledge graph memory for context-aware conversations.

```
SecondMe/
├── frontend/                 # Next.js 16.1.1 Dashboard
│   └── src/
│       ├── app/             # App Router pages & API routes
│       ├── components/      # React 19.2 components
│       └── lib/             # Utilities (socket, redis)
├── services/
│   ├── gateway/             # WhatsApp Web.js integration (port 3001)
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
WhatsApp Message → Gateway → QUEUE:messages → Orchestrator → Claude
                                                    ↓
WhatsApp ← Gateway ← QUEUE:responses ← Orchestrator ←
```

## Code Style

- **Formatting**: Prettier with project defaults (`.prettierrc.json`)
- **Linting**: ESLint 9 flat config (`eslint.config.js`)
- **Imports**: Use workspace aliases when available
- **Types**: Strict TypeScript, avoid `any`
- **Async**: Always handle promise rejections
- **Logging**: Use structured logger from `src/utils/logger.ts`

## Critical Patterns

### Redis Keys
- `PAUSE:ALL` - Global kill switch
- `PAUSE:{contactId}` - Contact-specific pause
- `RATE:{contactId}` - Rate limit counter
- `PERSONA:{id}` - Cached persona (30-min TTL)

### Environment Variables
Required in `.env`:
- `ANTHROPIC_API_KEY` - Claude API access
- `FALKORDB_PASSWORD` - Graph database auth
- `NODE_ENV` - development/production

### Version Gotchas

**Node.js 24**: OpenSSL 3.5 rejects keys < 2048 bits

**React 19**: `useRef()` requires argument → `useRef(null)`

**Next.js 16**: Route params are async → `const { id } = await params`

**LangGraph 1.0**: Stable API, `toolsCondition` undeprecated

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
