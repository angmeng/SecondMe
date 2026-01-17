# Tasks: SecondMe Personal AI Clone

**Input**: Design documents from `/specs/001-personal-ai-clone/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Tests are NOT explicitly requested in the feature specification. Tasks focus on implementation only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `- [ ] [ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

This is a web application with microservices architecture:
- **Backend Services**: `services/gateway/src/`, `services/orchestrator/src/`, `services/graph-worker/src/`
- **Frontend**: `frontend/src/`
- **Infrastructure**: `infra/`
- **Shared**: Root-level configuration

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, configuration files, and Docker infrastructure

- [X] T001 Create directory structure per plan.md (services/, frontend/, infra/, logs/)
- [X] T002 [P] Create .gitignore for Node.js, Docker, and WhatsApp session data
- [X] T003 [P] Create .env.example with all environment variables from quickstart.md
- [X] T004 [P] Configure TypeScript workspace tsconfig.json at project root with Node 24 targets
- [X] T005 [P] Configure ESLint 9 flat config at eslint.config.js with TypeScript rules
- [X] T006 [P] Configure Prettier at .prettierrc.json
- [X] T007 [P] Create root package.json with npm workspaces and concurrently scripts
- [X] T008 Setup Docker Compose file docker-compose.yml with Redis, FalkorDB, and service definitions
- [X] T009 [P] Create Redis configuration file at infra/redis/redis.conf
- [X] T010 [P] Create FalkorDB initialization schema at infra/falkordb/init-schema.cypher from contracts/graph-schema.cypher
- [X] T011 [P] Create Caddy reverse proxy configuration at infra/caddy/Caddyfile for HTTPS

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Gateway Service Foundation

- [X] T012 Initialize Gateway service package.json with whatsapp-web.js 1.34.2, ioredis 5.9.1, socket.io 4.8.3
- [X] T013 Create Gateway TypeScript config at services/gateway/tsconfig.json extending workspace config
- [X] T014 [P] Create Gateway Dockerfile with Node 24.12.0-alpine and Puppeteer dependencies
- [X] T015 [P] Create Gateway entry point at services/gateway/src/index.ts with service startup
- [X] T016 [P] Implement Redis client initialization at services/gateway/src/redis/client.ts with ioredis
- [X] T017 [P] Implement WhatsApp client wrapper at services/gateway/src/whatsapp/client.ts using LocalAuth

### Orchestrator Service Foundation

- [X] T018 Initialize Orchestrator package.json with LangGraph.js 1.0.7, @anthropic-ai/sdk 0.71.2, ioredis 5.9.1
- [X] T019 Create Orchestrator TypeScript config at services/orchestrator/tsconfig.json extending workspace config
- [X] T020 [P] Create Orchestrator Dockerfile with Node 24.12.0-alpine
- [X] T021 [P] Create Orchestrator entry point at services/orchestrator/src/index.ts
- [X] T022 [P] Implement Redis client at services/orchestrator/src/redis/client.ts
- [X] T023 [P] Implement FalkorDB client at services/orchestrator/src/falkordb/client.ts with ioredis and GRAPH.QUERY
- [X] T024 [P] Implement Anthropic Haiku client at services/orchestrator/src/anthropic/haiku-client.ts
- [X] T025 [P] Implement Anthropic Sonnet client at services/orchestrator/src/anthropic/sonnet-client.ts with prompt caching

### Graph Worker Service Foundation

- [X] T026 Initialize Graph Worker package.json with @anthropic-ai/sdk 0.71.2, ioredis 5.9.1
- [X] T027 Create Graph Worker TypeScript config at services/graph-worker/tsconfig.json extending workspace config
- [X] T028 [P] Create Graph Worker Dockerfile with Node 24.12.0-alpine
- [X] T029 [P] Create Graph Worker entry point at services/graph-worker/src/index.ts
- [X] T030 [P] Implement Redis client at services/graph-worker/src/redis/client.ts
- [X] T031 [P] Implement FalkorDB client at services/graph-worker/src/falkordb/client.ts

### Frontend Foundation

- [X] T032 Initialize Frontend package.json with Next.js 16.1.1, React 19.2, Socket.io-client 4.8.3, Tailwind 4.1.18
- [X] T033 Create Frontend TypeScript config at frontend/tsconfig.json with Next.js plugin
- [X] T034 [P] Create Frontend Dockerfile with Node 24.12.0-alpine for production build
- [X] T035 [P] Configure Next.js at frontend/next.config.js with custom server support
- [X] T036 [P] Configure Tailwind CSS at frontend/tailwind.config.js and frontend/src/styles/globals.css
- [X] T037 [P] Create custom Next.js server at frontend/server.ts with Socket.io integration
- [X] T038 [P] Create Socket.io client singleton at frontend/src/lib/socket.ts
- [X] T039 [P] Create Redis client for Server Actions at frontend/src/lib/redis-client.ts
- [X] T040 [P] Create root layout at frontend/src/app/layout.tsx with Tailwind and metadata

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - WhatsApp Bot Activation & Control (Priority: P1) 🎯 MVP

**Goal**: Enable users to activate their Personal AI Clone for specific WhatsApp contacts with full control via master kill switch, auto-pause on user intervention, and rate limiting

**Independent Test**:
1. Authenticate with WhatsApp via QR code
2. Enable bot for a test contact
3. Send message from test contact → bot responds
4. Send message from user's phone → bot pauses for 60 minutes
5. Click master kill switch → all bot activity stops immediately
6. Send 11 messages rapidly → bot auto-pauses due to rate limit

### US1 - Gateway Service (WhatsApp Integration)

- [X] T041 [P] [US1] Implement QR code authentication handler at services/gateway/src/whatsapp/auth.ts with SSE streaming
- [X] T042 [P] [US1] Implement message handler at services/gateway/src/whatsapp/message-handler.ts to detect incoming messages
- [X] T043 [US1] Implement fromMe detection logic in message handler to trigger auto-pause via Redis PAUSE:{contactId}
- [X] T044 [P] [US1] Implement message sender at services/gateway/src/whatsapp/sender.ts with typing indicator support
- [X] T045 [US1] Implement Redis message publisher at services/gateway/src/redis/publisher.ts to XADD to QUEUE:messages stream
- [X] T046 [US1] Implement pause state manager at services/gateway/src/redis/state-manager.ts to check PAUSE:ALL and PAUSE:{contactId}
- [X] T047 [P] [US1] Implement Gateway REST API routes at services/gateway/src/api/routes.ts for health check and status endpoints
- [X] T048 [US1] Wire up QR event emission to Socket.io in auth.ts for dashboard streaming

### US1 - Orchestrator Service (Message Processing & Pause Control)

- [X] T049 [P] [US1] Implement Redis message consumer at services/orchestrator/src/redis/consumer.ts using XREAD on QUEUE:messages
- [X] T050 [P] [US1] Implement pause state checker at services/orchestrator/src/redis/state-manager.ts for PAUSE:ALL and PAUSE:{contactId}
- [X] T051 [P] [US1] Implement rate limiter at services/orchestrator/src/hts/rate-limiter.ts using COUNTER:{contactId}:msgs with auto-pause trigger
- [X] T052 [US1] Implement basic LangGraph workflow at services/orchestrator/src/langgraph/workflow.ts with pause check before processing
- [X] T053 [US1] Implement simple response node at services/orchestrator/src/langgraph/reasoner-node.ts using Sonnet for basic replies
- [X] T054 [US1] Wire up message consumer to workflow execution with pause state validation
- [X] T055 [US1] Implement response publishing back to Gateway via Redis pub/sub on events:messages channel

### US1 - Frontend Dashboard (Control Interface)

- [X] T056 [P] [US1] Create QR code authentication page at frontend/src/app/auth/page.tsx with SSE connection to Gateway
- [X] T057 [P] [US1] Create QR code display component at frontend/src/components/QRCodeDisplay.tsx
- [X] T058 [P] [US1] Create contacts list page at frontend/src/app/contacts/page.tsx
- [X] T059 [P] [US1] Create contact list component at frontend/src/components/ContactList.tsx with bot enable/disable toggle
- [X] T060 [US1] Create Server Action at frontend/src/app/api/pause/route.ts to set/clear PAUSE:{contactId} in Redis
- [X] T061 [P] [US1] Create master kill switch component at frontend/src/components/KillSwitch.tsx
- [X] T062 [US1] Create kill switch Server Action at frontend/src/app/api/kill-switch/route.ts to set/clear PAUSE:ALL
- [X] T063 [US1] Implement real-time status updates using Socket.io client subscription to events:pause channel
- [X] T064 [US1] Create dashboard home page at frontend/src/app/page.tsx showing connection status and kill switch

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently
- User can authenticate with WhatsApp
- User can enable/disable bot per contact
- Bot respects pause states (fromMe, kill switch, rate limit)
- Dashboard shows real-time status

---

## Phase 4: User Story 2 - Context-Aware Personalized Responses (Priority: P2)

**Goal**: Transform bot from generic chatbot to digital twin by applying user-defined communication styles (personas) and incorporating knowledge graph context about relationships and past conversations

**Independent Test**:
1. Configure persona style guide in Persona Editor
2. Add chat history to build knowledge graph with facts about contacts
3. Send message that requires context (e.g., "How's work?") → bot retrieves contact's company from graph
4. Verify response matches persona tone and includes relevant context
5. Test persona switching between professional/casual/family contacts

### US2 - Orchestrator Service (Persona & Context Retrieval)

- [X] T065 [P] [US2] Implement Haiku router node at services/orchestrator/src/langgraph/router-node.ts to classify phatic vs substantive messages
- [X] T066 [P] [US2] Implement graph context retrieval at services/orchestrator/src/falkordb/queries.ts with 2-hop Cypher queries
- [X] T067 [US2] Implement graph query node at services/orchestrator/src/langgraph/graph-node.ts calling FalkorDB for contact context
- [X] T068 [US2] Implement persona cache loader at services/orchestrator/src/redis/persona-cache.ts using CACHE:persona:{personaId}
- [X] T069 [US2] Update reasoner node to inject persona style guide and graph context into Sonnet prompt with cache_control
- [X] T070 [US2] Implement conditional routing in workflow: phatic → skip graph query, substantive → retrieve context
- [X] T071 [P] [US2] Implement prompt template builder at services/orchestrator/src/anthropic/prompt-templates.ts with cached persona sections
- [X] T072 [US2] Implement token usage logging in reasoner node for cost tracking

### US2 - Graph Worker Service (Knowledge Extraction)

- [X] T073 [P] [US2] Implement chat parser at services/graph-worker/src/ingestion/chat-parser.ts to parse WhatsApp export format
- [X] T074 [P] [US2] Implement entity extractor at services/graph-worker/src/ingestion/entity-extractor.ts using Claude Sonnet structured output
- [X] T075 [US2] Implement graph builder at services/graph-worker/src/ingestion/graph-builder.ts to create Person, Company, Event, Topic nodes
- [X] T076 [US2] Implement FalkorDB mutations at services/graph-worker/src/falkordb/mutations.ts for MERGE entities and relationships
- [X] T077 [US2] Implement Redis consumer for chat history queue at services/graph-worker/src/redis/consumer.ts
- [X] T078 [US2] Implement real-time fact extraction from new messages (consume events:messages and extract entities)
- [X] T079 [US2] Implement background ingestion job that processes uploaded chat exports asynchronously

### US2 - Frontend Dashboard (Persona Management)

- [X] T080 [P] [US2] Create persona editor page at frontend/src/app/persona/page.tsx
- [X] T081 [P] [US2] Create persona editor component at frontend/src/components/PersonaEditor.tsx with style guide textarea
- [X] T082 [US2] Create Server Action at frontend/src/app/api/persona/route.ts to update Persona nodes in FalkorDB
- [X] T083 [US2] Implement persona loading from FalkorDB in editor page using async React 19 pattern
- [X] T084 [US2] Create conversation view page at frontend/src/app/contacts/[id]/page.tsx with message thread
- [X] T085 [P] [US2] Create conversation thread component at frontend/src/components/ConversationThread.tsx
- [X] T086 [US2] Implement Socket.io subscription for real-time message updates in conversation view
- [X] T087 [US2] Add visual indicators to distinguish bot-sent vs user-sent messages in thread component

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently
- Bot applies persona styles to responses
- Bot retrieves and uses relationship context from graph
- Router classifies messages to optimize costs
- Knowledge graph updates from conversations

---

## Phase 5: User Story 3 - Natural Human Behavior Simulation (Priority: P3)

**Goal**: Simulate realistic human typing patterns with calculated delays, typing indicators, sleep hours enforcement, and session management to avoid WhatsApp detection

**Independent Test**:
1. Send 50-word message → verify delay is ~17-20 seconds (formula: 50*300ms + 2-5s cognitive pause)
2. Watch dashboard during delay → verify "typing..." indicator shows
3. Send message at 2 AM with sleep hours 11 PM - 7 AM → bot does NOT respond until after 7 AM
4. Monitor 3 consecutive messages → verify cognitive pause varies randomly between 2-5s
5. Keep session active for 24 hours → verify QR re-authentication required

### US3 - Orchestrator Service (HTS Algorithm)

- [X] T088 [P] [US3] Implement typing delay calculator at services/orchestrator/src/hts/delay-calculator.ts using formula: (words * 300) + random(2000, 5000)
- [X] T089 [P] [US3] Implement sleep hours checker at services/orchestrator/src/hts/sleep-hours.ts querying User node for sleepHoursStart/End
- [X] T090 [US3] Update workflow to calculate typing delay before sending response
- [X] T091 [US3] Update workflow to check sleep hours and defer messages until wake time
- [X] T092 [US3] Implement deferred message queue in Redis for messages waiting until after sleep hours
- [X] T093 [US3] Pass calculated typingDelayMs to Gateway via response payload

### US3 - Gateway Service (Typing Simulation & Session Management)

- [X] T094 [US3] Update sender.ts to implement sendWithTyping function using chat.sendStateTyping() and delay
- [X] T095 [US3] Implement session expiry tracker at services/gateway/src/whatsapp/session-manager.ts with 24-hour TTL
- [X] T096 [US3] Implement session refresh logic to update SESSION:{userId} Redis key on activity
- [X] T097 [US3] Emit session expiry event when 24 hours elapsed to trigger QR re-auth requirement
- [X] T098 [US3] Update message sender to respect typingDelayMs parameter: start typing → wait → stop typing → send

### US3 - Frontend Dashboard (Sleep Hours Configuration)

- [X] T099 [P] [US3] Add sleep hours configuration to persona/settings page
- [X] T100 [US3] Create Server Action to update User node sleepHoursStart/End in FalkorDB
- [X] T101 [US3] Display session expiry countdown on dashboard home page
- [X] T102 [US3] Show "Sleeping" status indicator when within sleep hours on contacts page

**Checkpoint**: All user stories should now be independently functional
- HTS delays make bot responses appear human
- Typing indicators show during delays
- Sleep hours respected
- Session expires and requires re-auth after 24 hours

---

## Phase 6: User Story 4 - Real-Time Monitoring Dashboard (Priority: P2)

**Goal**: Provide comprehensive web interface for users to monitor bot activity, view conversations, manage settings, and intervene when necessary

**Independent Test**:
1. Open dashboard → see WhatsApp connection status
2. Navigate to contacts → see all contacts with bot status (Active/Paused)
3. Open conversation thread → see all messages with clear bot-sent indicators
4. Watch dashboard while test contact sends message → see real-time message appear
5. Access persona editor → modify communication style
6. Verify all controls (kill switch, pause/resume, bot enable) work from dashboard

### US4 - Frontend Dashboard (Enhanced Monitoring UI)

- [X] T103 [P] [US4] Create metrics display component at frontend/src/components/MetricsDisplay.tsx showing message count, token usage, costs
- [X] T104 [P] [US4] Create bot status component at frontend/src/components/BotStatus.tsx with connection indicator and uptime
- [X] T105 [US4] Implement Server Action at frontend/src/app/api/status/route.ts to fetch connection status from Gateway
- [X] T106 [US4] Add real-time metrics updates using Socket.io subscription to status events
- [X] T107 [P] [US4] Create activity log component at frontend/src/components/ActivityLog.tsx showing recent bot actions
- [X] T108 [US4] Implement log streaming from Redis pub/sub to dashboard via Socket.io
- [X] T109 [US4] Add contact search/filter functionality to contacts list
- [X] T110 [US4] Add pagination to conversation thread for long chat histories

### US4 - Backend Services (Metrics & Monitoring)

- [X] T111 [P] [US4] Implement metrics collector at services/orchestrator/src/metrics/collector.ts tracking tokens, costs, latency
- [X] T112 [US4] Publish metrics to Redis pub/sub on events:metrics channel
- [X] T113 [P] [US4] Implement health check endpoints for all services (Gateway /health, Orchestrator /health, Graph Worker /health)
- [X] T114 [US4] Implement connection status polling in Gateway and publish to events:status channel
- [X] T115 [US4] Implement audit logging to file system at logs/messages.jsonl with metadata only (no content)

**Checkpoint**: Dashboard provides comprehensive monitoring and control
- Real-time status updates for all bot activity
- Complete conversation history visibility
- Metrics for cost and performance tracking
- Health monitoring for all services

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements, security hardening, and production readiness that affect multiple user stories

- [ ] T116 [P] Add comprehensive error handling and logging to all services using winston
- [ ] T117 [P] Implement encryption at rest for FalkorDB data using LUKS on Docker volume
- [ ] T118 [P] Implement AES-256 encryption for WhatsApp session tokens in Redis
- [ ] T119 [P] Add input validation and sanitization across all API endpoints
- [ ] T120 [P] Implement CORS configuration for frontend-backend communication
- [ ] T121 [P] Add rate limiting to all HTTP endpoints to prevent abuse
- [ ] T122 [P] Create comprehensive error pages for frontend (404, 500, offline)
- [ ] T123 [P] Add loading states and skeletons to all dashboard components
- [ ] T124 [P] Implement graceful shutdown handlers for all services
- [ ] T125 Add Docker health checks to docker-compose.yml for all services
- [ ] T126 [P] Create production environment configuration in .env.production
- [ ] T127 [P] Add dependency license scanning script to package.json (verify no AGPL)
- [ ] T128 [P] Create deployment guide at docs/deployment.md for VPS setup
- [ ] T129 [P] Create security hardening guide at docs/security.md
- [ ] T130 [P] Implement backup script for FalkorDB graph data
- [ ] T131 Run full quickstart.md validation end-to-end on fresh environment
- [ ] T132 [P] Create troubleshooting guide at docs/troubleshooting.md
- [ ] T133 [P] Add performance monitoring and alerting configuration
- [ ] T134 Verify all constitutional requirements met per plan.md gates

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User Story 1 (P1): Can start after Foundational - No dependencies on other stories
  - User Story 2 (P2): Can start after Foundational - Depends on US1 workflow foundation
  - User Story 3 (P3): Can start after Foundational - Depends on US1 Gateway sender implementation
  - User Story 4 (P2): Can start after Foundational - Enhances monitoring across all stories
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - Core bot activation and control
- **User Story 2 (P2)**: Builds on US1 - Adds persona and context to basic responses
- **User Story 3 (P3)**: Builds on US1 - Adds human behavior simulation to message sending
- **User Story 4 (P2)**: Enhances US1-3 - Adds monitoring UI for all functionality

### Within Each User Story

- Service foundations before business logic
- Redis/FalkorDB clients before consumers
- LangGraph nodes before workflow integration
- Backend APIs before frontend Server Actions
- Components before page integration

### Parallel Opportunities

Within Phase 2 (Foundational):
- All service package.json and tsconfig files can be created in parallel (T012-T019, T026-T027, T032-T033)
- All Dockerfiles can be created in parallel (T014, T020, T028, T034)
- All client initializations can be developed in parallel across services (T016-T017, T022-T025, T030-T031, T038-T039)

Within User Story 1:
- Gateway auth handler (T041) and message handler (T042) can be built in parallel
- Orchestrator consumer (T049), state manager (T050), and rate limiter (T051) can be built in parallel
- Frontend QR page (T056-T057), contacts page (T058-T059), and kill switch (T061) can be built in parallel

Within User Story 2:
- Router node (T065) and graph queries (T066) can be built in parallel
- Chat parser (T073) and entity extractor (T074) can be built in parallel
- Frontend persona editor page (T080-T081) and conversation view (T084-T085) can be built in parallel

Within User Story 3:
- Delay calculator (T088) and sleep hours checker (T089) can be built in parallel
- Frontend sleep hours config (T099) and session countdown (T101-T102) can be built in parallel

Within User Story 4:
- All monitoring components (T103-T104, T107) can be built in parallel
- All backend metrics and health checks (T111, T113) can be built in parallel

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these User Story 1 tasks in parallel:

# Gateway parallel tasks (different files):
Task T041: "Implement QR code authentication handler at services/gateway/src/whatsapp/auth.ts"
Task T042: "Implement message handler at services/gateway/src/whatsapp/message-handler.ts"
Task T044: "Implement message sender at services/gateway/src/whatsapp/sender.ts"
Task T047: "Implement Gateway REST API routes at services/gateway/src/api/routes.ts"

# Orchestrator parallel tasks (different files):
Task T049: "Implement Redis message consumer at services/orchestrator/src/redis/consumer.ts"
Task T050: "Implement pause state checker at services/orchestrator/src/redis/state-manager.ts"
Task T051: "Implement rate limiter at services/orchestrator/src/hts/rate-limiter.ts"

# Frontend parallel tasks (different components/pages):
Task T056: "Create QR code authentication page at frontend/src/app/auth/page.tsx"
Task T057: "Create QR code display component at frontend/src/components/QRCodeDisplay.tsx"
Task T058: "Create contacts list page at frontend/src/app/contacts/page.tsx"
Task T059: "Create contact list component at frontend/src/components/ContactList.tsx"
Task T061: "Create master kill switch component at frontend/src/components/KillSwitch.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (~3-4 hours)
2. Complete Phase 2: Foundational (~8-12 hours - CRITICAL)
3. Complete Phase 3: User Story 1 (~12-16 hours)
4. **STOP and VALIDATE**: Test User Story 1 independently
   - Authenticate with WhatsApp
   - Enable bot for test contact
   - Verify auto-pause on fromMe message
   - Test master kill switch
   - Trigger rate limiting
5. Deploy/demo if ready

**Estimated MVP Time**: 23-32 hours of focused development

### Incremental Delivery

1. **Foundation** (Phase 1 + 2): Setup + Foundational → All services running, basic communication working
2. **MVP** (Phase 3): User Story 1 → Bot activation, pause controls, kill switch → **DEPLOY**
3. **V1.1** (Phase 4): User Story 2 → Persona-based responses, knowledge graph context → **DEPLOY**
4. **V1.2** (Phase 5): User Story 3 → Human typing simulation, sleep hours → **DEPLOY**
5. **V2.0** (Phase 6): User Story 4 → Enhanced monitoring dashboard → **DEPLOY**
6. **V2.1** (Phase 7): Polish → Production hardening → **FINAL RELEASE**

### Parallel Team Strategy

With multiple developers:

1. **Team completes Phase 1 + 2 together** (~12-16 hours)
2. **Once Foundational is done:**
   - Developer A: User Story 1 (Bot activation & control)
   - Developer B: User Story 2 (Persona & context) - can start some foundation tasks
   - Developer C: User Story 4 (Dashboard UI) - can start component development
3. **After US1 completes:**
   - Developer A: User Story 3 (HTS simulation)
   - Developer B: Continue User Story 2
   - Developer C: Continue User Story 4
4. **Final integration**: User Story 2, 3, 4 integrate with working US1 base

---

## Notes

- All tasks follow `- [ ] [ID] [P?] [Story?] Description with file path` format
- [P] tasks = different files, no blocking dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Foundational phase (Phase 2) is CRITICAL and BLOCKS all user story work
- Constitution requirements verified throughout implementation
- Security measures (encryption, no content logging) implemented from the start
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- MVP is User Story 1 only - delivers core value with minimal scope
