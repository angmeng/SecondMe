# Backend Services Guidelines

This file provides guidance for Claude Code when working with SecondMe backend services.

## Service Overview

```
services/
├── gateway/           # WhatsApp integration (port 3001)
│   └── src/
│       ├── whatsapp/  # Client, auth, sender, message handler
│       ├── redis/     # Pub/sub, queue client, history store
│       ├── socket/    # Real-time event emitter
│       └── middleware/# Security middleware
├── orchestrator/      # AI workflow (port 3002)
│   └── src/
│       ├── langgraph/ # Workflow, router, graph nodes
│       ├── anthropic/ # Haiku, Sonnet clients, prompts
│       ├── falkordb/  # Cypher queries
│       ├── history/   # Conversation history RAG (keyword chunking)
│       ├── config/    # Feature configurations
│       ├── hts/       # Human typing simulation
│       └── redis/     # Consumer, persona cache
└── graph-worker/      # Knowledge ingestion (port 3003)
    └── src/
        ├── ingestion/ # Parser, extractor, graph builder
        ├── falkordb/  # Mutations
        └── redis/     # Consumer
```

## Gateway Service

### Purpose
Bridges WhatsApp Web.js with the microservices architecture via Redis Streams.

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

## Orchestrator Service

### Purpose
Orchestrates AI workflow using LangGraph, manages Claude API calls, and retrieves graph context.

### Key Files
| File | Responsibility |
|------|----------------|
| `langgraph/workflow.ts` | Main StateGraph workflow definition |
| `langgraph/router-node.ts` | Phatic vs substantive routing |
| `langgraph/graph-node.ts` | FalkorDB context retrieval node |
| `anthropic/haiku-client.ts` | Claude Haiku for classification |
| `anthropic/sonnet-client.ts` | Claude Sonnet with prompt caching |
| `anthropic/prompt-templates.ts` | System prompts, persona templates |
| `history/history-cache.ts` | In-memory LRU cache for history |
| `history/keyword-chunker.ts` | Keyword extraction and topic chunking |
| `config/history-config.ts` | History feature configuration |
| `falkordb/queries.ts` | Cypher query builders |
| `hts/delay-calculator.ts` | Typing delay calculation |
| `hts/sleep-hours.ts` | Sleep hours enforcement |

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
