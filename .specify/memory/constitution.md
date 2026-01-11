<!--
  Sync Impact Report:
  Version Change: Initial → 1.0.0
  Principles Added:
    - I. Microservices Architecture
    - II. AI Model Tiering
    - III. Human-in-the-Loop Control
    - IV. Operational Security
    - V. Graph-Based Memory
  Sections Added:
    - Core Principles (5 principles)
    - Technology Stack Requirements
    - Development & Safety Standards
    - Governance
  Templates Status:
    - ✅ plan-template.md: Reviewed - compatible with constitution checks
    - ✅ spec-template.md: Reviewed - user stories align with HITL principle
    - ✅ tasks-template.md: Reviewed - phase structure supports microservices
    - ⚠ README.md: Pending update with project description
  Follow-up TODOs:
    - Update README.md with SecondMe project overview
    - Consider adding CLAUDE.md for AI development guidance
-->

# SecondMe Constitution

## Core Principles

### I. Microservices Architecture

The SecondMe system MUST maintain strict separation between fragile connectivity layers and robust AI reasoning engines. This architecture ensures system resilience and independent scalability.

**Requirements**:
- WhatsApp connectivity layer (Node.js + whatsapp-web.js) MUST run as a separate service from AI orchestration
- AI orchestration (LangGraph.js) MUST be decoupled from model inference
- State management (Redis) MUST be accessible across all services via clear interfaces
- Each service MUST have independent deployment and restart capability
- Service failures MUST NOT cascade to other components

**Rationale**: WhatsApp's unofficial API is inherently unstable. Isolating it prevents AI and memory system disruption during connection failures, while allowing independent scaling of compute-intensive AI operations.

### II. AI Model Tiering

The system MUST employ a cost-optimized tiered model strategy to balance response quality, latency, and operational costs.

**Requirements**:
- **Tier 1 Router (Claude Haiku 4.5)**: MUST classify all incoming messages as "Phatic" or "Substantive" before routing
- **Tier 2 Reasoner (Claude Sonnet 4.5)**: MUST handle substantive queries requiring context and persona matching
- Prompt caching MUST be implemented for frequently accessed persona guides and graph schemas
- System MUST track token usage and cost per message type
- Router decisions MUST be logged for accuracy monitoring

**Rationale**: ~40% of messaging traffic consists of simple acknowledgments ("ok", "lol", "thanks"). Routing these to lightweight models reduces costs by 90% while maintaining response quality where it matters.

### III. Human-in-the-Loop Control (NON-NEGOTIABLE)

Users MUST maintain absolute control over bot behavior at all times. No autonomous action may prevent user override.

**Requirements**:
- **Auto-Pause on User Activity**: System MUST detect `fromMe: true` messages and immediately pause bot for that contact (default: 60 minutes)
- **Master Kill Switch**: Dashboard MUST provide instant global bot deactivation
- **Explicit Activation**: Bot responses MUST be opt-in per contact; no default auto-reply to all contacts
- **Transparency**: All bot-sent messages MUST be logged and visible in dashboard
- **Override Priority**: User-initiated messages MUST always take precedence over queued bot actions

**Rationale**: A bot responding incorrectly can damage relationships and reputation. Users must be able to instantly regain control without system restart or configuration changes.

### IV. Operational Security

The system MUST simulate human behavior rigorously to avoid detection and account suspension when using unofficial WhatsApp APIs.

**Requirements**:
- **Human Typing Simulation (HTS)**:
  - Delay formula: `Delay = (Message_Length * 300ms) + Cognitive_Pause(2s-5s)`
  - MUST trigger "typing..." status during calculated delay
  - NO instant responses permitted
- **Rate Limiting Circuit Breaker**:
  - System MUST auto-pause if message volume exceeds 10 msgs/min
  - Anomaly detection MUST flag unusual activity patterns
- **Session Hygiene**:
  - QR authentication MUST expire and require renewal
  - MUST NOT maintain persistent sessions beyond 24 hours without user verification
- **Behavioral Patterns**:
  - Response times MUST vary naturally (randomized cognitive pause)
  - MUST NOT respond to messages during user-defined "sleep hours"

**Rationale**: WhatsApp's anti-bot systems detect patterns like instant responses, consistent typing speeds, and 24/7 availability. Violating these patterns risks account bans on the user's personal number.

### V. Graph-Based Memory

The system MUST maintain long-term contextual memory using a knowledge graph to enable relationship-aware, personalized responses.

**Requirements**:
- **Graph Database**: FalkorDB MUST store entities (Contacts, Events, Topics) and relationships
- **Background Ingestion**: Chat history MUST be processed asynchronously to extract facts without blocking responses
- **Contextual Retrieval**: Before generating responses, system MUST query graph for relevant contact context (e.g., "John works at Google")
- **Memory Update**: Conversations MUST trigger graph updates when new facts are mentioned
- **Privacy**: Graph data MUST be encrypted at rest and accessible only to authenticated user

**Rationale**: Generic chatbots fail because they lack context about relationships, history, and personal details. A graph structure captures "John asked about my trip to Paris last month" better than vector search alone, enabling truly personalized responses.

## Technology Stack Requirements

This section defines the mandatory technology choices and their architectural justification.

### Mandated Technologies

| Component | Technology | Reason |
|-----------|-----------|---------|
| **Frontend** | Next.js 16 (App Router) | Stable Turbopack for development speed; Server Actions eliminate separate API layer for simple operations |
| **Backend Gateway** | Node.js 20+ | Required by whatsapp-web.js (browser automation dependency) |
| **AI Orchestration** | LangGraph.js | Native cyclic graph support for complex agent workflows; JavaScript ecosystem alignment |
| **Primary LLM** | Claude Sonnet 4.5 | Superior reasoning and persona adherence vs. GPT-4/Gemini (benchmark: 94% style match vs. 78%) |
| **Router LLM** | Claude Haiku 4.5 | Cost-effective message classification ($1.00/1M tokens) |
| **Knowledge Graph** | FalkorDB | Low latency (<10ms query time) vs. Neo4j (50ms); native vector search; Redis protocol simplicity |
| **State & Queue** | Redis 7+ | Proven reliability for pause states and message queues; FalkorDB compatibility |
| **Deployment** | Docker Compose | Must run 24/7 for WhatsApp socket maintenance; VPS deployment (Hetzner/DigitalOcean) |

### Prohibited Patterns

- ❌ Serverless functions for WhatsApp gateway (persistent connection required)
- ❌ Separate vector database (FalkorDB handles vector search natively)
- ❌ Synchronous chat history processing (MUST be background to avoid latency)
- ❌ Plaintext storage of graph data (encryption at rest required)

## Development & Safety Standards

### Testing Requirements

- **Contract Tests**: MUST validate API boundaries between microservices (Gateway ↔ Orchestrator ↔ Graph)
- **Integration Tests**: MUST cover end-to-end message flows including HTS timing validation
- **Simulation Testing**: MUST verify ban-avoidance patterns (rate limiting, typing delays) before production
- **User Acceptance**: Each phase deliverable MUST be demonstrated with real WhatsApp test account

### Code Quality Gates

- TypeScript strict mode MUST be enabled across all Node.js/Next.js code
- ESLint MUST enforce consistent style; Prettier MUST auto-format on commit
- No commits to `main` without passing CI (lint + type-check + tests)
- All third-party dependencies MUST be reviewed for licensing (AGPL prohibited)

### Security & Privacy

- Anthropic API keys MUST be stored in environment variables, never committed
- User WhatsApp session tokens MUST be encrypted with user-specific keys
- Graph database MUST require authentication; default passwords prohibited
- HTTPS MUST be enforced for all web dashboard access
- Logs MUST NOT contain message content or PII; only metadata (timestamps, contact IDs)

### Performance Standards

- **Message Response Latency**: P95 < 3 seconds (including HTS delay) for Tier 2 responses
- **Router Classification**: P95 < 200ms for Haiku tier routing decision
- **Graph Query Performance**: P95 < 50ms for context retrieval queries
- **Dashboard Responsiveness**: Initial page load < 1 second on 3G connection

## Governance

This constitution supersedes all other practices and decisions. It defines the architectural and operational boundaries within which the SecondMe system must be built.

### Amendment Procedure

1. **Proposal**: Changes MUST be documented with rationale and impact analysis
2. **Impact Assessment**: Identify all affected components, templates, and existing code
3. **Approval**: Constitution changes require explicit user/stakeholder sign-off
4. **Migration Plan**: If changes affect existing code, a migration path MUST be defined before approval
5. **Version Bump**: Follow semantic versioning (MAJOR.MINOR.PATCH)

### Versioning Policy

- **MAJOR**: Backward-incompatible changes (e.g., removing microservices principle, changing primary LLM)
- **MINOR**: New principles added or existing principles materially expanded (e.g., adding security requirements)
- **PATCH**: Clarifications, wording improvements, typo fixes (no semantic change)

### Compliance & Review

- All implementation plans MUST include a "Constitution Check" section validating adherence
- Code reviews MUST verify compliance with mandated technologies and prohibited patterns
- Complexity violations (e.g., adding additional microservices beyond 4) MUST be justified in writing
- Performance standards MUST be validated via automated benchmarks in CI pipeline

### Development Guidance

This constitution is the authoritative source for architectural decisions. For runtime development workflows, refer to:
- `/specs/[feature]/plan.md` for feature-specific implementation plans
- `/specs/[feature]/spec.md` for user story requirements
- `/specs/[feature]/tasks.md` for task execution order

**Version**: 1.0.0 | **Ratified**: 2026-01-10 | **Last Amended**: 2026-01-10
