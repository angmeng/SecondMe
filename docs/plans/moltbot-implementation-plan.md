# Moltbot Implementation Plan for SecondMe

**Created**: 2026-01-30
**Based on**: [Moltbot Research Findings](../research/moltbot-learnings.md)
**Status**: Draft

---

## Overview

This plan translates moltbot learnings into actionable tasks for SecondMe, organized into phases by priority and dependency. Each phase contains epics with specific tasks sized for focused implementation sessions.

### Priority Matrix

| Priority | Feature | Complexity | Value | Dependencies |
|----------|---------|------------|-------|--------------|
| P0 | Pairing Mode | Medium | High | None |
| P1 | Security Audit System | Low | Medium | None |
| P1 | Plugin Architecture | High | High | None |
| P2 | Multi-Channel Abstraction | Medium | High | Plugin Architecture |
| P2 | Voice Message Support | Medium | Medium | None |
| P3 | Enhanced RAG (Hybrid Search) | Medium | High | Existing AutoMem |
| P3 | Onboarding Wizard | Medium | Medium | None |

---

## Phase 1: Security Hardening (P0-P1)

### Epic 1.1: Contact Pairing Mode

**Goal**: Protect against unauthorized access by requiring approval for unknown contacts.

**Current State**: Any WhatsApp contact can send messages and receive AI responses.

**Target State**: Unknown contacts receive a pairing code; bot only responds after admin approval.

#### Task 1.1.1: Pairing Data Model & Types

**Scope**: Define shared types for pairing workflow

**Files to create/modify**:
- `packages/shared-types/src/pairing.ts` (new)
- `packages/shared-types/src/index.ts` (export)

**Deliverables**:
```typescript
// packages/shared-types/src/pairing.ts
export interface PairingRequest {
  contactId: string;
  phoneNumber: string;
  displayName?: string;
  code: string;            // 6-digit code
  requestedAt: number;     // Unix timestamp
  status: 'pending' | 'approved' | 'denied' | 'expired';
  approvedBy?: string;     // Admin identifier
  approvedAt?: number;
  expiresAt: number;       // Auto-expire pending requests
}

export interface ApprovedContact {
  contactId: string;
  phoneNumber: string;
  displayName?: string;
  approvedAt: number;
  approvedBy: string;
  tier: 'trusted' | 'standard' | 'restricted';
  notes?: string;
}

export interface PairingConfig {
  enabled: boolean;
  codeLength: number;           // Default: 6
  codeExpirationMinutes: number; // Default: 30
  maxPendingRequests: number;   // Default: 100
  autoApproveExisting: boolean; // Auto-approve contacts with history
}
```

**Acceptance Criteria**:
- [ ] Types exported from shared-types package
- [ ] Type guards for runtime validation
- [ ] Unit tests for type guards

---

#### Task 1.1.2: Pairing Store (Gateway)

**Scope**: Redis storage layer for pairing state

**Files to create/modify**:
- `services/gateway/src/redis/pairing-store.ts` (new)
- `services/gateway/src/redis/client.ts` (if needed)

**Redis Keys**:
```
PAIRING:pending:{contactId}     # PairingRequest JSON, TTL: 30 min
PAIRING:approved:{contactId}    # ApprovedContact JSON, no TTL
PAIRING:codes:{code}            # contactId lookup, TTL: 30 min
PAIRING:stats                   # Hash: pending_count, approved_count
```

**Deliverables**:
```typescript
// services/gateway/src/redis/pairing-store.ts
export class PairingStore {
  constructor(redis: Redis, config: PairingConfig);

  // Create pairing request for unknown contact
  async createPairingRequest(contactId: string, phoneNumber: string, displayName?: string): Promise<PairingRequest>;

  // Check if contact is approved
  async isApproved(contactId: string): Promise<boolean>;

  // Get pending request
  async getPendingRequest(contactId: string): Promise<PairingRequest | null>;

  // Approve contact (admin action)
  async approveContact(contactId: string, approvedBy: string, tier?: Tier): Promise<ApprovedContact>;

  // Deny contact (admin action)
  async denyContact(contactId: string): Promise<void>;

  // Verify code submitted by contact
  async verifyCode(contactId: string, code: string): Promise<boolean>;

  // List pending requests
  async listPending(limit?: number): Promise<PairingRequest[]>;

  // List approved contacts
  async listApproved(limit?: number): Promise<ApprovedContact[]>;
}
```

**Acceptance Criteria**:
- [ ] All Redis operations atomic where needed
- [ ] TTL correctly applied to pending requests
- [ ] Code collision prevention (regenerate if exists)
- [ ] Unit tests with Redis mock

---

#### Task 1.1.3: Pairing Gate (Gateway Message Handler)

**Scope**: Integrate pairing check into message handling flow

**Files to modify**:
- `services/gateway/src/whatsapp/message-handler.ts`
- `services/gateway/src/whatsapp/sender.ts`

**Flow Change**:
```
Before:
  Message → isPaused? → isRateLimited? → QUEUE:messages

After:
  Message → isApproved? → [NO: sendPairingPrompt]
                        → [YES: isPaused? → isRateLimited? → QUEUE:messages]
```

**Pairing Response Template**:
```
Hi! I'm [PersonaName]'s AI assistant. To chat with me, please share this code
with [PersonaName] for approval: **{CODE}**

This code expires in 30 minutes.
```

**Deliverables**:
- Modified `handleIncomingMessage()` with pairing gate
- New `sendPairingPrompt()` function in sender
- Emit `pairing_request` socket event for dashboard

**Acceptance Criteria**:
- [ ] Unknown contacts receive pairing code
- [ ] Repeat messages from unknown contacts don't generate new codes (within TTL)
- [ ] Approved contacts bypass pairing check
- [ ] Code submission detected and verified
- [ ] Socket event emitted for real-time dashboard update

---

#### Task 1.1.4: Pairing Dashboard UI

**Scope**: Admin interface to approve/deny pairing requests

**Files to create/modify**:
- `frontend/src/app/pairing/page.tsx` (new)
- `frontend/src/components/PairingRequests.tsx` (new)
- `frontend/src/app/api/pairing/route.ts` (new)
- `frontend/src/app/api/pairing/[contactId]/route.ts` (new)
- `frontend/src/components/Navigation.tsx` (add link)

**API Routes**:
```
GET    /api/pairing           # List pending requests
POST   /api/pairing/{id}      # Approve contact
DELETE /api/pairing/{id}      # Deny contact
GET    /api/pairing/approved  # List approved contacts
```

**UI Components**:
- Pending requests list with approve/deny buttons
- Approved contacts list with tier management
- Real-time updates via Socket.io

**Acceptance Criteria**:
- [ ] Pending requests shown in real-time
- [ ] One-click approve/deny
- [ ] Success/error toast notifications
- [ ] Approved contacts list with search
- [ ] Tier assignment on approval

---

#### Task 1.1.5: Auto-Approve Existing Contacts

**Scope**: Migration script to approve contacts with existing conversation history

**Files to create**:
- `services/gateway/src/scripts/migrate-existing-contacts.ts`
- `services/gateway/src/scripts/run-migration.ts`

**Logic**:
1. Scan all `HISTORY:*` keys
2. Extract unique contactIds
3. Create ApprovedContact entries with `tier: 'standard'`
4. Set `approvedBy: 'migration'`

**Acceptance Criteria**:
- [ ] Idempotent (safe to run multiple times)
- [ ] Progress logging
- [ ] Dry-run mode
- [ ] Run via npm script: `npm run migrate:pairing`

---

### Epic 1.2: Security Audit System

**Goal**: Implement security event logging and content sanitization.

#### Task 1.2.1: Security Event Logger

**Scope**: Separate logging for security-relevant events

**Files to create**:
- `packages/shared-types/src/security.ts` (types)
- `services/gateway/src/utils/security-logger.ts`
- `services/orchestrator/src/utils/security-logger.ts`

**Security Events**:
```typescript
type SecurityEventType =
  | 'pairing_request'       // New contact attempted access
  | 'pairing_approved'      // Admin approved contact
  | 'pairing_denied'        // Admin denied contact
  | 'pairing_code_attempt'  // Code verification attempt
  | 'rate_limit_triggered'  // Contact exceeded rate limit
  | 'pause_activated'       // Pause triggered
  | 'kill_switch_activated' // Master kill switch
  | 'suspicious_content'    // Content flagged by sanitizer
  | 'auth_session_created'  // WhatsApp session established
  | 'auth_session_expired'; // WhatsApp session lost
```

**Log Format** (JSON Lines):
```json
{
  "timestamp": "2026-01-30T12:00:00Z",
  "event": "pairing_request",
  "contactId": "123456@c.us",
  "details": { "code": "******", "displayName": "Unknown" },
  "severity": "info"
}
```

**Acceptance Criteria**:
- [ ] Logs written to `logs/security.jsonl`
- [ ] Log rotation (daily, keep 30 days)
- [ ] Structured JSON format
- [ ] Severity levels: debug, info, warn, error

---

#### Task 1.2.2: Content Sanitizer

**Scope**: Sanitize incoming messages for security

**Files to create**:
- `services/gateway/src/utils/content-sanitizer.ts`

**Sanitization Rules**:
1. Strip potential injection patterns
2. Detect and flag suspicious URLs
3. Remove control characters
4. Truncate excessively long messages
5. Log flagged content to security logger

**Deliverables**:
```typescript
export interface SanitizationResult {
  sanitized: string;
  flags: string[];      // e.g., ['url_suspicious', 'truncated']
  original: string;
}

export function sanitizeMessage(content: string): SanitizationResult;
```

**Acceptance Criteria**:
- [ ] XSS patterns removed
- [ ] Suspicious URLs flagged
- [ ] Control characters stripped
- [ ] Max length enforced (configurable)
- [ ] Flagged messages logged

---

#### Task 1.2.3: Secret Detection Pre-commit Hook

**Scope**: Prevent accidental commit of secrets

**Files to create**:
- `.detect-secrets.cfg`
- `.pre-commit-config.yaml`
- Update `package.json` scripts

**Tools**: detect-secrets (Python) or gitleaks (Go)

**Acceptance Criteria**:
- [ ] Pre-commit hook blocks commits with potential secrets
- [ ] Baseline file for known false positives
- [ ] CI check for secret detection
- [ ] Documentation in CONTRIBUTING.md

---

## Phase 2: Extensibility Architecture (P1)

### Epic 2.1: Skill/Plugin System

**Goal**: Refactor tools into independently loadable skills for customization and extensibility.

#### Task 2.1.1: Skill Interface & Registry

**Scope**: Define core skill abstractions

**Files to create**:
- `packages/shared-types/src/skills.ts`
- `services/orchestrator/src/skills/registry.ts`
- `services/orchestrator/src/skills/base-skill.ts`

**Deliverables**:
```typescript
// packages/shared-types/src/skills.ts
export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  tools: ToolDefinition[];
  config?: Record<string, ConfigField>;
  permissions?: Permission[];
}

export interface Skill {
  manifest: SkillManifest;

  // Lifecycle
  activate(context: SkillContext): Promise<void>;
  deactivate(): Promise<void>;

  // Health
  healthCheck(): Promise<HealthStatus>;
}

export interface SkillContext {
  redis: Redis;
  logger: Logger;
  config: Record<string, unknown>;
  eventEmitter: EventEmitter;
}
```

```typescript
// services/orchestrator/src/skills/registry.ts
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private enabled: Set<string> = new Set();

  register(skill: Skill): void;
  unregister(name: string): void;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;

  getTools(): Tool[];          // Collect tools from enabled skills
  getSkill(name: string): Skill | undefined;
  listSkills(): SkillManifest[];
  listEnabled(): string[];
}
```

**Acceptance Criteria**:
- [ ] Registry supports dynamic skill loading
- [ ] Skills can declare dependencies
- [ ] Activation/deactivation lifecycle respected
- [ ] Tools correctly collected from enabled skills

---

#### Task 2.1.2: Built-in Skills Migration

**Scope**: Convert existing orchestrator tools to skill format

**Files to create**:
```
services/orchestrator/src/skills/
├── built-in/
│   ├── core/                  # Core conversation skill
│   │   ├── manifest.json
│   │   └── index.ts
│   ├── knowledge-graph/       # FalkorDB queries
│   │   ├── manifest.json
│   │   └── index.ts
│   ├── memory/                # AutoMem operations
│   │   ├── manifest.json
│   │   └── index.ts
│   └── persona/               # Persona management
│       ├── manifest.json
│       └── index.ts
```

**Migration Steps**:
1. Extract tool definitions from current workflow
2. Wrap each tool group in Skill class
3. Update workflow to use registry.getTools()
4. Test with skills enabled/disabled

**Acceptance Criteria**:
- [ ] All existing tools converted to skills
- [ ] No functionality regression
- [ ] Skills can be disabled individually
- [ ] Manifest files properly describe each skill

---

#### Task 2.1.3: Skill Configuration UI

**Scope**: Dashboard for managing skills

**Files to create**:
- `frontend/src/app/skills/page.tsx`
- `frontend/src/components/SkillCard.tsx`
- `frontend/src/components/SkillConfig.tsx`
- `frontend/src/app/api/skills/route.ts`
- `frontend/src/app/api/skills/[name]/route.ts`

**API Routes**:
```
GET    /api/skills           # List all skills with status
POST   /api/skills/{name}    # Enable skill
DELETE /api/skills/{name}    # Disable skill
PUT    /api/skills/{name}    # Update skill config
```

**UI Features**:
- Skill cards with enable/disable toggle
- Configuration modal for skill settings
- Health status indicator
- Tool list preview

**Acceptance Criteria**:
- [ ] All skills visible in dashboard
- [ ] Enable/disable with immediate effect
- [ ] Configuration persisted to Redis
- [ ] Health check visible per skill

---

#### Task 2.1.4: External Skill Loading

**Scope**: Load skills from filesystem (user-defined)

**Files to modify**:
- `services/orchestrator/src/skills/loader.ts`
- `services/orchestrator/src/skills/registry.ts`

**Skill Directory Structure**:
```
~/.secondme/skills/
├── my-custom-skill/
│   ├── manifest.json
│   ├── index.ts
│   └── package.json
```

**Loader Logic**:
1. Scan skills directory on startup
2. Validate manifest schema
3. Check permissions/capabilities
4. Register with SkillRegistry

**Acceptance Criteria**:
- [ ] Skills loaded from configurable directory
- [ ] Invalid manifests logged and skipped
- [ ] Hot-reload on file change (optional)
- [ ] Sandboxed execution (no require access outside skill dir)

---

## Phase 3: Multi-Channel Support (P2)

### Epic 3.1: Channel Abstraction Layer

**Goal**: Enable support for multiple messaging platforms beyond WhatsApp.

#### Task 3.1.1: Channel Interface Definition

**Scope**: Define abstract channel interface

**Files to create**:
- `packages/shared-types/src/channels.ts`
- `services/gateway/src/channels/base-channel.ts`

**Deliverables**:
```typescript
// packages/shared-types/src/channels.ts
export interface ChannelMessage {
  id: string;
  channelId: string;           // e.g., 'whatsapp', 'telegram'
  contactId: string;           // Channel-specific contact ID
  content: string;
  timestamp: number;
  mediaType?: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  replyTo?: string;            // Message ID being replied to
  metadata?: Record<string, unknown>;
}

export interface Channel {
  readonly name: string;
  readonly displayName: string;
  readonly icon: string;
  readonly status: 'connected' | 'connecting' | 'disconnected' | 'error';

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Messaging
  sendMessage(to: string, content: MessageContent): Promise<string>;
  sendTypingIndicator(to: string): Promise<void>;

  // Events
  onMessage(handler: (msg: ChannelMessage) => void): void;
  onStatusChange(handler: (status: ChannelStatus) => void): void;

  // Info
  getContacts(): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | null>;
}

export interface MessageContent {
  text?: string;
  media?: {
    type: 'image' | 'audio' | 'video' | 'document';
    url: string;
    caption?: string;
  };
}
```

**Acceptance Criteria**:
- [ ] Interface covers common messaging operations
- [ ] Extensible for channel-specific features
- [ ] Type-safe message content

---

#### Task 3.1.2: WhatsApp Channel Adapter

**Scope**: Refactor existing WhatsApp code into channel adapter

**Files to create/modify**:
- `services/gateway/src/channels/whatsapp/index.ts`
- `services/gateway/src/channels/whatsapp/adapter.ts`
- Refactor: `services/gateway/src/whatsapp/*` → channel adapter

**Changes**:
1. Wrap existing whatsapp-web.js code in Channel interface
2. Normalize message format to ChannelMessage
3. Update message handler to use Channel abstraction
4. Update sender to use Channel.sendMessage()

**Acceptance Criteria**:
- [ ] WhatsApp functionality unchanged
- [ ] Messages normalized to ChannelMessage format
- [ ] Status changes emit to channel events
- [ ] All existing tests pass

---

#### Task 3.1.3: Channel Router

**Scope**: Route messages from multiple channels to orchestrator

**Files to create**:
- `services/gateway/src/channels/router.ts`
- `services/gateway/src/channels/manager.ts`

**Router Logic**:
```typescript
export class ChannelManager {
  private channels: Map<string, Channel> = new Map();

  register(channel: Channel): void;
  unregister(name: string): void;

  getChannel(name: string): Channel | undefined;
  listChannels(): ChannelInfo[];

  // Unified message handling
  onMessage(handler: (msg: ChannelMessage) => void): void;

  // Route response back to correct channel
  sendResponse(channelId: string, contactId: string, content: MessageContent): Promise<void>;
}
```

**Redis Queue Enhancement**:
```typescript
// QUEUE:messages entry now includes channel info
interface QueuedMessage {
  channelId: string;        // 'whatsapp', 'telegram'
  contactId: string;        // Channel-specific ID
  normalizedContactId: string; // Cross-channel ID (phone number)
  // ... existing fields
}
```

**Acceptance Criteria**:
- [ ] Multiple channels can be registered
- [ ] Messages from all channels queued correctly
- [ ] Responses routed to correct channel
- [ ] Cross-channel contact linking possible

---

#### Task 3.1.4: Telegram Channel Implementation

**Scope**: Add Telegram as second supported channel

**Files to create**:
```
services/gateway/src/channels/telegram/
├── index.ts
├── adapter.ts
├── client.ts
└── types.ts
```

**Dependencies**: `grammy` (Telegram bot framework)

**Implementation**:
1. Create Telegram bot via BotFather
2. Implement Channel interface using grammY
3. Handle message types (text, photo, voice, document)
4. Implement typing indicator

**Acceptance Criteria**:
- [ ] Telegram bot connects and receives messages
- [ ] Messages queued to QUEUE:messages with channelId='telegram'
- [ ] Responses sent back to Telegram
- [ ] Media messages handled (at least images)
- [ ] Dashboard shows Telegram connection status

---

#### Task 3.1.5: Multi-Channel Dashboard

**Scope**: Update dashboard for multi-channel support

**Files to modify**:
- `frontend/src/app/page.tsx` (show multiple channel statuses)
- `frontend/src/components/ChannelStatus.tsx` (new)
- `frontend/src/app/api/channels/route.ts` (new)
- `frontend/src/app/contacts/page.tsx` (add channel filter)

**UI Changes**:
- Channel status cards (WhatsApp, Telegram, etc.)
- Per-channel connect/disconnect controls
- Contact list shows channel badges
- Filter contacts by channel

**Acceptance Criteria**:
- [ ] All connected channels shown in dashboard
- [ ] Per-channel pause controls
- [ ] Contact list filterable by channel
- [ ] Channel-specific metrics

---

## Phase 4: Voice & Media (P2)

### Epic 4.1: Voice Message Support

**Goal**: Transcribe incoming voice messages and optionally respond with voice.

#### Task 4.1.1: Voice Transcription Integration

**Scope**: Transcribe WhatsApp voice messages using Whisper API

**Files to create**:
- `services/orchestrator/src/voice/transcriber.ts`
- `services/orchestrator/src/voice/types.ts`
- Update workflow to handle voice messages

**Dependencies**: OpenAI SDK (Whisper API) or `@anthropic-ai/sdk` (if Claude supports)

**Flow**:
```
Voice Message → Download audio → Transcribe → Process as text → Respond
```

**Deliverables**:
```typescript
export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  confidence: number;
}

export class VoiceTranscriber {
  constructor(apiKey: string, config?: TranscriberConfig);

  async transcribe(audioBuffer: Buffer, format: string): Promise<TranscriptionResult>;
  async transcribeUrl(url: string): Promise<TranscriptionResult>;
}
```

**Acceptance Criteria**:
- [ ] Voice messages detected and downloaded
- [ ] Transcription via Whisper API
- [ ] Transcribed text processed through normal flow
- [ ] Original voice + transcription logged
- [ ] Error handling for failed transcriptions

---

#### Task 4.1.2: Text-to-Speech Response (Optional)

**Scope**: Generate voice responses using ElevenLabs

**Files to create**:
- `services/orchestrator/src/voice/tts.ts`
- `services/gateway/src/whatsapp/voice-sender.ts`

**Dependencies**: ElevenLabs SDK

**Configuration**:
```typescript
interface TTSConfig {
  enabled: boolean;
  voiceId: string;           // ElevenLabs voice ID
  triggerOnVoice: boolean;   // Respond with voice to voice messages
  maxResponseLength: number; // Don't TTS long responses
}
```

**Acceptance Criteria**:
- [ ] Text responses converted to audio
- [ ] Audio sent as voice message
- [ ] Configurable per-contact preference
- [ ] Fallback to text on TTS failure

---

#### Task 4.1.3: Image Understanding

**Scope**: Process image messages using Claude's vision

**Files to modify**:
- `services/orchestrator/src/langgraph/workflow.ts`
- `services/orchestrator/src/anthropic/sonnet-client.ts`

**Flow**:
```
Image Message → Download → Resize/optimize → Claude Vision → Response
```

**Implementation**:
1. Detect media type in message handler
2. Download and optimize image (max 5MB, resize if needed)
3. Include image in Claude prompt as base64
4. Process response normally

**Acceptance Criteria**:
- [ ] Image messages detected
- [ ] Images passed to Claude as vision content
- [ ] Response describes/discusses image
- [ ] Large images resized appropriately
- [ ] Multiple images in conversation supported

---

## Phase 5: Enhanced RAG (P3)

### Epic 5.1: Hybrid Search Enhancement

**Goal**: Improve RAG quality with better retrieval strategies.

**Note**: AutoMem already provides hybrid search (vector + keyword + tag). This phase focuses on optimizations and SecondMe-specific improvements.

#### Task 5.1.1: Embedding Provider Abstraction

**Scope**: Support multiple embedding providers

**Files to create**:
- `services/orchestrator/src/embeddings/provider.ts`
- `services/orchestrator/src/embeddings/openai.ts`
- `services/orchestrator/src/embeddings/voyage.ts`

**Deliverables**:
```typescript
export interface EmbeddingProvider {
  name: string;
  dimensions: number;

  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddings implements EmbeddingProvider { ... }
export class VoyageEmbeddings implements EmbeddingProvider { ... }
```

**Acceptance Criteria**:
- [ ] Provider abstraction allows swapping
- [ ] Batch embedding for efficiency
- [ ] Configurable provider selection
- [ ] Caching of frequent embeddings

---

#### Task 5.1.2: Conversation Embedding Index

**Scope**: Index conversation chunks for semantic retrieval

**Files to create**:
- `services/graph-worker/src/embeddings/conversation-indexer.ts`
- `services/graph-worker/src/embeddings/index.ts`

**Flow**:
```
New messages → Chunk by topic/time → Generate embeddings → Store in AutoMem
```

**Acceptance Criteria**:
- [ ] Conversations chunked intelligently
- [ ] Embeddings generated for each chunk
- [ ] Stored with proper tags for retrieval
- [ ] Deduplication of existing chunks

---

#### Task 5.1.3: Retrieval Fusion

**Scope**: Combine multiple retrieval methods for better recall

**Files to modify**:
- `services/orchestrator/src/automem/client.ts`
- `services/orchestrator/src/langgraph/nodes/graph-query.ts`

**Fusion Strategy**:
1. Run keyword search on conversation history
2. Run semantic search on AutoMem
3. Query knowledge graph for entity relationships
4. Merge and re-rank results
5. Apply token budget

**Acceptance Criteria**:
- [ ] Multiple retrieval sources combined
- [ ] Configurable weights per source
- [ ] Deduplication of results
- [ ] Token budget respected

---

## Phase 6: Developer Experience (P3)

### Epic 6.1: Onboarding & CLI Tools

#### Task 6.1.1: Onboarding Wizard CLI

**Scope**: Interactive setup for new installations

**Files to create**:
- `cli/onboard.ts`
- `cli/doctor.ts`
- `cli/index.ts`
- `package.json` bin entry

**Commands**:
```bash
secondme onboard    # Interactive setup wizard
secondme doctor     # Health check all services
secondme status     # Quick status overview
```

**Onboard Wizard Steps**:
1. Check prerequisites (Node.js, Docker)
2. Generate `.env` file interactively
3. Set up Anthropic API key
4. Configure Redis/FalkorDB
5. Create initial persona
6. Start services

**Acceptance Criteria**:
- [ ] Interactive prompts for all config
- [ ] Validation of API keys
- [ ] Docker compose started automatically
- [ ] WhatsApp QR code shown in terminal

---

#### Task 6.1.2: Doctor Command

**Scope**: Comprehensive health check

**Files to create**:
- `cli/doctor.ts`

**Checks**:
1. Redis connectivity
2. FalkorDB connectivity
3. AutoMem API health
4. Service health endpoints
5. WhatsApp session status
6. API key validity
7. Disk space
8. Memory usage

**Output Format**:
```
SecondMe Doctor
===============
✓ Redis: Connected (localhost:6380)
✓ FalkorDB: Connected (localhost:6379)
✓ AutoMem: Healthy (localhost:8001)
✓ Gateway: Running (localhost:3001)
✓ Orchestrator: Running (localhost:3002)
✓ Frontend: Running (localhost:3000)
✗ WhatsApp: Disconnected (scan QR code)

1 issue found. Run 'secondme onboard' to fix.
```

**Acceptance Criteria**:
- [ ] All services checked
- [ ] Clear pass/fail output
- [ ] Actionable error messages
- [ ] Exit code reflects health

---

#### Task 6.1.3: Code Quality Enforcement

**Scope**: Add file size limits and coverage thresholds

**Files to modify**:
- `eslint.config.js`
- `vitest.config.ts`
- `package.json`

**Rules**:
- Max file size: 700 LOC (warning at 500)
- Coverage threshold: 70%
- Complexity limit per function

**Acceptance Criteria**:
- [ ] ESLint warns on large files
- [ ] Coverage threshold enforced in CI
- [ ] Pre-push hook checks coverage

---

## Implementation Order

### Sprint 1: Security Foundation
1. Task 1.1.1: Pairing Data Model
2. Task 1.1.2: Pairing Store
3. Task 1.1.3: Pairing Gate
4. Task 1.2.1: Security Event Logger

### Sprint 2: Pairing Complete + Audit
1. Task 1.1.4: Pairing Dashboard UI
2. Task 1.1.5: Auto-Approve Existing
3. Task 1.2.2: Content Sanitizer
4. Task 1.2.3: Secret Detection

### Sprint 3: Plugin Foundation
1. Task 2.1.1: Skill Interface & Registry
2. Task 2.1.2: Built-in Skills Migration

### Sprint 4: Plugin Complete
1. Task 2.1.3: Skill Configuration UI
2. Task 2.1.4: External Skill Loading

### Sprint 5: Multi-Channel Foundation
1. Task 3.1.1: Channel Interface
2. Task 3.1.2: WhatsApp Adapter
3. Task 3.1.3: Channel Router

### Sprint 6: Telegram Channel
1. Task 3.1.4: Telegram Implementation
2. Task 3.1.5: Multi-Channel Dashboard

### Sprint 7: Voice & Media
1. Task 4.1.1: Voice Transcription
2. Task 4.1.3: Image Understanding

### Sprint 8: Enhanced RAG
1. Task 5.1.1: Embedding Abstraction
2. Task 5.1.2: Conversation Indexing
3. Task 5.1.3: Retrieval Fusion

### Sprint 9: Developer Experience
1. Task 6.1.1: Onboarding Wizard
2. Task 6.1.2: Doctor Command
3. Task 6.1.3: Code Quality

---

## Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| Pairing Mode | Unauthorized message attempts blocked | 100% |
| Security Logging | Security events captured | All events logged |
| Plugin System | Core tools as skills | 4+ skills |
| Multi-Channel | Channels supported | 2+ (WhatsApp, Telegram) |
| Voice | Transcription accuracy | 95%+ |
| RAG Quality | Relevant context retrieved | Subjective improvement |
| DX | Time to first message | < 10 minutes |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pairing UX friction | Users may find pairing annoying | Clear messaging, quick approval process |
| Plugin security | Malicious skills could harm system | Sandboxed execution, permission model |
| Multi-channel complexity | Increased maintenance burden | Strong abstraction, shared tests |
| Whisper API costs | Voice transcription can be expensive | Usage limits, optional feature |
| Breaking changes | Existing users affected | Migration scripts, backwards compatibility |

---

## References

- [Moltbot Research Findings](../research/moltbot-learnings.md)
- [SecondMe CLAUDE.md](../../CLAUDE.md)
- [Project Specifications](../../specs/001-personal-ai-clone/)
