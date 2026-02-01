# Backend Services Guidelines

This file provides guidance for Claude Code when working with SecondMe backend services.

## Service Overview

```
services/
├── gateway/           # Multi-channel messaging gateway (port 3001)
│   └── src/
│       ├── channels/  # Channel abstraction layer
│       │   ├── telegram/  # Telegram adapter (grammY)
│       │   └── whatsapp/  # WhatsApp adapter (whatsapp-web.js)
│       ├── whatsapp/  # Legacy WhatsApp code (being migrated)
│       ├── redis/     # Pub/sub, queue client, history store
│       ├── socket/    # Real-time event emitter
│       └── middleware/# Security middleware
├── orchestrator/      # AI workflow (port 3002)
│   └── src/
│       ├── langgraph/ # Workflow, router, graph nodes
│       ├── anthropic/ # Haiku, Sonnet clients, prompts
│       ├── falkordb/  # Cypher queries
│       ├── history/   # Conversation history RAG (keyword chunking)
│       ├── media/     # Voice transcription (Whisper), image processing
│       ├── embeddings/# Embedding providers (OpenAI, Voyage)
│       ├── retrieval/ # RAG retrieval fusion
│       ├── config/    # Feature configurations
│       ├── hts/       # Human typing simulation
│       └── redis/     # Consumer, persona cache
└── graph-worker/      # Knowledge ingestion (port 3003)
    └── src/
        ├── ingestion/ # Parser, extractor, graph builder
        ├── embeddings/# Conversation indexing for semantic search
        ├── config/    # Configuration (stopwords, etc.)
        ├── falkordb/  # Mutations
        └── redis/     # Consumer
```

## Gateway Service

### Purpose
Multi-channel messaging gateway that bridges messaging platforms (WhatsApp, Telegram) with the microservices architecture via Redis Streams.

### Key Files
| File | Responsibility |
|------|----------------|
| `whatsapp/client.ts` | WhatsApp Web.js client initialization |
| `whatsapp/auth.ts` | QR code authentication handler |
| `whatsapp/message-handler.ts` | Incoming message processing, fromMe detection |
| `whatsapp/sender.ts` | Outgoing messages with HTS typing simulation |
| `socket/events.ts` | Socket.io event emitter to frontend |
| `redis/client.ts` | ioredis client, pub/sub, streams |
| `redis/history-store.ts` | Conversation history storage (HISTORY:{contactId}) |

### Message Handler Pattern
```typescript
// Always check fromMe first
if (message.fromMe) {
  await pauseContact(contactId, 'fromMe', 60 * 60); // 60 min
  return;
}

// Rate limit check
const count = await incrementRateLimit(contactId);
if (count > 10) {
  await pauseContact(contactId, 'rate_limit', 60 * 60);
  return;
}

// Queue for processing
await redis.xadd('QUEUE:messages', '*', { ... });
```

### HTS Timing Formula
```typescript
const delay = 30 + (text.length * 2) + randomJitter(0, 500);
// Capped at 5000ms
```

### Channel Abstraction Layer

The gateway uses a channel abstraction to support multiple messaging platforms.

**Key Files**:
| File | Responsibility |
|------|----------------|
| `channels/base-channel.ts` | Abstract base class for all channels |
| `channels/types.ts` | Channel interfaces and types |
| `channels/rate-limiter.ts` | Reusable rate limiting logic |
| `channels/telegram/adapter.ts` | Telegram bot adapter (grammY) |
| `channels/telegram/normalizer.ts` | Telegram contact ID normalization |

**Telegram Channel**:
- Uses grammY library for Telegram Bot API
- Contact IDs normalized to `tg_{userId}` format
- Supports text, photo, voice, document, and video messages
- Token validation on construction (must contain `:`)
- Contact caching from incoming messages
- Media download with retry logic (3 retries, exponential backoff)

**Media Download (Phase 4)**:

Both channel adapters implement `downloadMedia()` for voice/image processing:

```typescript
// WhatsApp: Uses message caching (messages cached for 5 minutes)
const media = await whatsappChannel.downloadMedia(messageId);
// Returns: { base64: string, mimeType: string, sizeBytes: number } | null

// Telegram: Uses Bot API getFile() with retry logic
const media = await telegramChannel.downloadMedia(fileId);
// Retries on 5xx errors, 429 rate limits, and network failures
```

**WhatsApp Message Cache**:
- Messages cached on receive for later media download
- TTL: 5 minutes
- Periodic cleanup every 60 seconds
- Cache cleared on disconnect

**Size Validation** (in message-processor.ts):
```typescript
// Two-tier validation:
// 1. Queue payload limit (default 10MB, configurable via MAX_QUEUE_PAYLOAD_MB)
// 2. Processing limit (25MB for Whisper, from DEFAULT_MEDIA_LIMITS)
if (mediaSize > MAX_QUEUE_PAYLOAD_SIZE_BYTES) {
  // Skip media, continue processing message text
}
```

**Channel Manager API**:
```
GET    /api/channels                    # List all channels with status
POST   /api/channels/:channelId/enable  # Enable a channel
POST   /api/channels/:channelId/disable # Disable a channel
```

**Socket.io Events**:
- `channel_manager_status` - Emitted when channel status changes
  - Payload: `{ channels: ManagedChannelInfo[], timestamp: number }`

**Shared Types** (from `@secondme/shared-types`):
- `ManagedChannelInfo` - Channel info with `enabled` field for dashboard
- `ChannelInfo` - Base channel information
- `ChannelStatus` - Connection status enum (`connected` | `connecting` | `disconnected` | `error`)

**Environment Variables**:
```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...  # From @BotFather
TELEGRAM_ENABLED=true                       # Enable Telegram channel
```

### Cross-Channel Contact Linking

Links contacts across messaging channels by normalized phone number, enabling shared approval status and unified contact view.

**Key Files**:
| File | Responsibility |
|------|----------------|
| `contact-linking/contact-linker.ts` | ContactLinker class with phone-based linking |

**Redis Keys**:
```
LINKED:phone:{normalizedPhone}  # StoredLinkedContact JSON (no TTL)
LINKED:contact:{contactId}      # normalizedPhone reverse lookup (no TTL)
```

**ContactLinker API**:
```typescript
class ContactLinker {
  // Link a contact to their phone number (auto-called on message)
  async linkContact(channelId, contactId, normalizedPhone, displayName?): Promise<StoredLinkedContact>;

  // Check if any linked contact is approved (cross-channel approval)
  async isApprovedAcrossChannels(contactId, normalizedPhone?): Promise<LinkedApprovalResult>;

  // Get all channels linked to a contact
  async getLinkedChannelsForContact(contactId): Promise<LinkedContact['channels']>;

  // Batch get for N+1 query prevention (used by dashboard API)
  async getLinkedChannelsBatch(contactIds): Promise<Map<string, LinkedContact['channels']>>;

  // Reverse lookup: get phone for contact ID
  async getPhoneForContact(contactId): Promise<string | null>;

  // Unlink a contact (preserves other channels)
  async unlinkContact(contactId): Promise<boolean>;
}
```

**Phone Number Validation**:
- All phone numbers must be in E.164 format (e.g., `+1234567890`)
- `linkContact` throws an error for invalid formats
- Regex: `/^\+[1-9]\d{1,14}$/`

**Shared Types** (from `@secondme/shared-types`):
- `LinkedContact` - Contact with all channel entries
- `StoredLinkedContact` - LinkedContact with timestamps
- `EnrichedApprovedContact` - ApprovedContact with linkedChannels for dashboard

## Orchestrator Service

### Purpose
Orchestrates AI workflow using LangGraph, manages Claude API calls, and retrieves graph context.

### Key Files
| File | Responsibility |
|------|----------------|
| `langgraph/workflow.ts` | Main StateGraph workflow definition |
| `langgraph/router-node.ts` | Phatic vs substantive routing |
| `langgraph/graph-node.ts` | FalkorDB context retrieval node, skill-based retrieval |
| `anthropic/haiku-client.ts` | Claude Haiku for classification |
| `anthropic/sonnet-client.ts` | Claude Sonnet with prompt caching |
| `anthropic/prompt-templates.ts` | System prompts, persona templates |
| `history/history-cache.ts` | In-memory LRU cache for history |
| `history/keyword-chunker.ts` | Keyword extraction and topic chunking |
| `config/history-config.ts` | History feature configuration |
| `falkordb/queries.ts` | Cypher query builders |
| `hts/delay-calculator.ts` | Typing delay calculation |
| `hts/sleep-hours.ts` | Sleep hours enforcement |
| `skills/registry.ts` | Skill lifecycle management and execution |
| `skills/base-skill.ts` | Abstract base class for skills |
| `skills/built-in/*.ts` | Built-in skills (knowledge-graph, persona, etc.) |

### LangGraph Workflow Pattern
```typescript
const workflow = new StateGraph(StateAnnotation)
  .addNode('check_pause', checkPauseNode)
  .addNode('classify', classifyNode)
  .addNode('retrieve_context', retrieveContextNode)
  .addNode('generate_response', generateResponseNode)
  .addNode('queue_response', queueResponseNode)
  .addEdge(START, 'check_pause')
  .addConditionalEdges('check_pause', pauseCondition)
  .addEdge('classify', 'retrieve_context')
  .addEdge('retrieve_context', 'generate_response')
  .addEdge('generate_response', 'queue_response')
  .addEdge('queue_response', END);
```

### Claude Client Pattern
```typescript
// Use prompt caching for system prompts
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-5-20250514',
  max_tokens: 1024,
  system: [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' }
    }
  ],
  messages: [{ role: 'user', content: userMessage }]
});
```

### Conversation History (RAG Context)

The history module provides conversation context for more coherent responses.

**Architecture:**
- Gateway stores messages → `HISTORY:{contactId}` Redis list
- Orchestrator retrieves and processes → keyword-based chunking
- Relevant chunks included in Claude prompt

**Key Components:**
| File | Responsibility |
|------|----------------|
| `history/history-cache.ts` | In-memory LRU cache (reduces Redis calls) |
| `history/keyword-chunker.ts` | Extract keywords, chunk by topic continuity |
| `config/history-config.ts` | Token limits, TTL, chunking thresholds |

**Keyword Chunking Algorithm:**
```typescript
// 1. Extract keywords from each message (nouns, verbs)
// 2. Group messages into chunks by:
//    - Time gaps (configurable minutes)
//    - Keyword overlap ratio (0-1 threshold)
// 3. Select most relevant chunks for current query
// 4. Fit within token budget
```

**Shared Types:**
Types are defined in `@secondme/shared-types` package:
- `StoredMessage` - Redis storage format
- `ConversationMessage` - Claude API format
- `HistoryConfig` - Feature configuration
- `ConversationChunk` - Grouped message chunk

### Skill System

The orchestrator uses a skill-based architecture for context retrieval. Enable with `USE_SKILL_SYSTEM=true` in `.env`.

**Built-in Skills:**
| Skill | Description |
|-------|-------------|
| `knowledge-graph` | Retrieves context from FalkorDB (people, topics, events) |
| `persona` | Gets persona style guide based on relationship type |
| `style-profile` | Retrieves communication style profile |
| `conversation-history` | Gets recent conversation with keyword chunking |

**Skill Registry:**
```typescript
// Skills execute during context retrieval
const skillResults = await skillRegistry.executeAll({
  contactId: state.contactId,
  messageContent: state.content,
  relationshipType,
});

// Results provide structured data for Claude prompt
const graphContext = skillResults.find(r => r.data?.graphContext)?.data;
const persona = skillResults.find(r => r.data?.persona)?.data;
```

**Redis Keys:**
```
SKILLS:enabled           # Set of enabled skill IDs
SKILLS:config:{skillId}  # JSON config per skill
```

**API Endpoints (port 3002):**
```
GET    /skills              # List all skills
GET    /skills/:skillId     # Get skill details
POST   /skills/:skillId/enable  # Enable skill
POST   /skills/:skillId/disable # Disable skill
PUT    /skills/:skillId/config  # Update config
```

**Adding New Skills:**
1. Create skill class extending `BaseSkill` in `skills/built-in/`
2. Implement `execute()` to return `SkillExecutionResult`
3. Register in `skills/index.ts` via `registerBuiltInSkills()`

**External Skill Loading:**

External skills can be loaded from a directory structure. Enable with `LOAD_EXTERNAL_SKILLS=true`.

**Key Files:**
| File | Responsibility |
|------|----------------|
| `skills/loader.ts` | Load skills from directory, validate manifests |
| `skills/validator.ts` | Manifest validation, permission checking |
| `skills/security.ts` | RestrictedRedis for permission-based access |

**Directory Structure:**
```
/path/to/skills/
├── my-skill/
│   └── index.js     # Default export: skill class constructor
├── another-skill/
│   └── index.js
```

**Security Model:**
- External skills use `RestrictedRedis` proxy for filtered Redis access
- Protected key prefixes (blocked): `PAUSE:`, `RATE:`, `QUEUE:`, `SKILLS:`, `AUTH:`, `SESSION:`
- Write access limited to namespaced keys: `EXT_SKILL:{skillId}:*`
- Read access allowed for non-protected keys

**Permissions:**
| Permission | Description |
|------------|-------------|
| `redis:read` | Read from non-protected Redis keys |
| `redis:write` | Write to skill-namespaced keys only |
| `automem:read` | Read from AutoMem memory store |
| `automem:write` | Write to AutoMem memory store |
| `network` | Make outbound HTTP requests |

**Manifest Validation:**
- Reserved IDs blocked: `knowledge-graph`, `persona`, `style-profile`, `conversation-history`
- ID format: lowercase alphanumeric with hyphens
- Valid permissions only
- Config field type validation (string, number, boolean)

### Media Processing (Phase 4)

The orchestrator processes voice messages and images via the media pipeline.

**Key Files:**
| File | Responsibility |
|------|----------------|
| `media/transcriber.ts` | VoiceTranscriber class using OpenAI Whisper API |
| `media/index.ts` | Media module exports |
| `langgraph/workflow.ts` | `mediaProcessingNode` for audio/image routing |
| `anthropic/sonnet-client.ts` | Claude Vision image block support |

**Data Flow:**
```
Queue Message (mediaBase64, mediaMimeType)
    ↓
Orchestrator Entry Point
    ↓
Media Processing Node
    ├── Audio → Whisper API → transcribedText → content
    └── Image → ImageContent → Claude Vision
    ↓
Substantive Response Node
```

**Voice Transcription:**
```typescript
// VoiceTranscriber singleton with lazy initialization
const transcriber = getVoiceTranscriber();

// Transcribe audio (base64 + mimeType)
const result = await transcriber.transcribe(base64Audio, 'audio/ogg');
// Returns: { text: string, language?: string, durationMs?: number }
```

**Image Processing:**
```typescript
// Images are converted to Claude Vision content blocks
const imageContent: ImageContent = {
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/jpeg',
    data: base64ImageData,
  },
};

// Passed to Sonnet client
await sonnetClient.getContextualResponse(systemPrompt, userMessage, {
  images: [imageContent],
});
```

**WorkflowState Media Fields:**
```typescript
interface WorkflowState {
  // ... existing fields
  mediaType?: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaBase64?: string;
  mediaMimeType?: string;
  transcribedText?: string;
  imageContent?: ImageContent;
}
```

**Environment Variables:**
```bash
OPENAI_API_KEY=sk-...              # Required for Whisper
VOICE_TRANSCRIPTION_ENABLED=true   # Feature flag (default: true)
MEDIA_MAX_SIZE_MB=25               # Whisper limit
TRANSCRIPTION_TIMEOUT_MS=30000     # API timeout
```

**Shared Types** (from `@secondme/shared-types`):
- `TranscriptionResult` - Whisper API response
- `ImageContent` - Claude Vision content block
- `DownloadedMedia` - Base64 + mimeType + sizeBytes
- `TranscriptionConfig` - Transcriber settings
- `DEFAULT_MEDIA_LIMITS` - Size limits for validation

### Embedding Providers (Phase 5)

The orchestrator supports multiple embedding providers with automatic fallback.

**Key Files:**
| File | Responsibility |
|------|----------------|
| `embeddings/provider.ts` | Abstract base class with caching and circuit breaker |
| `embeddings/openai.ts` | OpenAI text-embedding-3-small (1536 dimensions) |
| `embeddings/voyage.ts` | Voyage voyage-3 (1024 dimensions) |
| `embeddings/registry.ts` | Provider factory with fallback support |

**Provider Abstraction:**
```typescript
// Get configured provider (auto-fallback if primary unavailable)
const provider = embeddingRegistry.getAvailableProvider();

// Embed single text (with Redis caching)
const result = await provider.embed('search query');
// Returns: { embedding: number[], fromCache: boolean, tokensUsed: number }

// Batch embedding
const results = await provider.embedBatch(['text1', 'text2']);
```

**Voyage Input Types:**
```typescript
// Voyage supports query vs document embedding
const voyageProvider = getVoyageEmbeddings();

// For search queries
const queryEmbed = await voyageProvider.embedWithType('search query', 'query');

// For documents to be indexed
const docEmbed = await voyageProvider.embedWithType('document content', 'document');
```

**Circuit Breaker:**
- Opens after 5 consecutive failures (configurable)
- Auto-resets after 60 seconds
- Prevents cascading failures to embedding APIs

**Environment Variables:**
```bash
EMBEDDING_PROVIDER=voyage      # 'voyage' or 'openai' (default: voyage)
VOYAGE_API_KEY=               # Required for Voyage
OPENAI_API_KEY=               # Required for OpenAI
```

### Retrieval Fusion (Phase 5)

Multi-source retrieval combining semantic, keyword, graph, and history sources.

**Key Files:**
| File | Responsibility |
|------|----------------|
| `retrieval/fusion.ts` | RetrievalFusion class with weighted scoring |
| `retrieval/hybrid-retriever.ts` | Legacy semantic retriever |
| `retrieval/index.ts` | Module exports |

**Fusion Strategy:**
```
Query → [semantic, keyword, graph, history] (parallel)
  → fuseResults() → rankAndDeduplicate() → applyTokenBudget()
  → FusionResult (context + history)
```

**Default Weights:**
| Source | Weight | Description |
|--------|--------|-------------|
| Semantic | 0.4 | AutoMem vector search |
| Graph | 0.3 | FalkorDB entity relationships |
| Keyword | 0.2 | Keyword-based filtering |
| History | 0.1 | Conversation history context |

**Usage:**
```typescript
const fusion = getRetrievalFusion();

const result = await fusion.retrieve('user message', 'contact-123');
// Returns: FusionResult with context, history, stats

console.log(result.method);        // 'fusion' | 'legacy'
console.log(result.stats.tokenEstimate);
console.log(result.stats.sourcesUsed); // ['semantic', 'graph', 'history']
```

**Token Budget:**
- Default: 2000 tokens
- Automatically trims results proportionally when budget exceeded
- Preserves at least 1 item per category

**Environment Variables:**
```bash
RETRIEVAL_FUSION_ENABLED=true  # Enable fusion (default: false)
```

## Graph Worker Service

### Purpose
Ingests chat history, extracts entities, and builds knowledge graph relationships.

### Key Files
| File | Responsibility |
|------|----------------|
| `ingestion/chat-parser.ts` | Parse WhatsApp chat exports |
| `ingestion/entity-extractor.ts` | Extract Person, Company, Topic, Event |
| `ingestion/graph-builder.ts` | Build graph nodes and relationships |
| `falkordb/mutations.ts` | Cypher MERGE/CREATE statements |
| `redis/consumer.ts` | Stream consumer for chat ingestion |

### Entity Types
- `Person` - People mentioned in conversations
- `Company` - Organizations and workplaces
- `Topic` - Subjects and themes discussed
- `Event` - Dates and events referenced

### Relationship Types
- `KNOWS` - Person → Person connection
- `WORKS_AT` - Person → Company affiliation
- `MENTIONED` - Message → Entity reference
- `DISCUSSED` - Conversation → Topic link

### Conversation Indexing (Phase 5)

Indexes conversation chunks for semantic retrieval via AutoMem.

**Key Files:**
| File | Responsibility |
|------|----------------|
| `embeddings/conversation-indexer.ts` | Chunking, indexing, deduplication |
| `config/stopwords.ts` | Configurable stopword list |

**Chunking Algorithm:**
```typescript
// Messages are chunked by:
// 1. Time gap (default: 30 minutes)
// 2. Keyword overlap ratio (threshold: 0.2)
// 3. Max chunk size (default: 20 messages)
const chunks = indexer.chunkMessages('contact-id', messages);
```

**Indexing Flow:**
```
Messages → chunkMessages() → generateChunkId() (SHA256 hash)
  → isChunkIndexed() → indexChunk() → AutoMem.store()
  → markChunkIndexed() (Redis)
```

**Deduplication:**
- Chunk IDs are content-based hashes
- Already-indexed chunks are skipped
- Redis key: `INDEXED:conversation:{chunkId}`

**Usage:**
```typescript
const indexer = getConversationIndexer();

// Index all conversations for a contact
const result = await indexer.indexContactConversations('contact-123', messages);
// Returns: { chunksCreated: 5, chunksSkipped: 2, errors: [] }

// Clear indexed status for reindexing
await indexer.clearIndexedStatus('contact-123');
```

**Integration:**
Indexing is triggered automatically in `redis/consumer.ts` when `CONVERSATION_INDEXING_ENABLED=true`.

**Environment Variables:**
```bash
CONVERSATION_INDEXING_ENABLED=true  # Enable auto-indexing
```

## Redis Patterns

### Stream Publishing
```typescript
await redis.xadd('QUEUE:messages', '*', {
  contactId,
  message: JSON.stringify(messageData),
  timestamp: Date.now().toString()
});
```

### Stream Consuming
```typescript
const messages = await redis.xreadgroup(
  'GROUP', 'orchestrator-group',
  'CONSUMER', 'orchestrator-1',
  'COUNT', 10,
  'BLOCK', 5000,
  'STREAMS', 'QUEUE:messages', '>'
);
```

### Pause State
```typescript
// Set pause
await redis.setex(`PAUSE:${contactId}`, 3600, reason);

// Check pause
const isPaused = await redis.exists('PAUSE:ALL') ||
                 await redis.exists(`PAUSE:${contactId}`);
```

## FalkorDB Patterns

### Context Retrieval Query
```cypher
MATCH (c:Contact {id: $contactId})-[:SENT]->(m:Message)
MATCH (m)-[:MENTIONED]->(e)
RETURN e.type, e.name, count(*) as mentions
ORDER BY mentions DESC
LIMIT 10
```

### Entity Merge Pattern
```cypher
MERGE (p:Person {name: $name})
ON CREATE SET p.created = timestamp()
ON MATCH SET p.lastMentioned = timestamp()
RETURN p
```

### Troubleshooting

**"Missing parameters" error from FalkorDB:**
- **Cause**: Using `--params` flag syntax (doesn't work with ioredis)
- **Fix**: Use CYPHER prefix syntax: `CYPHER param1="value1" MATCH ...`
- **Example**: See `frontend/src/app/api/persona/route.ts` queryFalkorDB function

## Error Handling

```typescript
// Structured error logging
import { logger } from './utils/logger';

try {
  await processMessage(message);
} catch (error) {
  logger.error('Message processing failed', {
    error: error instanceof Error ? error.message : 'Unknown error',
    contactId,
    messageId
  });
  // Don't rethrow - log and continue processing queue
}
```

## Testing Services

```bash
# Run tests for specific service
npm run test -w services/gateway
npm run test -w services/orchestrator
npm run test -w services/graph-worker

# Type check
npm run type-check -w services/orchestrator
```

## Health Endpoints

All services expose `/health` for Docker health checks:
- Gateway: `http://localhost:3001/health`
- Orchestrator: `http://localhost:3002/health`
- Graph Worker: `http://localhost:3003/health`
