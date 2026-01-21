# Implementation Plan: SecondMe Personal AI Clone

**Branch**: `001-personal-ai-clone` | **Date**: 2026-01-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-personal-ai-clone/spec.md`

## Summary

Build a context-adaptive WhatsApp automation system ("Personal Digital Twin") that responds to messages on the user's behalf while mimicking their communication style and maintaining relationship context through a knowledge graph. The system implements strict Human-in-the-Loop controls (auto-pause, kill switch) and operational security measures (typing simulation, rate limiting) to prevent WhatsApp account bans. Technical approach uses microservices architecture with Next.js 16 dashboard, Node.js WhatsApp gateway, LangGraph.js orchestration, Claude AI tiering (Haiku router + Sonnet reasoner), and FalkorDB for graph-based memory.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Node.js 24.12.0 LTS for backend services, Next.js 16.1.1 for frontend)
**Primary Dependencies**:
- Frontend: Next.js 16.1.1 (App Router), React 19.2, Socket.io-client 4.8.3, Tailwind CSS 4.1.18
- Backend Gateway: Node.js 24.12.0 LTS, whatsapp-web.js 1.34.2, Socket.io 4.8.3
- AI Orchestration: LangGraph.js 1.0.7, @anthropic-ai/sdk 0.71.2 (Claude Sonnet 4.5 + Haiku 4.5)
- Knowledge Graph: FalkorDB 4.14.11 (Redis-protocol compatible graph database)
- State & Queue: Redis 8.4, ioredis 5.9.1 client

**Storage**:
- Primary: FalkorDB 4.14.11 for knowledge graph (entities, relationships, vector embeddings)
- State: Redis 8.4 for session tokens, pause states, message queues
- Logs: File-based logging for audit trail (no message content, metadata only)

**Testing**:
- Contract: Vitest 4.0.16 for API contract tests between microservices
- Integration: Playwright 1.57.0 for end-to-end WhatsApp flow testing
- Unit: Vitest 4.0.16 for business logic, timing algorithms
- Simulation: Custom HTS (Human Typing Simulation) validation suite

**Target Platform**: Linux VPS (Ubuntu 22.04 LTS), Docker Compose orchestration, 24/7 uptime required for WhatsApp socket persistence

**Project Type**: Web application (microservices) - Next.js frontend + multiple Node.js backend services

**Performance Goals**:
- Message Response Latency: P95 < 3s (Tier 2), P95 < 5s (including HTS delay)
- Router Classification: P95 < 200ms
- Graph Query Performance: P95 < 50ms
- Dashboard Load Time: < 1s on 3G connection
- Real-time Updates: < 2s latency for dashboard message reflection

**Constraints**:
- Must maintain persistent WhatsApp connection (no serverless)
- Human Typing Simulation mandatory: minimum 2s delay, formula-based calculation
- Rate limiting: auto-pause at 10 msgs/min
- Session expiry: 24-hour max, QR re-auth required
- No message content in logs (PII protection)
- Encryption at rest for graph data
- TypeScript strict mode enforced

**Scale/Scope**:
- Single user per deployment (no multi-tenancy)
- Target: 50-100 active contacts per user
- Message volume: ~100-500 messages/day
- Knowledge graph: ~10,000 entities, ~50,000 relationships at maturity
- Chat history ingestion: background processing of 1M+ historical messages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Microservices Architecture ✅ PASS

**Requirement**: Strict separation between WhatsApp connectivity, AI orchestration, and memory systems.

**Implementation Plan**:
- ✅ **Service 1 - WhatsApp Gateway**: Node.js + whatsapp-web.js (port 3001)
  - Handles QR auth, message receipt, sending, connection management
  - Publishes messages to Redis queue, no business logic
- ✅ **Service 2 - AI Orchestrator**: Node.js + LangGraph.js (port 3002)
  - Consumes message queue, routes to Haiku/Sonnet, manages workflows
  - No direct WhatsApp dependency
- ✅ **Service 3 - Next.js Dashboard**: Frontend + API routes (port 3000)
  - User interface, persona management, real-time monitoring via Socket.io
  - Reads state from Redis, sends commands to services
- ✅ **Service 4 - FalkorDB**: Graph database (port 6379)
  - Independent graph storage, queried by orchestrator
- ✅ **Service 5 - Redis**: State & queue manager (port 6380)
  - Session tokens, pause states, message queues

**Independent Deployment**: Each service in separate Docker container with health checks. Services can restart without cascading failures.

**Gate Status**: PASS - Architecture adheres to microservices principle with clear service boundaries.

---

### II. AI Model Tiering ✅ PASS

**Requirement**: Cost-optimized tiered model strategy (Haiku router + Sonnet reasoner).

**Implementation Plan**:
- ✅ **Tier 1 Router**: Claude Haiku 4.5 classifies messages as Phatic/Substantive
  - Estimated: 40% of traffic, ~$1.00/1M tokens
  - LangGraph decision node routes based on classification
- ✅ **Tier 2 Reasoner**: Claude Sonnet 4.5 handles substantive messages
  - Retrieves graph context, applies persona, generates response
  - Utilizes Anthropic prompt caching for persona guides (90% cost reduction)
- ✅ **Logging**: Token usage tracked per message type in metrics service
- ✅ **Monitoring**: Router accuracy logged for continuous improvement

**Gate Status**: PASS - Tiering strategy implemented as specified.

---

### III. Human-in-the-Loop Control (NON-NEGOTIABLE) ✅ PASS

**Requirement**: Absolute user control with auto-pause and kill switch.

**Implementation Plan**:
- ✅ **Auto-Pause Detection**: WhatsApp Gateway listens for `fromMe: true` messages
  - Sets `PAUSE:{contactId}` Redis key with 60-minute TTL
  - Orchestrator checks Redis before queuing responses
- ✅ **Master Kill Switch**: Dashboard button sets global `PAUSE:ALL` key
  - All services check this key before any bot action
  - Instant propagation via Redis pub/sub
- ✅ **Opt-In Activation**: Per-contact enable/disable stored in Redis
  - Default: bot disabled for all contacts
  - Explicit user action required to activate
- ✅ **Transparency**: All bot messages logged with `bot_sent: true` flag
  - Dashboard displays full conversation history with visual indicators
- ✅ **Override Priority**: Message processing checks pause state first, always

**Gate Status**: PASS - All HITL requirements implemented with Redis-backed state management.

---

### IV. Operational Security ✅ PASS

**Requirement**: Human behavior simulation to avoid WhatsApp detection.

**Implementation Plan**:
- ✅ **HTS Algorithm**: Implemented in orchestrator service
  ```
  delay_ms = (word_count * 300) + random(2000, 5000)
  ```
  - Triggers WhatsApp "typing..." indicator via gateway API
  - No instant responses (minimum 2s enforced)
- ✅ **Rate Limiting Circuit Breaker**:
  - Message counter per contact (sliding 1-minute window in Redis)
  - Auto-pause triggered at 10 msgs/min threshold
  - Anomaly detection flags unusual patterns
- ✅ **Session Hygiene**:
  - QR code expires after 24 hours (enforced by whatsapp-web.js)
  - Session token refresh mechanism in gateway
- ✅ **Behavioral Patterns**:
  - Randomized cognitive pause (2-5s jitter)
  - Sleep hours enforcement (no responses during configured window)
  - Natural variance in response timing

**Gate Status**: PASS - HTS and security measures fully specified.

---

### V. Graph-Based Memory ✅ PASS

**Requirement**: FalkorDB knowledge graph for contextual memory.

**Implementation Plan**:
- ✅ **Graph Schema**:
  - Nodes: User, Contact, Person, Company, Event, Topic
  - Edges: WORKS_AT, KNOWS, MENTIONED, DISCUSSED, ATTENDED
- ✅ **Background Ingestion**:
  - LangGraph background agent processes chat exports
  - Entity extraction via Claude Sonnet with structured output
  - Asynchronous graph updates (non-blocking)
- ✅ **Contextual Retrieval**:
  - Cypher queries to FalkorDB before response generation
  - 2-hop graph traversal for relationship context
  - Vector similarity search for relevant topics
- ✅ **Memory Updates**:
  - Real-time fact extraction from new messages
  - Graph updates queued in Redis, processed async
- ✅ **Privacy**:
  - FalkorDB data directory encrypted at rest (LUKS)
  - Authentication required for all graph connections

**Gate Status**: PASS - Graph-based memory architecture specified.

---

### Technology Stack Compliance ✅ PASS

**Mandated Technologies** (from Constitution):

| Component | Required | Planned | Status |
|-----------|----------|---------|--------|
| Frontend | Next.js 16 (App Router) | Next.js 16.1.1 | ✅ |
| Backend Gateway | Node.js 20+ | Node.js 24.12.0 LTS | ✅ |
| AI Orchestration | LangGraph.js | LangGraph.js 1.0.7 | ✅ |
| Primary LLM | Claude Sonnet 4.5 | Claude Sonnet 4.5 | ✅ |
| Router LLM | Claude Haiku 4.5 | Claude Haiku 4.5 | ✅ |
| Knowledge Graph | FalkorDB | FalkorDB 4.14.11 | ✅ |
| State & Queue | Redis 7+ | Redis 8.4 | ✅ |
| Deployment | Docker Compose | Docker Compose v5 | ✅ |

**Prohibited Patterns** (verification):
- ❌ Serverless functions → ✅ Using persistent Node.js services
- ❌ Separate vector DB → ✅ FalkorDB native vector search
- ❌ Synchronous chat processing → ✅ Background ingestion pipeline
- ❌ Plaintext graph storage → ✅ Encryption at rest specified

**Gate Status**: PASS - All technology requirements met.

---

### Testing Requirements ✅ PASS

**Requirement**: Contract, integration, simulation, and user acceptance testing.

**Implementation Plan**:
- ✅ **Contract Tests**: Vitest suite validating API contracts
  - Gateway ↔ Orchestrator message format
  - Orchestrator ↔ FalkorDB query interface
  - Dashboard ↔ Services API boundaries
- ✅ **Integration Tests**: Playwright end-to-end flows
  - QR authentication → message receipt → bot response
  - User override → auto-pause verification
  - HTS timing validation
- ✅ **Simulation Tests**: Custom HTS validation suite
  - Rate limiting triggers correctly
  - Typing delay formula accuracy
  - Sleep hours enforcement
- ✅ **User Acceptance**: Real WhatsApp test account
  - Phase deliverable demonstrations
  - Pilot contact group testing

**Gate Status**: PASS - Testing strategy comprehensive and aligned with constitution.

---

### Code Quality & Security ✅ PASS

**Constitution Requirements**:
- ✅ TypeScript strict mode enabled (tsconfig.json)
- ✅ ESLint + Prettier configured with pre-commit hooks
- ✅ CI/CD pipeline: lint → type-check → test before merge
- ✅ Dependency license scanning (no AGPL)
- ✅ Environment variables for API keys (no commits)
- ✅ WhatsApp session tokens encrypted with AES-256
- ✅ FalkorDB authentication required
- ✅ HTTPS for dashboard (Caddy reverse proxy)
- ✅ Logs exclude message content (metadata only)

**Gate Status**: PASS - Quality and security gates specified.

---

### Performance Standards ✅ PASS

**Constitution Benchmarks**:

| Metric | Target | Implementation |
|--------|--------|----------------|
| Message Response (P95) | < 3s (Tier 2) | Measured in integration tests |
| Router Classification (P95) | < 200ms | Haiku latency monitoring |
| Graph Query (P95) | < 50ms | FalkorDB query profiling |
| Dashboard Load | < 1s (3G) | Lighthouse CI checks |

**Gate Status**: PASS - Performance benchmarks defined and testable.

---

## OVERALL CONSTITUTION CHECK: ✅ PASS

All 5 core principles satisfied. Technology stack compliant. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-personal-ai-clone/
├── plan.md              # This file
├── research.md          # Phase 0: Technology validation & best practices
├── data-model.md        # Phase 1: Entity schemas & graph structure
├── quickstart.md        # Phase 1: Local setup & development guide
├── contracts/           # Phase 1: API specifications
│   ├── gateway-api.yaml       # WhatsApp Gateway REST API
│   ├── orchestrator-api.yaml  # AI Orchestrator API
│   ├── graph-schema.cypher    # FalkorDB schema definition
│   └── redis-schema.md        # Redis key patterns
└── tasks.md             # Phase 2: Generated by /speckit.tasks command
```

### Source Code (repository root)

```text
# Option 2: Web application (microservices architecture)

# Shared configuration
.env.example                  # Environment template
.env                          # Local config (gitignored)
docker-compose.yml            # Service orchestration
package.json                  # Workspace root

# Service 1: WhatsApp Gateway
services/
├── gateway/
│   ├── src/
│   │   ├── index.ts                # Entry point
│   │   ├── whatsapp/
│   │   │   ├── client.ts           # whatsapp-web.js wrapper
│   │   │   ├── auth.ts             # QR code management
│   │   │   ├── message-handler.ts  # Incoming message processing
│   │   │   └── sender.ts           # Outgoing message + typing indicator
│   │   ├── redis/
│   │   │   ├── publisher.ts        # Publish messages to queue
│   │   │   └── state-manager.ts    # Pause state checks
│   │   └── api/
│   │       └── routes.ts           # Health check, status endpoints
│   ├── tests/
│   │   ├── contract/
│   │   │   └── message-format.test.ts
│   │   └── integration/
│   │       └── whatsapp-flow.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile

# Service 2: AI Orchestrator
├── orchestrator/
│   ├── src/
│   │   ├── index.ts                # Entry point
│   │   ├── langgraph/
│   │   │   ├── workflow.ts         # Main decision graph
│   │   │   ├── router-node.ts      # Haiku classification
│   │   │   ├── reasoner-node.ts    # Sonnet response generation
│   │   │   └── graph-node.ts       # FalkorDB context retrieval
│   │   ├── anthropic/
│   │   │   ├── haiku-client.ts     # Router LLM
│   │   │   ├── sonnet-client.ts    # Reasoner LLM
│   │   │   └── prompt-templates.ts # Cached prompts
│   │   ├── hts/
│   │   │   ├── delay-calculator.ts # Typing simulation formula
│   │   │   └── rate-limiter.ts     # Circuit breaker
│   │   ├── redis/
│   │   │   ├── consumer.ts         # Message queue consumer
│   │   │   └── state-manager.ts    # Pause checks, metrics
│   │   └── falkordb/
│   │       ├── client.ts           # Graph connection
│   │       └── queries.ts          # Context retrieval Cypher
│   ├── tests/
│   │   ├── contract/
│   │   │   └── orchestrator-api.test.ts
│   │   ├── integration/
│   │   │   └── end-to-end-flow.test.ts
│   │   └── unit/
│   │       ├── hts.test.ts
│   │       └── router.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile

# Service 3: Knowledge Graph Ingestion Worker
├── graph-worker/
│   ├── src/
│   │   ├── index.ts                # Entry point
│   │   ├── ingestion/
│   │   │   ├── chat-parser.ts      # Parse WhatsApp export files
│   │   │   ├── entity-extractor.ts # Claude Sonnet entity extraction
│   │   │   └── graph-builder.ts    # FalkorDB entity/relationship creation
│   │   ├── redis/
│   │   │   └── consumer.ts         # Consume chat history queue
│   │   └── falkordb/
│   │       ├── client.ts
│   │       └── mutations.ts        # Graph write operations
│   ├── tests/
│   │   └── integration/
│   │       └── ingestion-flow.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile

# Frontend: Next.js Dashboard
frontend/
├── src/
│   ├── app/                        # App Router
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Dashboard home
│   │   ├── auth/
│   │   │   └── page.tsx            # QR code authentication
│   │   ├── contacts/
│   │   │   ├── page.tsx            # Contact list with bot status
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Conversation view
│   │   ├── persona/
│   │   │   └── page.tsx            # Persona editor
│   │   └── api/
│   │       ├── status/route.ts     # Server Action: Get bot status
│   │       ├── pause/route.ts      # Server Action: Pause/resume
│   │       └── kill-switch/route.ts # Server Action: Global pause
│   ├── components/
│   │   ├── ui/                     # Shadcn/ui components
│   │   ├── QRCodeDisplay.tsx
│   │   ├── ContactList.tsx
│   │   ├── ConversationThread.tsx
│   │   ├── PersonaEditor.tsx
│   │   └── KillSwitch.tsx
│   ├── lib/
│   │   ├── socket.ts               # Socket.io client
│   │   ├── redis-client.ts         # Server-side Redis access
│   │   └── api.ts                  # API helpers
│   └── styles/
│       └── globals.css             # Tailwind config
├── tests/
│   └── e2e/
│       └── dashboard.spec.ts       # Playwright tests
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
└── Dockerfile

# Infrastructure
infra/
├── redis/
│   └── redis.conf                  # Redis configuration
├── falkordb/
│   ├── init-schema.cypher          # Initial graph schema
│   └── falkordb.conf
└── caddy/
    └── Caddyfile                   # Reverse proxy for HTTPS
```

**Structure Decision**: Web application (Option 2) with microservices architecture. Three backend services (Gateway, Orchestrator, Graph Worker) + Next.js frontend. Docker Compose manages all services with Redis and FalkorDB as shared infrastructure. This structure supports independent service deployment, clear separation of concerns per Constitution Principle I, and scalable development with parallel team workflows.

## Complexity Tracking

> No violations detected. All constitution checks pass.

## Phase 0: Research & Technology Validation

**Goal**: Validate technology choices and resolve any integration unknowns before design phase.

**Research Areas**:

1. **whatsapp-web.js Stability**
   - Validate current version compatibility with WhatsApp Web protocol
   - Research ban mitigation strategies and community best practices
   - Document session persistence patterns

2. **LangGraph.js Workflow Patterns**
   - Research cyclic graph patterns for message routing
   - Validate state persistence with Redis
   - Document error handling and retry logic

3. **FalkorDB Integration**
   - Validate Redis protocol compatibility with Node.js clients
   - Research Cypher query patterns for graph traversal
   - Document vector search integration for semantic retrieval

4. **Anthropic API Prompt Caching**
   - Validate caching headers for persona guides
   - Research optimal cache structure for graph schemas
   - Measure cache hit rate impact on latency/cost

5. **HTS (Human Typing Simulation) Algorithm**
   - Research WhatsApp typing indicator API
   - Validate delay calculation formula against human benchmarks
   - Document rate limiting detection thresholds

6. **Next.js 16 Socket.io Integration**
   - Research App Router compatibility with Socket.io
   - Validate Server Actions for real-time state updates
   - Document WebSocket connection management

**Output**: `research.md` with decisions, rationales, and implementation patterns

## Phase 1: Design & Contracts

**Goal**: Design data models, API contracts, and graph schema.

### 1.1 Data Model Design (`data-model.md`)

**Entities to Model**:

1. **User Entity** (Graph + Redis)
   - Graph: User node with preferences, default persona
   - Redis: Session token, global pause state

2. **Contact Entity** (Graph + Redis)
   - Graph: Contact node with relationship type, history metadata
   - Redis: Per-contact pause state, message counter

3. **Message Entity** (Transient + Logs)
   - Queue: Message payload in Redis stream
   - Logs: Metadata only (timestamp, sender, type, bot_sent flag)

4. **Persona Entity** (Graph + Redis Cache)
   - Graph: Persona node with style guide, relationship mappings
   - Redis: Cached persona for prompt injection

5. **Knowledge Graph Entities** (FalkorDB)
   - Person: name, occupation, relationships
   - Company: name, industry
   - Event: name, date, participants
   - Topic: name, category

6. **Knowledge Graph Relationships** (FalkorDB)
   - WORKS_AT: (Person)-->(Company)
   - KNOWS: (Contact)-->(Person)
   - MENTIONED: (Contact)-->(Topic)
   - DISCUSSED: (Contact)-->(Event)
   - ATTENDED: (User)-->(Event)

**Validation Rules**:
- Session tokens: 24-hour expiry enforced
- Pause states: TTL-based auto-resume
- Message queue: FIFO ordering with priority for user overrides
- Graph data: Encryption at rest, authentication required

**State Transitions**:
- Contact state: Disabled → Enabled (user action)
- Contact state: Enabled → Paused (auto-pause trigger)
- Contact state: Paused → Enabled (TTL expiry or user action)
- Session state: Connected → Expired → Re-auth Required

### 1.2 API Contracts (`/contracts/`)

**Gateway API** (`gateway-api.yaml`):
```yaml
/health:
  GET: Returns WhatsApp connection status

/auth/qr:
  GET: Stream QR code updates via Server-Sent Events

/messages/send:
  POST: Send message with typing indicator
  Body: { contactId, content, typingDelayMs }
```

**Orchestrator API** (`orchestrator-api.yaml`):
```yaml
/classify:
  POST: Route message through Haiku classifier
  Body: { content, contactId }
  Response: { type: 'phatic' | 'substantive' }

/respond:
  POST: Generate response with context
  Body: { content, contactId, context }
  Response: { response, tokensUsed, model }
```

**Graph Schema** (`graph-schema.cypher`):
```cypher
CREATE (u:User {id: 'user-1', defaultPersona: 'professional'})
CREATE (c:Contact {id: 'contact-1', phone: '+1234567890', relationshipType: 'colleague'})
CREATE (u)-[:HAS_CONTACT]->(c)

CREATE (p:Person {name: 'John Doe', occupation: 'Engineer'})
CREATE (comp:Company {name: 'Google', industry: 'Tech'})
CREATE (p)-[:WORKS_AT]->(comp)
CREATE (c)-[:KNOWS]->(p)
```

**Redis Schema** (`redis-schema.md`):
```
Keys:
- SESSION:{userId} → WhatsApp session token (24h TTL)
- PAUSE:{contactId} → Pause expiry timestamp (60min TTL)
- PAUSE:ALL → Global kill switch flag
- COUNTER:{contactId}:msgs → Message count (1min sliding window)
- QUEUE:messages → Redis Stream for incoming messages
- CACHE:persona:{personaId} → Cached persona guide

Pub/Sub Channels:
- events:pause → Pause state changes
- events:messages → Real-time message updates for dashboard
```

### 1.3 Quickstart Guide (`quickstart.md`)

**Contents**:
1. Prerequisites: Node.js 20+, Docker, Anthropic API key
2. Clone repository
3. Configure `.env` from template
4. Run `docker-compose up -d`
5. Open dashboard at `http://localhost:3000`
6. Scan QR code to authenticate
7. Enable bot for test contact
8. Send test message and verify response
9. Run test suite: `npm test`

### 1.4 Agent Context Update

Run `.specify/scripts/bash/update-agent-context.sh claude` to add:
- TypeScript 5.9.3
- Next.js 16.1.1 (App Router)
- React 19.2
- LangGraph.js 1.0.7
- @anthropic-ai/sdk 0.71.2
- whatsapp-web.js 1.34.2
- FalkorDB 4.14.11
- Socket.io 4.8.3
- ioredis 5.9.1
- Vitest 4.0.16
- Playwright 1.57.0
- ESLint 9.x (flat config)
- Prettier 3.7.4
- Tailwind CSS 4.1.18

**Output**: Updated `.claude/context.md` (or equivalent agent-specific file)

## Phase 2: Re-Evaluate Constitution Check

**Post-Design Validation**:

After completing data-model.md, contracts/, and quickstart.md, re-validate each constitution principle:

1. ✅ **Microservices Architecture**: Confirmed in API contracts (separate services communicating via Redis/HTTP)
2. ✅ **AI Model Tiering**: Confirmed in orchestrator API (/classify → /respond flow)
3. ✅ **Human-in-the-Loop**: Confirmed in Redis schema (PAUSE keys, global switch)
4. ✅ **Operational Security**: Confirmed in Gateway API (typingDelayMs parameter)
5. ✅ **Graph-Based Memory**: Confirmed in FalkorDB schema (entities + relationships)

**Final Gate Status**: ✅ PASS

All principles validated at design level. Ready to proceed to `/speckit.tasks` for implementation task breakdown.

---

## Next Steps

This plan is complete through Phase 1 design. Next command: `/speckit.tasks` to generate dependency-ordered task list for implementation.

**Deliverables Created**:
- ✅ `plan.md` (this file)
- ⏳ `research.md` (Phase 0 - to be generated)
- ⏳ `data-model.md` (Phase 1 - to be generated)
- ⏳ `contracts/` (Phase 1 - to be generated)
- ⏳ `quickstart.md` (Phase 1 - to be generated)

**Ready For**: Phase 0 research execution
