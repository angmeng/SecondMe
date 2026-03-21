# Moltbot Implementation Plan for SecondMe

**Created**: 2026-01-30
**Updated**: 2026-02-01
**Based on**: [Moltbot Research Findings](../research/moltbot-learnings.md)
**Status**: Phase 6 Complete (Developer Experience CLI)

---

## Overview

This plan translates moltbot learnings into actionable tasks for SecondMe, organized into phases by priority and dependency. Each phase contains epics with specific tasks sized for focused implementation sessions.

### Priority Matrix

| Priority | Feature | Complexity | Value | Dependencies | Status |
|----------|---------|------------|-------|--------------|--------|
| P0 | Pairing Mode | Medium | High | None | ✅ Complete |
| P1 | Security Audit System | Low | Medium | None | ✅ Complete |
| P1 | Plugin Architecture | High | High | None | ✅ Complete |
| P2 | Multi-Channel Abstraction | Medium | High | Plugin Architecture | ✅ Complete |
| P2 | Voice Message Support | Medium | Medium | None | ✅ Complete |
| P3 | Enhanced RAG (Hybrid Search) | Medium | High | Existing AutoMem | ✅ Complete |
| P3 | Developer Experience CLI | Medium | Medium | None | ✅ Complete |

---

## Phase 1 Completion Summary ✅

**Completed**: 2026-01-31
**Review**: All 8 tasks implemented, 100% complete

### Implementation Highlights

| Task | Files Created | Key Features |
|------|---------------|--------------|
| 1.1.1 Pairing Types | `shared-types/pairing.ts`, `guards.ts` | ContactTier, PairingStatus, runtime type guards |
| 1.1.2 Pairing Store | `gateway/redis/pairing-store.ts` | 3 Lua scripts (atomic ops), auto-approve existing |
| 1.1.3 Message Handler | `gateway/whatsapp/message-handler.ts` | Pairing gate before history, auto-reply |
| 1.1.4 Frontend Dashboard | `frontend/src/app/pairing/`, 7 API routes | Real-time Socket.io, tier management |
| 1.1.5 Migration Script | `gateway/scripts/migrate-existing-contacts.ts` | SCAN-based, dry-run, batching |
| 1.2.1 Security Logger | `gateway/utils/logger.ts` | File transport, masking, helpers |
| 1.2.2 Content Analyzer | `gateway/utils/content-analyzer.ts` | 5 detectors, risk scoring |
| 1.2.3 Secret Detection | `.gitleaks.toml`, `.github/workflows/security.yml` | Anthropic/OpenAI key patterns |

### Design Deviations (Intentional)

1. **No Verification Codes**: Simplified to admin-only approval (simpler UX)
2. **No TTL on Pending**: Requests stay until admin action (prevents losing requests)

### Known Limitations

- **Hardcoded Admin ID**: `'dashboard-admin'` placeholder until auth implementation
- **Future Work**: Proper user authentication for audit trails (out of scope for Phase 1)

---

## Phase 1: Security Hardening (P0-P1) ✅ COMPLETE

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
  profilePicUrl?: string;    // For dashboard display
  channelId?: string;        // 'whatsapp', 'telegram' - future multi-channel
  code: string;              // 6-digit code
  requestedAt: number;       // Unix timestamp
  status: 'pending' | 'approved' | 'denied' | 'expired';
  approvedBy?: string;       // Admin identifier
  approvedAt?: number;
  expiresAt: number;         // Auto-expire pending requests
}

export interface ApprovedContact {
  contactId: string;
  phoneNumber: string;
  displayName?: string;
  profilePicUrl?: string;
  channelId?: string;        // Future multi-channel support
  approvedAt: number;
  approvedBy: string;
  tier: 'trusted' | 'standard' | 'restricted';
  notes?: string;
}

export interface DeniedContact {
  contactId: string;
  phoneNumber: string;
  displayName?: string;
  deniedAt: number;
  deniedBy: string;
  reason?: string;
  expiresAt: number;         // Allow re-pairing after cooldown (24h)
}

export interface PairingConfig {
  enabled: boolean;
  codeLength: number;           // Default: 6
  codeExpirationMinutes: number; // Default: 30
  denialCooldownHours: number;  // Default: 24
  maxPendingRequests: number;   // Default: 100
  autoApproveExisting: boolean; // Auto-approve contacts with history
}

// Runtime type guards (following isStoredMessage pattern)
export function isPairingRequest(obj: unknown): obj is PairingRequest;
export function isApprovedContact(obj: unknown): obj is ApprovedContact;
export function isDeniedContact(obj: unknown): obj is DeniedContact;
```

**Acceptance Criteria**:
- [ ] Types exported from shared-types package
- [ ] Runtime type guards for validation (following `isStoredMessage` pattern)
- [ ] Unit tests for type guards
- [ ] `channelId` field included for future multi-channel support

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
PAIRING:denied:{contactId}      # DeniedContact JSON, TTL: 24 hours
PAIRING:codes:{code}            # contactId lookup, TTL: 30 min
PAIRING:stats                   # Hash: pending_count, approved_count, denied_count
```

**Deliverables**:
```typescript
// services/gateway/src/redis/pairing-store.ts
import { randomInt } from 'crypto';  // CRITICAL: Use crypto-safe random

export class PairingStore {
  constructor(redis: Redis, config: PairingConfig);

  // Create pairing request for unknown contact
  // Uses Lua script for atomic operation (following history-store.ts pattern)
  async createPairingRequest(
    contactId: string,
    phoneNumber: string,
    displayName?: string,
    profilePicUrl?: string
  ): Promise<PairingRequest>;

  // Check if contact is approved
  async isApproved(contactId: string): Promise<boolean>;

  // Check if contact is denied (in cooldown period)
  async isDenied(contactId: string): Promise<boolean>;

  // Get pending request
  async getPendingRequest(contactId: string): Promise<PairingRequest | null>;

  // Approve contact (admin action)
  async approveContact(contactId: string, approvedBy: string, tier?: Tier): Promise<ApprovedContact>;

  // Deny contact (admin action) - sets 24h cooldown
  async denyContact(contactId: string, deniedBy: string, reason?: string): Promise<void>;

  // Revoke approval (admin action)
  async revokeApproval(contactId: string): Promise<void>;

  // Verify code submitted by contact
  async verifyCode(contactId: string, code: string): Promise<boolean>;

  // List pending requests
  async listPending(limit?: number): Promise<PairingRequest[]>;

  // List approved contacts
  async listApproved(limit?: number): Promise<ApprovedContact[]>;

  // Generate secure 6-digit code
  private generateCode(): string {
    // CRITICAL: Use crypto.randomInt() not Math.random()
    return randomInt(100000, 999999).toString();
  }
}
```

**Lua Script for Atomic Create** (following `history-store.ts:84-157` pattern):
```lua
-- Atomic pairing request creation
-- Checks: not already approved, not denied (cooldown), no existing pending
-- Creates: pending request + code lookup
local approved = redis.call('EXISTS', KEYS[1])  -- PAIRING:approved:{contactId}
local denied = redis.call('EXISTS', KEYS[2])    -- PAIRING:denied:{contactId}
local pending = redis.call('EXISTS', KEYS[3])   -- PAIRING:pending:{contactId}

if approved == 1 then return {0, 'already_approved'} end
if denied == 1 then return {0, 'denied_cooldown'} end
if pending == 1 then return {0, 'already_pending'} end

-- Check code collision, regenerate if needed (handled in TypeScript)
redis.call('SET', KEYS[3], ARGV[1], 'EX', ARGV[2])  -- pending request
redis.call('SET', KEYS[4], ARGV[3], 'EX', ARGV[2])  -- code lookup
return {1, 'created'}
```

**Acceptance Criteria**:
- [ ] All Redis operations atomic using Lua scripts
- [ ] TTL correctly applied to pending requests (30 min)
- [ ] TTL correctly applied to denied contacts (24 hours)
- [ ] Code generation uses `crypto.randomInt()` (not `Math.random()`)
- [ ] Code collision prevention (regenerate if exists)
- [ ] `revokeApproval()` method for admin to revoke access
- [ ] Unit tests with Redis mock

---

#### Task 1.1.3: Pairing Gate (Gateway Message Handler)

**Scope**: Integrate pairing check into message handling flow

**Files to modify**:
- `services/gateway/src/whatsapp/message-handler.ts`
- `services/gateway/src/whatsapp/sender.ts`
- `services/gateway/src/redis/persona-cache.ts` (for persona name)

**Flow Change**:
```
Before (message-handler.ts:46-115):
  Message → Skip groups → Store history → isPaused? → isRateLimited? → QUEUE:messages

After:
  Message → Skip groups → isApproved? → [NO: handleUnapprovedContact()]
                                       → [YES: Store history → isPaused? → isRateLimited? → QUEUE:messages]
```

**CRITICAL**: Move history storage AFTER pairing approval check. Do not store messages from unapproved contacts.

**Insertion Point** (after line 65, before history store):
```typescript
// Pairing gate - check before storing history
const isApproved = await pairingStore.isApproved(contactId);
if (!isApproved) {
  await this.handleUnapprovedContact(message, contactId, contactName);
  return;  // Don't store history, don't queue
}

// Only store history for approved contacts
await historyStore.addMessage(contactId, storedMessage);
```

**Code Submission Detection**:
```typescript
private async handleUnapprovedContact(message: Message, contactId: string, contactName?: string): Promise<void> {
  const content = message.body.trim();

  // Check if message is a 6-digit code submission
  const codePattern = /^\d{6}$/;
  if (codePattern.test(content)) {
    const verified = await pairingStore.verifyCode(contactId, content);
    if (verified) {
      // Auto-approve on correct code
      await pairingStore.approveContact(contactId, 'self-verified', 'standard');
      io.emit('pairing_verified', { contactId, contactName });

      // Send welcome message
      await sender.sendMessage(contactId, 'Welcome! You can now chat with me.');
      return;
    } else {
      // Wrong code
      await sender.sendMessage(contactId, 'Invalid code. Please check and try again.');
      return;
    }
  }

  // Check if already has pending request (rate limit prompts)
  const existingRequest = await pairingStore.getPendingRequest(contactId);
  if (existingRequest && existingRequest.status === 'pending') {
    // Don't spam with new codes - silently ignore
    console.log(`[Pairing] Ignoring message from ${contactId} - pending request exists`);
    return;
  }

  // Check if denied (in cooldown)
  const isDenied = await pairingStore.isDenied(contactId);
  if (isDenied) {
    console.log(`[Pairing] Ignoring message from ${contactId} - in denial cooldown`);
    return;
  }

  // Create new pairing request
  const request = await pairingStore.createPairingRequest(
    contactId,
    message.from,
    contactName,
    await this.getProfilePic(message)
  );

  // Fetch persona name for personalized prompt
  const persona = await personaCache.getActive();
  const personaName = persona?.name || 'the owner';

  // Send pairing prompt
  await sender.sendPairingPrompt(contactId, request.code, personaName);

  // Emit socket event for dashboard
  io.emit('pairing_request', {
    contactId,
    contactName,
    code: request.code,  // Masked in frontend
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
  });
}
```

**Pairing Response Template**:
```
Hi! I'm {personaName}'s AI assistant. To chat with me, please share this code
with {personaName} for approval: **{CODE}**

This code expires in 30 minutes. Or reply with the code if you already have it.
```

**Deliverables**:
- Modified `handleIncomingMessage()` with pairing gate BEFORE history storage
- New `handleUnapprovedContact()` method with code detection
- New `sendPairingPrompt()` function in sender
- Emit `pairing_request` and `pairing_verified` socket events

**Acceptance Criteria**:
- [ ] Unknown contacts receive pairing code
- [ ] Repeat messages from unknown contacts don't generate new codes (within TTL)
- [ ] Approved contacts bypass pairing check
- [ ] Code submission detected via regex pattern `^\d{6}$`
- [ ] Self-verification on correct code submission
- [ ] History NOT stored for unapproved contacts
- [ ] Denied contacts in cooldown are silently ignored
- [ ] Socket events emitted for real-time dashboard update
- [ ] Persona name injected into prompt

---

#### Task 1.1.4: Pairing Dashboard UI

**Scope**: Admin interface to approve/deny pairing requests

**Files to create/modify**:
- `frontend/src/app/pairing/page.tsx` (new)
- `frontend/src/components/PairingRequests.tsx` (new)
- `frontend/src/components/ApprovedContacts.tsx` (new)
- `frontend/src/app/api/pairing/route.ts` (new)
- `frontend/src/app/api/pairing/[contactId]/route.ts` (new)
- `frontend/src/app/api/pairing/approved/route.ts` (new)
- `frontend/src/components/Navigation.tsx` (add link with ShieldCheckIcon)

**API Routes**:
```
GET    /api/pairing              # List pending requests
POST   /api/pairing/{id}         # Approve contact (body: { tier, notes })
DELETE /api/pairing/{id}         # Deny contact (body: { reason })
GET    /api/pairing/approved     # List approved contacts
DELETE /api/pairing/approved/{id} # Revoke approval
POST   /api/pairing/bulk         # Bulk approve/deny (body: { action, contactIds })
```

**Socket.io Events to Handle**:
```typescript
// Listen for real-time updates (following pause_update pattern)
socket.on('pairing_request', (data) => {
  // Add to pending list
});

socket.on('pairing_verified', (data) => {
  // Move from pending to approved, show success toast
});

socket.on('pairing_approved', (data) => {
  // Move from pending to approved
});

socket.on('pairing_denied', (data) => {
  // Remove from pending
});
```

**UI Components**:

1. **PairingRequests.tsx** - Pending requests list
   - Contact avatar + name + phone
   - Time since request + expiry countdown
   - Approve button (opens tier selector)
   - Deny button (opens reason input)
   - "Approve All" bulk action

2. **ApprovedContacts.tsx** - Approved contacts management
   - Search by name/phone
   - Filter by tier (trusted/standard/restricted)
   - Edit tier button
   - Revoke access button (with confirmation)

3. **Navigation.tsx** - Add link
   ```typescript
   { name: 'Pairing', href: '/pairing', icon: ShieldCheckIcon }
   ```

**Acceptance Criteria**:
- [ ] Pending requests shown in real-time via Socket.io
- [ ] One-click approve with tier selector dropdown
- [ ] Deny with optional reason input
- [ ] Success/error toast notifications
- [ ] Approved contacts list with search and filter
- [ ] Bulk approve/deny actions
- [ ] Revoke approval with confirmation modal
- [ ] Navigation link with shield icon

---

#### Task 1.1.5: Auto-Approve Existing Contacts

**Scope**: Migration script to approve contacts with existing conversation history

**Files to create**:
- `services/gateway/src/scripts/migrate-existing-contacts.ts`
- `services/gateway/src/scripts/run-migration.ts`

**Logic**:
```typescript
// CRITICAL: Use SCAN iterator, not KEYS (KEYS blocks Redis on large datasets)
async function migrateExistingContacts(options: { dryRun: boolean }) {
  const batchSize = 100;
  let processed = 0;
  let skipped = 0;
  let approved = 0;

  // Use scanStream for non-blocking iteration
  const stream = redis.scanStream({
    match: 'HISTORY:*',
    count: batchSize,
  });

  const batch: string[] = [];

  for await (const keys of stream) {
    for (const key of keys) {
      const contactId = key.replace('HISTORY:', '');

      // Skip if already approved
      const alreadyApproved = await pairingStore.isApproved(contactId);
      if (alreadyApproved) {
        skipped++;
        continue;
      }

      batch.push(contactId);

      // Process in batches
      if (batch.length >= batchSize) {
        if (!options.dryRun) {
          await processBatch(batch);
        }
        approved += batch.length;
        batch.length = 0;
      }

      processed++;
      if (processed % 100 === 0) {
        console.log(`Progress: ${processed} processed, ${approved} approved, ${skipped} skipped`);
      }
    }
  }

  // Process remaining
  if (batch.length > 0 && !options.dryRun) {
    await processBatch(batch);
    approved += batch.length;
  }

  console.log(`Migration complete: ${processed} processed, ${approved} approved, ${skipped} skipped`);
}

async function processBatch(contactIds: string[]) {
  // Use pipeline for batch Redis operations
  const pipeline = redis.pipeline();
  for (const contactId of contactIds) {
    const approved: ApprovedContact = {
      contactId,
      phoneNumber: contactId.replace('@c.us', ''),
      approvedAt: Date.now(),
      approvedBy: 'migration',
      tier: 'standard',
    };
    pipeline.set(`PAIRING:approved:${contactId}`, JSON.stringify(approved));
  }
  await pipeline.exec();
}
```

**CLI Interface**:
```bash
# Dry run (default)
npm run migrate:pairing

# Execute migration
npm run migrate:pairing -- --execute

# With verbose logging
npm run migrate:pairing -- --execute --verbose
```

**Acceptance Criteria**:
- [ ] Uses SCAN iterator (not KEYS) to prevent Redis blocking
- [ ] Batch processing (100 contacts per batch)
- [ ] Pipeline for efficient Redis writes
- [ ] Skip already approved contacts
- [ ] Idempotent (safe to run multiple times)
- [ ] Progress logging every 100 contacts
- [ ] Dry-run mode by default (requires `--execute` flag)
- [ ] Run via npm script: `npm run migrate:pairing`

---

### Epic 1.2: Security Audit System

**Goal**: Implement security event logging and content sanitization.

#### Task 1.2.1: Security Event Logger

**Scope**: Extend existing logger for security-relevant events (don't create separate system)

**Files to modify**:
- `packages/shared-types/src/security.ts` (new - types only)
- `services/gateway/src/utils/logger.ts` (extend existing)
- `services/orchestrator/src/utils/logger.ts` (extend existing)

**Approach**: Extend existing Winston logger with security-specific transport and helper function. Do NOT create a separate logging system.

**Security Events**:
```typescript
// packages/shared-types/src/security.ts
export type SecurityEventType =
  | 'pairing_request'       // New contact attempted access
  | 'pairing_approved'      // Admin approved contact
  | 'pairing_denied'        // Admin denied contact
  | 'pairing_code_attempt'  // Code verification attempt (success/failure)
  | 'pairing_revoked'       // Admin revoked access
  | 'rate_limit_triggered'  // Contact exceeded rate limit
  | 'pause_activated'       // Pause triggered
  | 'kill_switch_activated' // Master kill switch
  | 'suspicious_content'    // Content flagged by analyzer
  | 'auth_session_created'  // WhatsApp session established
  | 'auth_session_expired'; // WhatsApp session lost

export type SecuritySeverity = 'debug' | 'info' | 'warn' | 'error';

export interface SecurityEvent {
  event: SecurityEventType;
  contactId?: string;
  details?: Record<string, unknown>;
  severity: SecuritySeverity;
}
```

**Logger Extension** (add to existing `logger.ts`):
```typescript
// Add security-specific file transport
const securityTransport = new winston.transports.File({
  filename: 'logs/security.jsonl',
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  maxsize: 10 * 1024 * 1024,  // 10MB
  maxFiles: 30,               // Keep 30 days
  tailable: true,
});

// Add transport to existing logger
logger.add(securityTransport);

// Helper function for security events
export function logSecurityEvent(
  event: SecurityEventType,
  severity: SecuritySeverity = 'info',
  contactId?: string,
  details?: Record<string, unknown>
): void {
  const logData = {
    category: 'security',
    event,
    contactId: contactId ? maskContactId(contactId) : undefined,
    ...details,
  };

  logger[severity](logData);

  // Optional: Publish to Redis for real-time dashboard alerts
  if (severity === 'warn' || severity === 'error') {
    redis.publish('events:security', JSON.stringify({
      event,
      severity,
      timestamp: Date.now(),
    }));
  }
}

// Mask sensitive data in logs
function maskContactId(contactId: string): string {
  // Show first 4 and last 2 digits: 1234****89@c.us
  const phone = contactId.replace('@c.us', '');
  if (phone.length <= 6) return contactId;
  return phone.slice(0, 4) + '****' + phone.slice(-2) + '@c.us';
}
```

**Log Format** (JSON Lines):
```json
{
  "timestamp": "2026-01-30T12:00:00Z",
  "level": "info",
  "category": "security",
  "event": "pairing_request",
  "contactId": "1234****89@c.us",
  "displayName": "Unknown"
}
```

**Acceptance Criteria**:
- [ ] Security events logged to separate file `logs/security.jsonl`
- [ ] Extends existing Winston logger (no new logging system)
- [ ] Log rotation (10MB max, keep 30 files)
- [ ] Structured JSON format
- [ ] Contact IDs masked in logs for privacy
- [ ] Critical events published to Redis `events:security` channel
- [ ] Severity levels: debug, info, warn, error

---

#### Task 1.2.2: Content Analyzer (Detection, Not Modification)

**Scope**: Analyze incoming messages for security concerns. **Focus on detection and flagging, NOT modification.** Let Claude handle context interpretation.

**Files to create**:
- `services/gateway/src/utils/content-analyzer.ts`

**Philosophy**:
- Do NOT silently modify user messages
- Flag and log suspicious content
- Pass original message to AI for processing
- Log flagged messages for admin review

**Analysis Rules**:
1. Detect suspicious URLs (static blocklist, not external API)
2. Detect control characters
3. Detect excessively long messages
4. Detect repeated patterns (potential spam)
5. Log all flags to security logger

**Deliverables**:
```typescript
// services/gateway/src/utils/content-analyzer.ts

export type ContentFlagType =
  | 'url_suspicious'      // URL matches known phishing domains
  | 'url_shortener'       // URL uses shortener service
  | 'control_chars'       // Contains control characters
  | 'excessive_length'    // Exceeds max length threshold
  | 'repeated_pattern'    // Contains suspicious repetition
  | 'potential_injection'; // Contains injection-like patterns

export interface ContentFlag {
  type: ContentFlagType;
  details: string;
  position?: number;      // Character position in content
}

export interface ContentAnalysis {
  original: string;
  flags: ContentFlag[];
  riskScore: number;      // 0-1 aggregated score
  shouldLog: boolean;     // true if any flags present
}

export function analyzeContent(content: string): ContentAnalysis;

// Static blocklist (no external API calls in hot path)
const SUSPICIOUS_DOMAINS = new Set([
  'bit.ly', 'tinyurl.com', 'goo.gl',  // Shorteners
  // Add known phishing domains
]);

export function analyzeContent(content: string): ContentAnalysis {
  const flags: ContentFlag[] = [];

  // 1. Check for URLs
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const urls = content.match(urlPattern) || [];
  for (const url of urls) {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      if (SUSPICIOUS_DOMAINS.has(domain)) {
        flags.push({ type: 'url_shortener', details: domain });
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // 2. Check for control characters (except newlines, tabs)
  const controlPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  const controlMatches = content.match(controlPattern);
  if (controlMatches && controlMatches.length > 0) {
    flags.push({ type: 'control_chars', details: `${controlMatches.length} found` });
  }

  // 3. Check length (from shared-types config)
  const maxLength = parseInt(process.env['MAX_MESSAGE_LENGTH'] || '4000');
  if (content.length > maxLength) {
    flags.push({ type: 'excessive_length', details: `${content.length} chars` });
  }

  // 4. Check for repeated patterns
  const repeatPattern = /(.{10,})\1{3,}/;  // Same 10+ chars repeated 3+ times
  if (repeatPattern.test(content)) {
    flags.push({ type: 'repeated_pattern', details: 'Suspicious repetition' });
  }

  // Calculate risk score
  const riskScore = Math.min(1, flags.length * 0.25);

  return {
    original: content,
    flags,
    riskScore,
    shouldLog: flags.length > 0,
  };
}
```

**Integration in Message Handler**:
```typescript
// In message-handler.ts
const analysis = analyzeContent(message.body);
if (analysis.shouldLog) {
  logSecurityEvent('suspicious_content', 'warn', contactId, {
    flags: analysis.flags,
    riskScore: analysis.riskScore,
    preview: analysis.original.slice(0, 100),
  });
}

// Pass ORIGINAL content to orchestrator (do not modify)
await queueMessage(contactId, analysis.original);
```

**Acceptance Criteria**:
- [ ] URLs analyzed against static blocklist (no external API calls)
- [ ] Control characters detected (not removed)
- [ ] Long messages flagged (not truncated)
- [ ] Repeated patterns detected
- [ ] Risk score calculated (0-1)
- [ ] Flagged messages logged via security logger
- [ ] Original content passed through unmodified
- [ ] No runtime performance impact (static analysis only)

---

#### Task 1.2.3: Secret Detection Pre-commit Hook

**Scope**: Prevent accidental commit of secrets

**Files to create**:
- `.gitleaks.toml` (configuration)
- `.pre-commit-config.yaml` (hook config)
- `.github/workflows/security.yml` (CI check)
- Update `package.json` scripts

**Tool**: `gitleaks` (Go binary - no Python dependency, faster than detect-secrets)

**Configuration** (`.gitleaks.toml`):
```toml
[extend]
useDefault = true

[allowlist]
description = "Known false positives"
paths = [
  '''\.env\.example$''',
  '''package-lock\.json$''',
  '''pnpm-lock\.yaml$''',
]

# Custom rules for SecondMe patterns
[[rules]]
id = "anthropic-api-key"
description = "Anthropic API Key"
regex = '''sk-ant-[a-zA-Z0-9-_]{80,}'''
tags = ["api-key", "anthropic"]
```

**Pre-commit Hook** (`.pre-commit-config.yaml`):
```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

**Package.json Scripts**:
```json
{
  "scripts": {
    "prepare": "husky install",
    "secrets:scan": "gitleaks detect --source . --verbose",
    "secrets:scan:staged": "gitleaks protect --staged --verbose"
  }
}
```

**CI Workflow** (`.github/workflows/security.yml`):
```yaml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Husky Hook Setup**:
```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx gitleaks protect --staged --verbose
```

**Acceptance Criteria**:
- [ ] Pre-commit hook blocks commits with potential secrets
- [ ] Gitleaks config with Anthropic API key pattern
- [ ] Allowlist for known false positives (lock files, .env.example)
- [ ] CI workflow runs on PRs to main
- [ ] `npm run secrets:scan` available for manual checks
- [ ] Documentation in CONTRIBUTING.md

---

### Phase 1: Critical Implementation Notes

> **Review Date**: 2026-01-30

#### Security Considerations

| Issue | Severity | Resolution |
|-------|----------|------------|
| Code generation must be crypto-safe | **High** | Use `crypto.randomInt()`, NOT `Math.random()` |
| History stored for unapproved contacts | **Medium** | Move history storage AFTER pairing approval check |
| KEYS command blocks Redis | **Medium** | Use SCAN iterator in migration script |
| Contact IDs in logs expose PII | **Low** | Mask contact IDs: `1234****89@c.us` |

#### Codebase Patterns to Follow

1. **Lua Scripts for Atomicity**: Follow `history-store.ts:84-157` pattern for multi-key atomic operations
2. **Runtime Type Guards**: Follow `isStoredMessage()` pattern in shared-types
3. **Socket Events**: Follow `pause_update` event pattern for real-time dashboard updates
4. **API Routes**: Follow `frontend/src/app/api/pause/route.ts` structure

#### Message Handler Flow (Final)

```
handleIncomingMessage()
  1. Skip if fromMe
  2. Skip if group (@g.us)
  3. ──► NEW: Check isApproved()
       ├─ NO:  handleUnapprovedContact() → return
       └─ YES: continue
  4. Store in history (ONLY for approved)
  5. Check isPaused → skip if true
  6. Check rate limit → skip if exceeded
  7. Queue message to orchestrator
```

#### Dependencies Between Tasks

```
Task 1.1.1 (Types) ─────────────────────────────────┐
                                                    │
Task 1.1.2 (Store) ─── depends on ── Task 1.1.1 ───┤
                                                    │
Task 1.1.3 (Gate) ──── depends on ── Task 1.1.2 ───┤
                                                    │
Task 1.1.4 (UI) ────── depends on ── Task 1.1.3 ───┤
                                                    │
Task 1.1.5 (Migration) depends on ── Task 1.1.2 ───┘

Task 1.2.1 (Logger) ── independent
Task 1.2.2 (Analyzer) ─ depends on ── Task 1.2.1
Task 1.2.3 (Secrets) ── independent
```

---

## Phase 2: Extensibility Architecture (P1) ✅ COMPLETE

**Completed**: 2026-02-01
**Review**: All 4 tasks implemented (2.1.1-2.1.4), 100% complete

### Epic 2.1: Skill/Plugin System

**Goal**: Refactor context retrieval capabilities into independently loadable skills for customization and extensibility.

**Key Design Decision**: Skills are **context providers**, not Claude tools. SecondMe uses direct orchestration, so skills execute during `graphAndPersonaNode` and return structured data for the Claude prompt.

#### Implementation Summary

| Task | Status | Key Files |
|------|--------|-----------|
| 2.1.1 Skill Interface & Registry | ✅ Complete | `shared-types/skills.ts`, `orchestrator/skills/registry.ts` |
| 2.1.2 Built-in Skills Migration | ✅ Complete | 4 skills in `orchestrator/skills/built-in/` |
| 2.1.3 Skill Configuration UI | ✅ Complete | `frontend/src/app/skills/`, API routes |
| 2.1.4 External Skill Loading | ✅ Complete | `orchestrator/skills/loader.ts`, `validator.ts`, `security.ts` |

#### Built-in Skills

| Skill | Description | Config Fields |
|-------|-------------|---------------|
| `knowledge-graph` | Retrieves context from FalkorDB (people, topics, events) | maxPeople, maxTopics, maxEvents, semanticEnabled |
| `persona` | Gets persona style guide based on relationship type | cacheTTL, useRelationshipFallback, defaultTone |
| `style-profile` | Retrieves communication style profile | enabled, minSampleMessages, cacheTTL |
| `conversation-history` | Gets recent conversation with keyword chunking | enabled, maxMessages, tokenBudget, useKeywordChunking |

#### Architecture

```typescript
// Feature flag for backwards compatibility
const USE_SKILL_SYSTEM = process.env['USE_SKILL_SYSTEM'] === 'true';

export async function contextRetrievalNode(state: WorkflowState) {
  if (USE_SKILL_SYSTEM) {
    return graphAndPersonaNodeWithSkills(state);
  }
  return graphAndPersonaNode(state);  // Legacy path
}
```

**Redis Keys**:
```
SKILLS:enabled           # Set of enabled skill IDs
SKILLS:config:{skillId}  # JSON config per skill
```

**API Endpoints** (Orchestrator port 3002):
```
GET    /skills              # List all skills
GET    /skills/:skillId     # Get skill details
POST   /skills/:skillId/enable  # Enable skill
POST   /skills/:skillId/disable # Disable skill
PUT    /skills/:skillId/config  # Update config
```

#### Follow-up Improvements (All Completed)

| Improvement | Description |
|-------------|-------------|
| Execution timeout | 5s timeout with `withTimeout` helper; timed-out skills marked unhealthy |
| Unit tests | 25 tests in `skills/__tests__/registry.test.ts` |
| Unified manifest source | Frontend proxies to orchestrator API (removed hardcoded manifests) |
| Skill ID validation | Type-safe validation in orchestrator endpoints |

#### Task 2.1.4: External Skill Loading ✅ COMPLETE

**Completed**: 2026-02-01

**Files created**:
- `services/orchestrator/src/skills/loader.ts` - `loadSkillFromDirectory`, `loadSkillsFromDirectory`
- `services/orchestrator/src/skills/validator.ts` - `validateSkillManifest`, `hasPermission`
- `services/orchestrator/src/skills/security.ts` - `RestrictedRedis` with permission-based access
- `services/orchestrator/src/skills/__tests__/validator.test.ts` - 14 tests
- `services/orchestrator/src/skills/__tests__/security.test.ts` - 19 tests

**Key Features**:
- **Manifest validation**: Reserved skill IDs, valid permissions, config field validation
- **Security proxy**: RestrictedRedis class filters Redis operations based on skill permissions
- **Protected keys**: PAUSE:, RATE:, QUEUE:, SKILLS:, AUTH:, SESSION: prefixes blocked
- **Namespaced writes**: External skills can only write to `EXT_SKILL:{skillId}:` keys
- **Permission model**: `redis:read`, `redis:write`, `automem:read`, `automem:write`, `network`

**Environment Variable**:
```bash
LOAD_EXTERNAL_SKILLS=true  # Enable loading from skills directory
```

**Usage**:
```typescript
// In orchestrator initialization
await registerExternalSkills('/path/to/skills', logger);
```

**Acceptance Criteria**:
- [x] Load skills from directory structure
- [x] Validate manifests before loading
- [x] Security proxy for Redis access
- [x] Permission-based access control
- [x] Protected key prefixes blocked
- [x] 33 unit tests passing

##### Code Review Fixes (2026-02-01)

| Fix | Description | Status |
|-----|-------------|--------|
| Read whitelist | External skills can only read from CACHE:, EXT_SKILL:, EMB: prefixes (defense in depth) | ✅ Complete |
| Sandboxing warning | Added security warning documenting that skills run unsandboxed in Node.js process | ✅ Complete |
| Protected keys | Blocked HISTORY:, PERSONA:, VOICE_PREF: reads in addition to existing protected prefixes | ✅ Complete |

---

## Phase 3 Completion Summary ✅

**Completed**: 2026-02-01
**Review**: All 6 tasks implemented (3.1.1-3.1.6), 100% complete

### Implementation Highlights

| Task | Files Created | Key Features |
|------|---------------|--------------|
| 3.1.1 Channel Interface | `shared-types/channels.ts`, `gateway/channels/types.ts` | Channel, ChannelMessage, ChannelContact types |
| 3.1.2a Extract Logic | `gateway/channels/rate-limiter.ts` | Reusable RateLimiter class, 22 unit tests |
| 3.1.2b/c WhatsApp Adapter | `gateway/channels/whatsapp/` | Channel interface implementation |
| 3.1.3 Channel Manager | `gateway/channels/channel-manager.ts`, `message-processor.ts` | Multi-channel routing, unified message processing |
| 3.1.4 Telegram | `gateway/channels/telegram/` | grammY adapter, 55 unit tests |
| 3.1.5 Dashboard | `frontend/components/ChannelStatus*.tsx` | Real-time status, enable/disable toggles |
| 3.1.6 Contact Linking | `gateway/contact-linking/` | Cross-channel phone linking, batch queries |

### Architecture

```
ChannelManager
├── WhatsAppChannel (whatsapp-web.js)
├── TelegramChannel (grammY)
└── [Future channels...]

MessageProcessor
├── PairingStore (approval gate)
├── RateLimiter (per-contact limits)
├── ContactLinker (cross-channel linking)
└── ContentAnalyzer (security flags)
```

### New Redis Keys

```
LINKED:phone:{normalizedPhone}  # StoredLinkedContact JSON
LINKED:contact:{contactId}      # normalizedPhone reverse lookup
```

### New API Endpoints

**Gateway (port 3001)**:
```
GET    /api/channels                    # List all channels
POST   /api/channels/:id/enable         # Enable channel
POST   /api/channels/:id/disable        # Disable channel
```

**Frontend (port 3000)**:
```
GET    /api/channels                    # Proxy to gateway
POST   /api/channels/:id                # Enable/disable via action
```

### Socket.io Events

- `channel_manager_status` - Channel status updates (all channels)
- `channel_status` - Individual channel status change

---

## Phase 3: Multi-Channel Support (P2) ✅ COMPLETE

### Epic 3.1: Channel Abstraction Layer

**Goal**: Enable support for multiple messaging platforms beyond WhatsApp.

**Current State**: Gateway service has tightly-coupled WhatsApp implementation with MessageHandler, MessageSender, and session management.

**Target State**: Abstracted channel layer supporting WhatsApp, Telegram, and future platforms.

#### Environment Variables (New)

```bash
# Channel configuration
WHATSAPP_ENABLED=true           # Enable WhatsApp channel (default: true)
TELEGRAM_ENABLED=false          # Enable Telegram channel
TELEGRAM_BOT_TOKEN=             # From BotFather

# Cross-channel settings
CONTACT_LINKING_ENABLED=true    # Link contacts across channels by phone
```

---

#### Task 3.1.1: Channel Interface Definition

**Scope**: Define abstract channel interface and message formats

**Files to create**:
- `packages/shared-types/src/channels.ts`
- `services/gateway/src/channels/types.ts`
- `services/gateway/src/channels/base-channel.ts`

**Deliverables**:
```typescript
// packages/shared-types/src/channels.ts

/**
 * Supported channel identifiers
 */
export type ChannelId = 'whatsapp' | 'telegram' | 'discord' | 'slack';

/**
 * Unified message format across all channels
 */
export interface ChannelMessage {
  id: string;
  version: 2;                    // Schema version for backwards compat
  channelId: ChannelId;
  contactId: string;             // Channel-specific ID (e.g., 1234@c.us)
  normalizedContactId?: string;  // Phone number for cross-channel linking
  content: string;
  timestamp: number;
  mediaType?: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Channel connection status
 */
export type ChannelStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/**
 * Channel information for dashboard
 */
export interface ChannelInfo {
  id: ChannelId;
  displayName: string;
  icon: string;
  status: ChannelStatus;
  contactCount: number;
  lastActivity?: number;
  error?: string;
}

/**
 * Abstract channel interface
 */
export interface Channel {
  readonly id: ChannelId;
  readonly displayName: string;
  readonly icon: string;
  readonly status: ChannelStatus;

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Messaging
  sendMessage(to: string, content: MessageContent): Promise<SendResult>;
  sendTypingIndicator(to: string, durationMs?: number): Promise<void>;

  // Events
  onMessage(handler: (msg: ChannelMessage) => void): void;
  onStatusChange(handler: (status: ChannelStatus, error?: string) => void): void;

  // Contact info
  getContacts(): Promise<ChannelContact[]>;
  getContact(id: string): Promise<ChannelContact | null>;
  normalizeContactId(contactId: string): string | null;  // Extract phone number
}

export interface MessageContent {
  text?: string;
  media?: {
    type: 'image' | 'audio' | 'video' | 'document';
    url: string;
    caption?: string;
    filename?: string;
  };
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ChannelContact {
  id: string;
  channelId: ChannelId;
  normalizedId?: string;         // Phone number
  displayName?: string;
  profilePicUrl?: string;
}

// Runtime type guard
export function isChannelMessage(obj: unknown): obj is ChannelMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as Record<string, unknown>;
  return (
    typeof msg['id'] === 'string' &&
    typeof msg['channelId'] === 'string' &&
    typeof msg['contactId'] === 'string' &&
    typeof msg['content'] === 'string' &&
    typeof msg['timestamp'] === 'number'
  );
}
```

**Acceptance Criteria**:
- [ ] Interface covers common messaging operations
- [ ] Schema version field for backwards compatibility
- [ ] `normalizeContactId()` method for cross-channel linking
- [ ] Runtime type guard for message validation
- [ ] Unit tests for type guards

---

#### Task 3.1.2a: Extract Channel-Agnostic Logic ✅ COMPLETE

**Status**: Completed 2026-01-31

**Scope**: Extract reusable rate limiting logic from current WhatsApp implementation

**Files created**:
- `services/gateway/src/channels/rate-limiter.ts` - RateLimiter class
- `services/gateway/src/channels/__tests__/rate-limiter.test.ts` - 22 unit tests

**Files modified**:
- `services/gateway/src/channels/types.ts` - Added RateLimiter types
- `services/gateway/src/channels/index.ts` - Added exports

**Implementation Notes**:
- Extracted rate limiting from `message-handler.ts:362-420`
- Pairing store (`pairing-store.ts`) was already isolated - reuse as-is
- Content analyzer (`content-analyzer.ts`) was already isolated - integrate later
- Typing simulation stays in orchestrator (it calculates `{typingDelay, thinkTime}` and passes to gateway)

**Deliverables**:
```typescript
// services/gateway/src/channels/rate-limiter.ts
export class RateLimiter {
  constructor(deps: RateLimiterDeps, config?: RateLimiterConfig);
  async check(contactId: string): Promise<RateLimitResult>;
  async reset(contactId: string, clearPause?: boolean): Promise<void>;
  async getCount(contactId: string): Promise<number>;
  getConfig(): Required<RateLimiterConfig>;
}

// Types added to types.ts
export interface RateLimiterConfig {
  threshold?: number;       // Default: 10
  windowSeconds?: number;   // Default: 60
  autoPause?: boolean;      // Default: true
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  threshold: number;
  windowSeconds: number;
  autoPaused: boolean;
}
```

**Acceptance Criteria**:
- [x] RateLimiter extracted as standalone class
- [x] Configurable threshold and window size
- [x] Auto-pause feature with socket.io + Redis pub/sub events
- [x] Fails open on Redis errors (doesn't block messages)
- [x] 22 unit tests passing
- [x] No type errors in new files

**Why no MessageProcessor or TypingSimulator**:
1. Pairing store and content analyzer were already isolated modules
2. WhatsAppChannel adapter (Task 3.1.2b) will orchestrate the pipeline
3. Typing simulation stays in orchestrator - gateway just executes delays

---

#### Task 3.1.2b: WhatsApp Channel Adapter

**Scope**: Wrap existing WhatsApp code in Channel interface

**Files to create**:
- `services/gateway/src/channels/whatsapp/index.ts`
- `services/gateway/src/channels/whatsapp/adapter.ts`
- `services/gateway/src/channels/whatsapp/normalizer.ts`

**Files to modify**:
- `services/gateway/src/whatsapp/client.ts` (keep, used by adapter)
- `services/gateway/src/whatsapp/auth.ts` (keep, used by adapter)

**Deliverables**:
```typescript
// services/gateway/src/channels/whatsapp/adapter.ts
export class WhatsAppChannel implements Channel {
  readonly id: ChannelId = 'whatsapp';
  readonly displayName = 'WhatsApp';
  readonly icon = 'whatsapp';

  constructor(private client: WhatsAppClient);

  // Implement all Channel interface methods
  // Delegate to existing WhatsAppClient

  normalizeContactId(contactId: string): string | null {
    // Extract phone from '1234567890@c.us' → '+1234567890'
    const match = contactId.match(/^(\d+)@c\.us$/);
    return match ? `+${match[1]}` : null;
  }
}
```

**Acceptance Criteria**:
- [ ] WhatsAppChannel implements Channel interface
- [ ] Existing whatsapp-web.js code reused (not rewritten)
- [ ] Messages converted to ChannelMessage format
- [ ] Status changes emit through Channel events
- [ ] `normalizeContactId` extracts phone number
- [ ] All existing WhatsApp tests pass

---

#### Task 3.1.2c: Migrate Message Flow

**Scope**: Update gateway to use Channel abstraction

**Files to modify**:
- `services/gateway/src/index.ts`
- `services/gateway/src/whatsapp/message-handler.ts` → use MessageProcessor
- `services/gateway/src/whatsapp/sender.ts` → use TypingSimulator

**Changes**:
1. Gateway initializes WhatsAppChannel instead of raw client
2. MessageHandler uses MessageProcessor for common logic
3. Sender uses TypingSimulator for delay calculation
4. All socket events include channelId

**Acceptance Criteria**:
- [ ] Gateway uses Channel abstraction
- [ ] Existing functionality preserved
- [ ] Socket events include channelId
- [ ] Integration tests pass

---

#### Task 3.1.3: Channel Router & Manager

**Scope**: Route messages from multiple channels to orchestrator

**Files to create**:
- `services/gateway/src/channels/manager.ts`
- `services/gateway/src/channels/router.ts`
- `services/gateway/src/channels/index.ts`

**Deliverables**:
```typescript
// services/gateway/src/channels/manager.ts
export class ChannelManager {
  private channels: Map<ChannelId, Channel> = new Map();
  private messageProcessor: MessageProcessor;

  constructor(deps: ChannelManagerDeps);

  // Lifecycle
  register(channel: Channel): void;
  unregister(id: ChannelId): void;
  async connectAll(): Promise<void>;
  async disconnectAll(): Promise<void>;

  // Access
  getChannel(id: ChannelId): Channel | undefined;
  listChannels(): ChannelInfo[];

  // Unified message handling (routes through MessageProcessor)
  onMessage(handler: (msg: ChannelMessage) => void): void;

  // Route response back to correct channel
  async sendResponse(
    channelId: ChannelId,
    contactId: string,
    content: MessageContent,
    options?: SendOptions,
  ): Promise<SendResult>;
}
```

**Redis Queue Enhancement** (versioned format):
```typescript
// QUEUE:messages entry with channel info
interface QueuedMessage {
  version: 2;                    // Schema version
  messageId: string;
  channelId: ChannelId;
  contactId: string;             // Channel-specific ID
  normalizedContactId?: string;  // Phone number for linking
  contactName?: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// Backwards compatibility: version 1 messages assume channelId='whatsapp'
```

**Acceptance Criteria**:
- [ ] Multiple channels can be registered
- [ ] Messages from all channels processed through MessageProcessor
- [ ] Queued messages include version and channelId
- [ ] Responses routed to correct channel
- [ ] Graceful handling of channel disconnections
- [ ] Unit tests for ChannelManager

---

#### Task 3.1.4: Telegram Channel Implementation

**Scope**: Add Telegram as second supported channel

**Status**: ✅ Core Implementation Complete (2026-01-31)

**Files created**:
```
services/gateway/src/channels/telegram/
├── index.ts          # Exports
├── adapter.ts        # TelegramChannel implements Channel
└── normalizer.ts     # Contact ID normalization
```

**Files tested**:
```
services/gateway/src/channels/__tests__/
├── telegram-adapter.test.ts    # 29 tests
└── telegram-normalizer.test.ts # 26 tests
```

**Dependencies**: `grammy` (MIT license, well-maintained)

**Implementation**:
```typescript
// services/gateway/src/channels/telegram/adapter.ts
export class TelegramChannel extends BaseChannel {
  readonly id: ChannelId = 'telegram';
  readonly displayName = 'Telegram';
  readonly icon = 'telegram';

  constructor(deps: TelegramChannelDeps, config: TelegramChannelConfig, options?: ChannelInitOptions);

  normalizeContactId(contactId: string): string | null {
    // Telegram users don't share phone numbers by default
    return null;
  }
}
```

**Telegram-Specific Handling**:
- Bot must be started with `/start` command
- Users can share phone number (for linking)
- Voice messages have different format than WhatsApp
- Video messages supported with duration/width/height metadata

**Acceptance Criteria**:
- [x] Telegram bot connects via grammY
- [x] Messages queued with channelId='telegram'
- [x] Responses sent back to Telegram
- [x] `/start` command handled (welcome message)
- [x] Text messages supported
- [x] Photo messages supported
- [x] Voice messages supported
- [x] Document messages supported
- [x] Video messages supported
- [x] Token format validation (fail fast on invalid tokens)
- [x] Contact caching from incoming messages
- [x] Graceful disconnect with cache cleanup
- [x] Dashboard shows Telegram connection status (Task 3.1.5) ✅
- [x] Graceful handling of rate limits (429 errors with retry_after parsing)

##### Code Review Fixes (2026-01-31)

**Priority fixes implemented**:

| Fix | Description | Status |
|-----|-------------|--------|
| Video handler | Handle `message:video` events with metadata | ✅ Complete |
| Contact caching | Cache contact info from incoming messages, clear on disconnect | ✅ Complete |
| Token validation | Fail fast with clear error for invalid tokens (must contain `:`) | ✅ Complete |

**Test improvements**:

| Fix | Description | Status |
|-----|-------------|--------|
| Remove unused import | Removed `type Mock` from vitest imports | ✅ Complete |
| Update test tokens | Changed test tokens to include colon format | ✅ Complete |
| New validation tests | Added tests for empty/invalid token formats | ✅ Complete |
| Handler registration tests | Added tests for all message type handlers | ✅ Complete |

**Deferred items** (nice-to-have):
- Configurable `/start` message
- Repeated typing indicator for long responses

##### Code Review Fixes (2026-02-01)

| Fix | Description | Status |
|-----|-------------|--------|
| Backoff jitter | Added ±25% jitter to exponential backoff in `retryMessageSend` to prevent thundering herd | ✅ Complete |
| Test update | Updated retry test to use range validation (750-1250ms) instead of exact value | ✅ Complete |

---

#### Task 3.1.5: Multi-Channel Dashboard ✅ COMPLETE

**Completed**: 2026-01-31
**Scope**: Update dashboard for multi-channel support

**Files created**:
- `frontend/src/components/ChannelStatusCard.tsx` - Single channel card with icon, status, toggle
- `frontend/src/components/ChannelStatusGrid.tsx` - Grid container with real-time updates
- `frontend/src/components/ui/ChannelBadge.tsx` - Reusable channel badge component
- `frontend/src/app/api/channels/route.ts` - List channels API
- `frontend/src/app/api/channels/[channelId]/route.ts` - Enable/disable channel API

**Files modified**:
- `frontend/src/app/page.tsx` - Added ChannelStatusGrid section
- `frontend/src/components/PairingRequests.tsx` - Added channel badges
- `services/gateway/src/index.ts` - Added enable/disable endpoints
- `packages/shared-types/src/channels.ts` - Added ManagedChannelInfo type

**Gateway API Routes**:
```
GET    /api/channels                    # List all channels with status
POST   /api/channels/:id/enable         # Enable channel
POST   /api/channels/:id/disable        # Disable channel
```

**Frontend API Routes**:
```
GET    /api/channels                    # Proxy to gateway
POST   /api/channels/:id                # Enable/disable via action param
```

**UI Components**:

1. **ChannelStatusCard.tsx**
   - WhatsApp/Telegram icons (inline SVG)
   - Connection status with semantic colors (success/warning/error)
   - Contact count display
   - Enable/Disable toggle button
   - Error message display

2. **ChannelStatusGrid.tsx**
   - Fetches initial state from API
   - Real-time updates via Socket.io `channel_manager_status`
   - Loading skeleton state
   - Error state with retry button
   - Toast notifications for toggle success/failure

3. **ChannelBadge.tsx** (extracted to `ui/`)
   - Supports all channel types (whatsapp, telegram, discord, slack)
   - Consistent styling with semantic colors
   - Reusable across components

4. **Updated Pairing Page**
   - Channel badge on each request
   - Uses shared ChannelBadge component

**Implementation Highlights**:
- Type-safe with `ManagedChannelInfo` from shared-types
- Channel ID validation in gateway endpoints
- Toast notifications via ToastContext
- Error recovery with retry functionality
- Consistent dark mode support

**Acceptance Criteria**:
- [x] All channels shown in dashboard
- [x] Per-channel enable/disable controls
- [x] Pairing requests show channel badge
- [x] Real-time status updates via Socket.io
- [x] Error handling with user feedback
- [x] Loading and error states

---

#### Task 3.1.6: Cross-Channel Contact Linking ✅ COMPLETE

**Completed**: 2026-02-01
**Scope**: Link contacts across channels by phone number

**Files created**:
- `services/gateway/src/contact-linking/contact-linker.ts` - ContactLinker class
- `services/gateway/src/contact-linking/__tests__/contact-linker.test.ts` - 29 unit tests

**Files modified**:
- `packages/shared-types/src/channels.ts` - LinkedContact, StoredLinkedContact types
- `packages/shared-types/src/pairing.ts` - EnrichedApprovedContact type
- `services/gateway/src/channels/message-processor.ts` - Auto-link on message
- `frontend/src/lib/redis-client.ts` - getLinkedChannels, getLinkedChannelsBatch methods
- `frontend/src/app/api/pairing/approved/route.ts` - Enrich with linked channels
- `frontend/src/components/ApprovedContacts.tsx` - Display linked channel badges

**Redis Keys**:
```
LINKED:phone:{normalizedPhone}  # StoredLinkedContact JSON (no TTL)
LINKED:contact:{contactId}      # normalizedPhone string (no TTL)
```

**Implementation**:
```typescript
// services/gateway/src/contact-linking/contact-linker.ts
export class ContactLinker {
  constructor(deps: ContactLinkerDeps);

  async linkContact(channelId, contactId, normalizedPhone, displayName?): Promise<StoredLinkedContact>;
  async getLinkedByPhone(normalizedPhone): Promise<StoredLinkedContact | null>;
  async getPhoneForContact(contactId): Promise<string | null>;
  async isApprovedAcrossChannels(contactId, normalizedPhone?): Promise<LinkedApprovalResult>;
  async getLinkedChannelsForContact(contactId): Promise<LinkedContact['channels']>;
  async getLinkedChannelsBatch(contactIds): Promise<Map<string, LinkedContact['channels']>>;
  async unlinkContact(contactId): Promise<boolean>;
  async listLinkedGroups(limit?): Promise<StoredLinkedContact[]>;
}
```

**Use Cases**:
1. Same person messages on WhatsApp and Telegram
2. Pairing approval applies to all linked contacts (via `isApprovedAcrossChannels`)
3. Dashboard shows linked channels for each approved contact

**Acceptance Criteria**:
- [x] Contacts can be linked by phone number
- [x] Linked contacts share pairing approval
- [x] Dashboard shows linked contacts together
- [x] E.164 phone number validation
- [x] Batch fetching for N+1 query prevention

##### Code Review Improvements (2026-02-01)

| Improvement | Description | Status |
|-------------|-------------|--------|
| E.164 validation | Phone numbers validated against E.164 regex in `linkContact` | ✅ Complete |
| `getLinkedChannelsBatch` | Batch method using `mget` to reduce N+1 queries | ✅ Complete |
| Shared `EnrichedApprovedContact` | Type moved from route/component to shared-types | ✅ Complete |
| Fixed test mock | Pipeline mock returns `pipelineObj` instead of `this` | ✅ Complete |
| Validation tests | Added 4 tests for E.164 format validation | ✅ Complete |
| Batch tests | Added 5 tests for `getLinkedChannelsBatch` | ✅ Complete |

---

### Phase 3: Implementation Notes

#### Risk Assessment

| Task | Complexity | Risk | Mitigation |
|------|------------|------|------------|
| 3.1.1 Interface | Low | Low | Well-defined types |
| 3.1.2a Extract | Medium | Low | No behavior change |
| 3.1.2b Adapter | Medium | **Medium** | Careful testing |
| 3.1.2c Migrate | Medium | **Medium** | Feature flag option |
| 3.1.3 Router | Medium | Low | Straightforward |
| 3.1.4 Telegram | Medium | Low | Independent channel |
| 3.1.5 Dashboard | Medium | Low | UI only |
| 3.1.6 Linking | Low | Low | Optional feature |

#### Backwards Compatibility

1. **Queue Message Version**: Messages without `version` field treated as v1 (WhatsApp-only)
2. **Pairing Store**: Existing `PAIRING:approved:{contactId}` keys remain valid for WhatsApp
3. **Feature Flag**: `MULTI_CHANNEL_ENABLED=true` to enable new code paths

#### Dependencies Between Tasks

```
Task 3.1.1 (Interface) ─────────────────────────────────┐
                                                        │
Task 3.1.2a (Extract) ──── depends on ── Task 3.1.1 ───┤
                                                        │
Task 3.1.2b (Adapter) ──── depends on ── Task 3.1.2a ──┤
                                                        │
Task 3.1.2c (Migrate) ──── depends on ── Task 3.1.2b ──┤
                                                        │
Task 3.1.3 (Router) ────── depends on ── Task 3.1.2c ──┤
                                                        │
Task 3.1.4 (Telegram) ──── depends on ── Task 3.1.1 ───┤ (parallel with 3.1.2-3.1.3)
                          │                             │
                          └─ integrates with ─ 3.1.3 ──┤
                                                        │
Task 3.1.5 (Dashboard) ─── depends on ── Task 3.1.3 ───┤
                                                        │
Task 3.1.6 (Linking) ───── depends on ── Task 3.1.3 ───┘
```

#### Suggested Sprint Plan

**Sprint 5: Channel Foundation (Week 1)**
- Task 3.1.1: Channel Interface Definition (2-3 hours)
- Task 3.1.2a: Extract Channel-Agnostic Logic (4-6 hours)
- Task 3.1.2b: WhatsApp Channel Adapter (4-6 hours)

**Sprint 6: Migration & Router (Week 2)**
- Task 3.1.2c: Migrate Message Flow (3-4 hours)
- Task 3.1.3: Channel Router & Manager (4-6 hours)
- Integration testing (2-3 hours)

**Sprint 7: Telegram & Dashboard (Week 3)**
- Task 3.1.4: Telegram Channel (6-8 hours)
- Task 3.1.5: Multi-Channel Dashboard (4-6 hours)
- Task 3.1.6: Cross-Channel Linking (2-3 hours)

---

## Phase 4 Completion Summary ✅

**Completed**: 2026-02-01
**Review**: All 3 tasks implemented (4.1.1-4.1.3), 100% complete

### Implementation Highlights

| Task | Files Created | Key Features |
|------|---------------|--------------|
| 4.1.1 Voice Transcription | `orchestrator/src/media/transcriber.ts` | OpenAI Whisper API, audio download, format handling |
| 4.1.2 Text-to-Speech | `orchestrator/src/media/synthesizer.ts` | ElevenLabs API, voice synthesis node in workflow |
| 4.1.3 Image Understanding | `orchestrator/src/langgraph/workflow.ts` | Claude Vision, base64 image processing |

### Architecture

```
Voice Message Flow:
Gateway → downloadMedia() → base64 audio → QUEUE:messages
  → Orchestrator → mediaProcessingNode → Whisper transcription
  → response generation → voiceSynthesisNode → ElevenLabs TTS
  → QUEUE:responses (with audioBase64) → Gateway → sendVoice()

Image Message Flow:
Gateway → downloadMedia() → base64 image → QUEUE:messages
  → Orchestrator → mediaProcessingNode → Claude Vision
  → response generation → QUEUE:responses → Gateway
```

### New Files Created

- `packages/shared-types/src/media.ts` - Media types (TranscriptionResult, SynthesisResult, etc.)
- `services/orchestrator/src/media/transcriber.ts` - VoiceTranscriber class
- `services/orchestrator/src/media/synthesizer.ts` - VoiceSynthesizer class
- `services/orchestrator/src/media/index.ts` - Media module exports
- `services/gateway/src/channels/whatsapp/adapter.ts` - sendVoice() method
- `services/gateway/src/channels/telegram/adapter.ts` - sendVoice() method

### Environment Variables

```bash
# Voice Transcription (Task 4.1.1)
OPENAI_API_KEY=               # Required for Whisper
VOICE_TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_TIMEOUT_MS=30000

# Text-to-Speech (Task 4.1.2)
ELEVENLABS_API_KEY=           # Required for TTS
VOICE_OUTPUT_ENABLED=true
ELEVENLABS_VOICE_ID=          # Optional custom voice
TTS_MAX_CHARACTERS=500

# Image Processing (Task 4.1.3)
IMAGE_PROCESSING_ENABLED=true
```

---

## Phase 4: Voice & Media (P2) ✅ COMPLETE

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
- [x] Voice messages detected and downloaded
- [x] Transcription via Whisper API
- [x] Transcribed text processed through normal flow
- [x] Original voice + transcription logged
- [x] Error handling for failed transcriptions

**Status**: ✅ Complete (implemented in `services/orchestrator/src/media/transcriber.ts`)

---

#### Task 4.1.2: Text-to-Speech Response ✅

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
- [x] Text responses converted to audio
- [x] Audio sent as voice message
- [x] Configurable per-contact voice preference (voiceId, modelId, maxCharacters)
- [x] Fallback to text on TTS failure
- [x] Voice preferences stored via AutoMem contact metadata
- [x] Redis caching for voice preferences (30-min TTL)

**Status**: ✅ Complete (implemented in `services/orchestrator/src/media/synthesizer.ts` and `redis/voice-cache.ts`)

##### Code Review Fixes (2026-02-01)

| Fix | Description | Status |
|-----|-------------|--------|
| Voice cache tests | Added 20 unit tests in `redis/__tests__/voice-cache.test.ts` | ✅ Complete |
| CLAUDE.md update | Documented `CACHE:voice:{contactId}` Redis key pattern | ✅ Complete |

---

#### Task 4.1.3: Image Understanding ✅

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
- [x] Image messages detected
- [x] Images passed to Claude as vision content
- [x] Response describes/discusses image
- [x] Large images resized appropriately
- [x] Multiple images in conversation supported

**Status**: ✅ Complete (implemented in `services/orchestrator/src/langgraph/workflow.ts` mediaProcessingNode)

---

## Phase 5 Completion Summary ✅

**Completed**: 2026-02-01
**Review**: All 3 tasks implemented (5.1.1-5.1.3), 100% complete

### Implementation Highlights

| Task | Files Created | Key Features |
|------|---------------|--------------|
| 5.1.1 Embedding Provider | `orchestrator/src/embeddings/provider.ts`, `openai.ts`, `voyage.ts`, `registry.ts` | Abstract provider interface, OpenAI & Voyage implementations, caching, circuit breaker |
| 5.1.2 Conversation Index | `graph-worker/src/embeddings/conversation-indexer.ts` | Topic/time chunking, AutoMem storage, deduplication |
| 5.1.3 Retrieval Fusion | `orchestrator/src/retrieval/fusion.ts` | Multi-source fusion, configurable weights, token budget |

### Architecture

```
Embedding Provider Abstraction:
EmbeddingProvider (interface)
  ├── OpenAIEmbeddings (text-embedding-3-small)
  └── VoyageEmbeddings (voyage-3)
      └── EmbeddingRegistry (singleton factory with fallback)

Conversation Indexing Flow:
Messages → ConversationIndexer.chunkMessages() → generateChunkId()
  → indexChunk() → AutoMem.store() → markChunkIndexed()

Retrieval Fusion:
Query → [semantic, keyword, graph, history] (parallel)
  → fuseResults() → rankAndDeduplicate() → applyTokenBudget()
  → FusionResult (context + history)
```

### Environment Variables

```bash
# Embedding Provider (Task 5.1.1)
EMBEDDING_PROVIDER=voyage          # 'voyage' or 'openai'
VOYAGE_API_KEY=                    # For Voyage embeddings
OPENAI_API_KEY=                    # For OpenAI embeddings

# Conversation Indexing (Task 5.1.2)
CONVERSATION_INDEXING_ENABLED=true # Enable auto-indexing

# Retrieval Fusion (Task 5.1.3)
RETRIEVAL_FUSION_ENABLED=true      # Enable multi-source fusion
```

---

## Phase 5: Enhanced RAG (P3) ✅ COMPLETE

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
- [x] Provider abstraction allows swapping
- [x] Batch embedding for efficiency
- [x] Configurable provider selection
- [x] Caching of frequent embeddings

**Status**: ✅ Complete (implemented in `services/orchestrator/src/embeddings/`)

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
- [x] Conversations chunked intelligently
- [x] Embeddings generated for each chunk
- [x] Stored with proper tags for retrieval
- [x] Deduplication of existing chunks

**Status**: ✅ Complete (implemented in `services/graph-worker/src/embeddings/`)

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
- [x] Multiple retrieval sources combined
- [x] Configurable weights per source
- [x] Deduplication of results
- [x] Token budget respected

**Status**: ✅ Complete (implemented in `services/orchestrator/src/retrieval/fusion.ts`)

---

## Phase 6 Completion Summary ✅

**Completed**: 2026-02-01
**Review**: All 3 tasks implemented (6.1.1-6.1.3), 100% complete

### Implementation Highlights

| Task | Files Created | Key Features |
|------|---------------|--------------|
| 6.1.1 Onboarding Wizard CLI | `packages/cli/` package with 17 files | Interactive setup, .env generation, Docker startup, QR code display |
| 6.1.2 Doctor Command | `packages/cli/src/checks/*.ts` | 5 check categories, actionable fix suggestions, exit codes |
| 6.1.3 Code Quality | `eslint.config.js`, `vitest.config.ts` | max-lines: 700, complexity: 15, 70% coverage threshold |

### Package Structure

```
packages/cli/
├── package.json           # @secondme/cli package
├── tsconfig.json
├── bin/
│   └── secondme.ts        # Entry point
└── src/
    ├── index.ts           # Commander program
    ├── commands/
    │   ├── doctor.ts      # Health check command
    │   ├── status.ts      # Quick status overview
    │   └── onboard.ts     # Interactive wizard
    ├── checks/
    │   ├── index.ts       # Check orchestrator
    │   ├── prerequisites.ts  # Node, Docker checks
    │   ├── infrastructure.ts # Redis, FalkorDB
    │   ├── services.ts    # Service health
    │   ├── external.ts    # AutoMem, WhatsApp, Telegram
    │   └── api-keys.ts    # API key validation
    ├── utils/
    │   ├── output.ts      # Terminal formatting
    │   ├── env.ts         # .env operations
    │   └── docker.ts      # Docker interactions
    └── __tests__/         # 63 unit tests
```

### CLI Commands

```bash
npm run cli doctor     # Comprehensive health check
npm run cli status     # Quick status overview
npm run cli onboard    # Interactive setup wizard
```

### Doctor Command Output

```
SecondMe Doctor
===============

Prerequisites
  ✓ Node.js              v24.12.0
  ✓ npm                  v11.6.2
  ✓ Docker               v29.1.5
  ✓ Docker Compose       Available
  ✓ Git                  v2.50.1

Infrastructure
  ✓ Redis                Connected (localhost:6380)
  ✓ FalkorDB             Connected (localhost:6379)

Services
  ✓ Gateway              Healthy (12ms)
  ✓ Orchestrator         Healthy (8ms)
  ✓ Graph Worker         Healthy (15ms)
  ✗ Frontend             Unreachable
      → Run 'npm run dev' or 'docker compose up -d'

External
  ✓ AutoMem              Connected
  ⚠ WhatsApp Session     Disconnected
      → Scan QR code in dashboard

API Keys
  ✓ ANTHROPIC_API_KEY    Set (sk-ant-...)

────────────────────────────────────────
1 issue found, 1 warning
```

### Code Quality Rules Added

**ESLint** (`eslint.config.js`):
- `max-lines: 700` - Files over 700 lines trigger errors
- `complexity: 15` - High cyclomatic complexity triggers warnings
- `max-depth: 4` - Deep nesting triggers warnings
- `max-nested-callbacks: 3` - Callback hell triggers warnings

**Vitest** (`vitest.config.ts`):
- 70% coverage thresholds for lines, functions, branches, and statements

### Test Coverage

- 63 unit tests covering all CLI modules
- Tests for env utils, docker utils, all check categories
- Mocked fetch/execSync for isolated testing

---

## Phase 6: Developer Experience (P3) ✅ COMPLETE

### Epic 6.1: Onboarding & CLI Tools

#### Task 6.1.1: Onboarding Wizard CLI ✅

**Scope**: Interactive setup for new installations

**Files created**:
- `packages/cli/` - Complete CLI package
- Added to root `package.json` workspaces
- Added `npm run cli` script

**Commands**:
```bash
npm run cli onboard    # Interactive setup wizard
npm run cli doctor     # Health check all services
npm run cli status     # Quick status overview
```

**Onboard Wizard Steps**:
1. Check prerequisites (Node.js, Docker)
2. Copy `.env.example` → `.env` if missing
3. Prompt for Anthropic API key (required, validated)
4. Prompt for AutoMem tokens (offer to generate random)
5. Prompt for optional features (Telegram, Voice, Voyage)
6. Write configuration to `.env`
7. Run `docker compose up -d`
8. Poll health endpoints until ready
9. Display WhatsApp pairing instructions

**Acceptance Criteria**:
- [x] Interactive prompts for all config
- [x] Validation of API keys (sk-ant-* format)
- [x] Docker compose started automatically
- [x] WhatsApp QR code shown in terminal

---

#### Task 6.1.2: Doctor Command ✅

**Scope**: Comprehensive health check

**Files created**:
- `packages/cli/src/commands/doctor.ts`
- `packages/cli/src/checks/*.ts` (6 files)

**Checks**:
1. Prerequisites: Node.js ≥24, npm, Docker, Docker Compose, Git
2. Infrastructure: Redis, FalkorDB (TCP ping)
3. Services: Gateway, Orchestrator, Graph Worker, Frontend (HTTP health)
4. External: AutoMem, WhatsApp session, Telegram
5. API Keys: Anthropic (required), OpenAI, Voyage, ElevenLabs, AutoMem tokens

**Acceptance Criteria**:
- [x] All services checked
- [x] Clear pass/fail output with icons (✓ ✗ ⚠ ○)
- [x] Actionable error messages with fix suggestions
- [x] Exit code reflects health (0 = healthy, 1 = issues)

---

#### Task 6.1.3: Code Quality Enforcement ✅

**Scope**: Add file size limits and coverage thresholds

**Files modified**:
- `eslint.config.js` - Added code quality rules
- `vitest.config.ts` - Added coverage thresholds

**Rules**:
- Max file size: 700 LOC (error)
- Complexity limit: 15 per function (warning)
- Max depth: 4 levels (warning)
- Max nested callbacks: 3 (warning)
- Coverage threshold: 70% (lines, functions, branches, statements)

**Acceptance Criteria**:
- [x] ESLint errors on files > 700 lines
- [x] ESLint warns on high complexity functions
- [x] Coverage threshold enforced in CI

---

## Implementation Order

### Sprint 1: Pairing Core (Week 1)
**Estimated**: 12-16 hours

1. **Task 1.1.1**: Pairing Data Model & Types (1-2 hours)
   - Define types in shared-types
   - Create runtime type guards
   - Unit tests

2. **Task 1.1.2**: Pairing Store (4-6 hours)
   - Redis operations with Lua scripts
   - Secure code generation
   - Unit tests with Redis mock

3. **Task 1.1.3**: Pairing Gate (4-6 hours)
   - Modify message handler flow
   - Code submission detection
   - Socket events

4. **Task 1.1.5**: Migration Script (2-3 hours)
   - SCAN-based iteration
   - Batch processing
   - Dry-run mode

### Sprint 2: Dashboard + Security (Week 2)
**Estimated**: 14-18 hours

1. **Task 1.1.4**: Pairing Dashboard UI (6-8 hours)
   - Pending requests component
   - Approved contacts component
   - API routes
   - Socket.io integration

2. **Task 1.2.1**: Security Logger Extension (2-3 hours)
   - Extend existing Winston logger
   - Security file transport
   - Redis pub/sub for alerts

3. **Task 1.2.3**: Secret Detection Hook (1-2 hours)
   - Gitleaks configuration
   - Pre-commit hook
   - CI workflow

### Sprint 3: Content Analysis + Polish (Week 3)
**Estimated**: 8-10 hours

1. **Task 1.2.2**: Content Analyzer (4-6 hours)
   - Detection logic (not modification)
   - Static URL blocklist
   - Integration with message handler

2. **Integration Testing** (2-3 hours)
   - End-to-end pairing flow
   - Security event logging verification
   - Dashboard functionality

3. **Documentation** (1-2 hours)
   - Update CLAUDE.md with pairing keys
   - Add CONTRIBUTING.md security section

### Sprint 3: Plugin Foundation
1. Task 2.1.1: Skill Interface & Registry
2. Task 2.1.2: Built-in Skills Migration

### Sprint 4: Plugin Complete
1. Task 2.1.3: Skill Configuration UI
2. Task 2.1.4: External Skill Loading

### Sprint 5: Channel Foundation (Week 1)
1. Task 3.1.1: Channel Interface Definition (2-3 hours)
2. Task 3.1.2a: Extract Channel-Agnostic Logic (4-6 hours)
3. Task 3.1.2b: WhatsApp Channel Adapter (4-6 hours)

### Sprint 6: Migration & Router (Week 2)
1. Task 3.1.2c: Migrate Message Flow (3-4 hours)
2. Task 3.1.3: Channel Router & Manager (4-6 hours)
3. Integration testing (2-3 hours)

### Sprint 7: Telegram & Dashboard (Week 3)
1. Task 3.1.4: Telegram Channel (6-8 hours)
2. Task 3.1.5: Multi-Channel Dashboard (4-6 hours)
3. Task 3.1.6: Cross-Channel Linking (2-3 hours)

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
| Multi-Channel | Cross-channel linking | Phone-based linking works |
| Multi-Channel | WhatsApp regression | 0 (all existing tests pass) |
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
| WhatsApp adapter regression | Breaking existing functionality | Feature flag, comprehensive tests, incremental migration |
| Telegram rate limits | Bot may get throttled | Respect rate limits, queue outgoing messages |
| Whisper API costs | Voice transcription can be expensive | Usage limits, optional feature |
| Breaking changes | Existing users affected | Migration scripts, backwards compatibility |

---

## References

- [Moltbot Research Findings](../research/moltbot-learnings.md)
- [SecondMe CLAUDE.md](../../CLAUDE.md)
- [Project Specifications](../../specs/001-personal-ai-clone/)
