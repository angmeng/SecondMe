# Moltbot Research Findings

**Repository**: https://github.com/moltbot/moltbot
**Research Date**: 2026-01-29
**Purpose**: Identify patterns, features, and approaches applicable to SecondMe

---

## Executive Summary

Moltbot is a personal AI assistant that shares significant overlap with SecondMe's goals. Both projects:
- Act as personal AI assistants via messaging platforms
- Use WhatsApp as a primary channel
- Employ Node.js/TypeScript stacks
- Focus on context-aware conversations

Key learnings center around: **multi-channel architecture**, **security model**, **memory/RAG system**, **plugin extensibility**, and **code quality practices**.

---

## 1. Architecture Patterns

### Hub-and-Spoke Gateway Model

Moltbot uses a centralized gateway as a WebSocket control plane (`ws://127.0.0.1:18789`):

```
Messaging Channels (WhatsApp, Telegram, etc.)
    ↓
Gateway (WebSocket control plane)
    ├─ Pi agent runtime (RPC mode)
    ├─ CLI interface
    ├─ Web UI/WebChat
    ├─ macOS companion app
    └─ iOS/Android nodes
```

**Learnings for SecondMe**:
- Our current Redis Streams architecture (`QUEUE:messages`, `QUEUE:responses`) is simpler but less flexible
- A WebSocket control plane enables real-time bidirectional communication with multiple client types
- Consider adding WebSocket support alongside Redis Streams for richer client integrations

### RPC Method Registry

Gateway exposes methods like:
- `sessions_list`, `sessions_history`, `sessions_send` - agent coordination
- `node.list`, `node.describe`, `node.invoke` - capability discovery
- `browser`, `canvas`, `cron`, `webhook` - tool categories

**Learnings for SecondMe**:
- Formalizing our API as an RPC registry would improve discoverability
- Could enable future CLI/mobile app integrations using same protocol

---

## 2. Security Model

### Pairing Mode (Critical Learning)

Moltbot treats **all inbound DMs as untrusted by default**:

1. Unknown senders receive a short pairing code
2. Messages are NOT processed until admin approves via `moltbot pairing approve`
3. This prevents unauthorized access and spam

**Implementation for SecondMe**:
```typescript
// Suggested flow
interface PairingRequest {
  contactId: string;
  code: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'denied';
}

// Redis key: PAIRING:{contactId}
// On first message from unknown contact:
// 1. Generate 6-digit code
// 2. Store in Redis with TTL
// 3. Reply: "Reply with your pairing code to continue"
// 4. Admin approves via dashboard
```

### Sandboxing for Groups

Group messages can optionally run in Docker sandboxes to isolate potentially malicious tool execution.

**Learnings for SecondMe**:
- Our current rate limiting (10 msgs/min) is basic
- Consider group-specific security policies
- Tool execution sandboxing for safety (especially if adding browser/code execution tools)

### Security Audit System

Moltbot includes:
- `audit.ts` - Security audit functionality
- `audit-fs.ts` - File system auditing
- `external-content.ts` - Safe handling of external content
- `.detect-secrets.cfg` - Secret detection in codebase

**Learnings for SecondMe**:
- Add pre-commit hooks for secret detection
- Implement content sanitization for incoming messages
- Log security-relevant events separately

---

## 3. Memory & RAG System

### Multi-Provider Embeddings

```
src/memory/
├── embeddings.ts           # Abstraction layer
├── embeddings-gemini.ts    # Google embeddings
├── embeddings-openai.ts    # OpenAI embeddings
├── sqlite.ts               # Persistence
├── sqlite-vec.ts           # Vector search
├── hybrid.ts               # Combined search
└── manager.ts              # Orchestration
```

**Key Features**:
- SQLite + vector extensions for local-first storage
- Hybrid search (vector + keyword) for better recall
- Batch processing for large embedding jobs
- Deduplication to prevent redundant processing

**Learnings for SecondMe**:
- Our FalkorDB knowledge graph is good for relationships
- Consider adding vector embeddings for semantic search
- Hybrid retrieval (graph + vector + keyword) could improve RAG quality
- Batch embedding generation for efficiency

### Session File Management

- Active conversation state tracked in session files
- Atomic reindexing for consistency
- Cache keys for frequently accessed context

**Learnings for SecondMe**:
- Our `HISTORY:{contactId}` Redis key approach is similar
- Consider adding atomic operations for conversation history updates
- Implement cache key patterns for persona data

---

## 4. Multi-Channel Support

Moltbot supports **13+ channels**:

| Channel | Library | Notes |
|---------|---------|-------|
| WhatsApp | Baileys | Web-based (like our whatsapp-web.js) |
| Telegram | grammY | Popular alternative |
| Slack | Bolt | Enterprise integration |
| Discord | discord.js | Community/gaming |
| Signal | signal-cli | Privacy-focused |
| iMessage | imsg | Apple ecosystem |
| Teams | extension | Enterprise |
| Matrix | extension | Open protocol |

**Learnings for SecondMe**:
- Our WhatsApp-only approach limits reach
- Consider modular channel architecture:

```typescript
// Channel abstraction
interface Channel {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(to: string, content: MessageContent): Promise<void>;
  onMessage(handler: MessageHandler): void;
}

// Easy to add new channels
class WhatsAppChannel implements Channel { ... }
class TelegramChannel implements Channel { ... }
```

### Unified Routing

- `src/channels` provides unified channel abstraction
- `src/routing` handles message routing logic
- Per-channel activation modes (mention-only vs always-on)

---

## 5. Skills/Plugin System

### Modular Architecture

52+ skills organized as self-contained units:

```
skills/
├── discord/
├── github/
├── notion/
├── obsidian/
├── openai/
├── spotify/
├── weather/
├── coding-agent/
├── skill-creator/     # Meta-skill to create new skills
└── ...
```

**Learnings for SecondMe**:
- Our current monolithic orchestrator could benefit from plugin architecture
- Skills as independently loadable modules enables:
  - User customization
  - Easier maintenance
  - Community contributions

### Skill Registry Pattern

```typescript
// Potential implementation for SecondMe
interface Skill {
  name: string;
  description: string;
  tools: Tool[];
  activate(): Promise<void>;
  deactivate(): Promise<void>;
}

class SkillRegistry {
  private skills: Map<string, Skill>;

  register(skill: Skill): void;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
  getTools(): Tool[];
}
```

---

## 6. Code Quality Practices

### Strict Standards

| Practice | Moltbot | SecondMe Status |
|----------|---------|-----------------|
| TypeScript strict mode | Yes | Yes |
| Avoid `any` | Enforced | Enforced |
| File size limit | ~700 LOC | Not enforced |
| Test coverage threshold | 70% | Not enforced |
| Linter | oxlint | ESLint |
| Formatter | oxfmt | Prettier |

**Learnings for SecondMe**:
- Consider adding file size guidelines (700 LOC is reasonable)
- Implement coverage thresholds in CI
- oxlint is faster than ESLint (potential upgrade)

### Testing Strategy

```
*.test.ts      - Unit tests (colocated)
*.e2e.test.ts  - End-to-end tests
```

Live tests with environment flag:
```bash
CLAWDBOT_LIVE_TEST=1 pnpm test:live
```

**Learnings for SecondMe**:
- Our test structure is similar (Vitest + Playwright)
- Consider adding live test mode for integration testing with real services

### Multi-Agent Safety

Guidelines for when multiple AI agents work on codebase:
- Don't create/apply/drop git stash without permission
- Don't switch branches without permission
- Keep unrelated WIP untouched
- Auto-resolve formatting-only diffs

**Learnings for SecondMe**:
- Add similar guidelines to our CLAUDE.md

---

## 7. Voice & Media Features

### Voice Integration

- Voice Wake: Always-on speech recognition
- Talk Mode: Continuous conversation
- ElevenLabs for text-to-speech
- Push-to-talk overlays on mobile

**Learnings for SecondMe**:
- Voice could be a future differentiator
- WhatsApp voice messages already supported by whatsapp-web.js
- Consider adding voice transcription (Whisper API) and TTS (ElevenLabs)

### Media Understanding

```
src/media-understanding/    # Image/video analysis
src/link-understanding/     # URL parsing/preview
src/tts/                    # Text-to-speech
```

**Learnings for SecondMe**:
- Our current implementation handles media minimally
- Add image understanding via Claude's vision capabilities
- URL preview extraction for shared links

---

## 8. Configuration & Deployment

### Workspace Configuration

```
~/clawd/
├── moltbot.json       # Main config
├── AGENTS.md          # Agent behavior prompts
├── SOUL.md            # Personality definition
└── TOOLS.md           # Available tools
```

**Learnings for SecondMe**:
- Injectable prompt files separate concerns
- Users can customize personality without code changes
- Consider similar structure:
  ```
  ~/.secondme/
  ├── config.json
  ├── PERSONA.md         # Personality prompts
  ├── CONSTRAINTS.md     # Safety rules
  └── TOOLS.md           # Tool definitions
  ```

### Daemon Management

- launchd (macOS) / systemd (Linux) integration
- `moltbot onboard --install-daemon` for auto-start
- Health checks via `moltbot doctor`

**Learnings for SecondMe**:
- Add systemd service file for production deployment
- Implement health check endpoint
- Consider onboarding wizard for easier setup

---

## 9. Action Items for SecondMe

### High Priority

1. **Implement Pairing Mode**
   - Protect against unauthorized access
   - Add to dashboard for approval workflow
   - Estimated complexity: Medium

2. **Add Vector Embeddings to RAG**
   - Complement knowledge graph with semantic search
   - Use OpenAI/Voyage embeddings
   - Estimated complexity: Medium-High

3. **Implement Skill/Plugin Architecture**
   - Refactor tools into loadable skills
   - Enable user customization
   - Estimated complexity: High

### Medium Priority

4. **Multi-Channel Abstraction**
   - Design channel interface
   - Add Telegram as second channel
   - Estimated complexity: Medium

5. **Voice Message Support**
   - Transcribe incoming voice messages
   - TTS for responses (optional)
   - Estimated complexity: Medium

6. **File Size Guidelines**
   - Add 700 LOC soft limit
   - Enforce via ESLint rule
   - Estimated complexity: Low

### Lower Priority

7. **Security Audit Logging**
   - Separate security event log
   - Add secret detection
   - Estimated complexity: Low

8. **Health Check Endpoint**
   - Add `GET /health` to each service
   - Implement `secondme doctor` CLI
   - Estimated complexity: Low

9. **Onboarding Wizard**
   - Interactive setup CLI
   - Auto-generate .env
   - Estimated complexity: Medium

---

## 10. Summary Comparison

| Feature | Moltbot | SecondMe | Gap |
|---------|---------|----------|-----|
| Channels | 13+ | 1 (WhatsApp) | Large |
| Security | Pairing + Sandbox | Rate limit only | Medium |
| Memory | SQLite + Vector | Redis + FalkorDB | Different approach |
| Plugins | 52+ skills | Monolithic | Large |
| Voice | Full support | None | Large |
| Testing | 70% coverage | Unknown | Unknown |
| Deployment | Daemon + CLI | Docker only | Medium |

---

## References

- Repository: https://github.com/moltbot/moltbot
- Documentation: https://docs.molt.bot
- Key files reviewed:
  - AGENTS.md (guidelines)
  - README.md (overview)
  - src/gateway (architecture)
  - src/memory (RAG system)
  - src/security (security model)
  - skills/ (plugin system)
