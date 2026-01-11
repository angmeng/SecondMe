# Data Model: SecondMe Personal AI Clone

**Date**: 2026-01-10
**Phase**: 1 - Design & Contracts
**Purpose**: Define entity schemas, storage patterns, and state transitions

---

## Storage Architecture

The SecondMe system uses a hybrid storage approach:

1. **FalkorDB** (Graph Database): Long-term knowledge graph (entities, relationships, embeddings)
2. **Redis** (State & Queue): Ephemeral state (sessions, pause flags, message queues, caches)
3. **File System**: Audit logs (metadata only, no message content per privacy requirements)

---

## Entity Definitions

### 1. User Entity

**Storage**: FalkorDB (User node) + Redis (session state)

**Graph Node Schema**:
```cypher
(:User {
  id: String,              # Unique identifier (e.g., "user-1")
  phoneNumber: String,      # WhatsApp phone number (+1234567890)
  defaultPersona: String,   # ID of default persona
  sleepHoursStart: String,  # ISO time (e.g., "23:00:00")
  sleepHoursEnd: String,    # ISO time (e.g., "07:00:00")
  createdAt: DateTime,
  updatedAt: DateTime
})
```

**Redis Keys**:
- `SESSION:{userId}` → JSON { token: encrypted_session, connectedAt: timestamp } (TTL: 24h)
- `PAUSE:ALL` → Timestamp of global pause activation (no TTL, manually cleared)

**Relationships**:
- `(:User)-[:HAS_CONTACT]->(:Contact)` - User's WhatsApp contacts
- `(:User)-[:HAS_PERSONA]->(:Persona)` - User's communication styles
- `(:User)-[:ATTENDED]->(:Event)` - Events user participated in

---

### 2. Contact Entity

**Storage**: FalkorDB (Contact node) + Redis (pause state, message counters)

**Graph Node Schema**:
```cypher
(:Contact {
  id: String,               # Unique identifier (phone number hash)
  phoneNumber: String,      # Full phone (+1234567890)
  name: String,             # Contact name from WhatsApp
  relationshipType: String, # "colleague" | "family" | "friend" | "acquaintance"
  botEnabled: Boolean,      # Bot activation status
  assignedPersona: String,  # ID of persona for this contact (nullable)
  lastInteraction: DateTime,
  createdAt: DateTime,
  updatedAt: DateTime
})
```

**Redis Keys**:
- `PAUSE:{contactId}` → Timestamp when pause expires (TTL: 60 minutes default, configurable)
- `COUNTER:{contactId}:msgs` → Integer count (TTL: 60 seconds for sliding window)

**Relationships**:
- `(:Contact)-[:KNOWS]->(:Person)` - People this contact knows
- `(:Contact)-[:MENTIONED]->(:Topic)` - Topics discussed with contact
- `(:Contact)-[:DISCUSSED]->(:Event)` - Events mentioned in conversations

---

### 3. Message Entity

**Storage**: Redis Streams (transient queue) + File logs (metadata only)

**Redis Stream Schema**:
```json
{
  "messageId": "msg_abc123",
  "contactId": "contact_hash",
  "content": "How's it going?",
  "timestamp": 1704931200000,
  "direction": "incoming",
  "fromMe": false
}
```

**Log File Schema** (JSON lines, one per message):
```json
{
  "messageId": "msg_abc123",
  "contactId": "contact_hash",
  "timestamp": 1704931200000,
  "direction": "outgoing",
  "botSent": true,
  "model": "claude-sonnet-4.5",
  "tokensUsed": 523,
  "typingDelayMs": 4500,
  "wordCount": 25
}
```

**Note**: Message content is NEVER logged (PII protection per constitution).

---

### 4. Persona Entity

**Storage**: FalkorDB (Persona node) + Redis (cached persona guides)

**Graph Node Schema**:
```cypher
(:Persona {
  id: String,               # Unique identifier (e.g., "persona-professional")
  name: String,             # User-friendly name ("Professional Colleague")
  styleGuide: String,       # Large text block with style examples (5-10KB)
  tone: String,             # "formal" | "casual" | "friendly" | "concise"
  exampleMessages: [String], # Array of example messages in this style
  applicableTo: [String],   # Relationship types this persona applies to
  createdAt: DateTime,
  updatedAt: DateTime
})
```

**Redis Keys**:
- `CACHE:persona:{personaId}` → JSON { styleGuide, tone, examples } (TTL: 30 minutes)

**Validation Rules**:
- `styleGuide` max length: 10KB (to stay within prompt caching limits)
- `name` required, unique per user
- At least one `exampleMessage` required

---

### 5. Knowledge Graph Entities

#### 5.1 Person

**Graph Node Schema**:
```cypher
(:Person {
  id: String,               # Unique identifier
  name: String,             # Full name
  occupation: String,       # Job title (nullable)
  location: String,         # City/country (nullable)
  notes: String,            # Freeform notes extracted from conversations
  embedding: vecf32[1536], # Claude embeddings for semantic search
  createdAt: DateTime,
  lastMentioned: DateTime
})
```

**Relationships**:
- `(:Person)-[:WORKS_AT]->(:Company)`
- `(:Person)-[:LIVES_IN]->(:Location)`
- `(:Person)-[:KNOWS]->(:Person)` - Social connections

#### 5.2 Company

**Graph Node Schema**:
```cypher
(:Company {
  id: String,
  name: String,
  industry: String,         # "Tech" | "Finance" | "Healthcare" etc.
  notes: String,
  embedding: vecf32[1536],
  createdAt: DateTime,
  lastMentioned: DateTime
})
```

#### 5.3 Event

**Graph Node Schema**:
```cypher
(:Event {
  id: String,
  name: String,             # "Trip to Paris" | "Project Launch" etc.
  date: DateTime,           # When event occurred/will occur
  description: String,
  embedding: vecf32[1536],
  createdAt: DateTime,
  lastMentioned: DateTime
})
```

**Relationships**:
- `(:Person)-[:ATTENDED]->(:Event)`
- `(:Event)-[:LOCATED_AT]->(:Location)`

#### 5.4 Topic

**Graph Node Schema**:
```cypher
(:Topic {
  id: String,
  name: String,             # "Machine Learning" | "Travel" | "Cooking"
  category: String,         # High-level grouping
  embedding: vecf32[1536],
  createdAt: DateTime,
  lastMentioned: DateTime
})
```

**Relationships**:
- `(:Contact)-[:MENTIONED]->(:Topic)` - With property { times: Integer, lastMentioned: DateTime }

---

## State Transitions

### Contact Bot State Machine

```
[Disabled] ──(user enable)──> [Enabled]
                                  │
                                  │ (user sends message OR
                                  │  rate limit exceeded OR
                                  │  global pause)
                                  ↓
                              [Paused]
                                  │
                                  │ (TTL expires OR
                                  │  user resume)
                                  ↓
                              [Enabled]
```

**State Rules**:
1. Default state: `Disabled` (opt-in required)
2. `Disabled → Enabled`: User action via dashboard
3. `Enabled → Paused`: Automatic triggers (fromMe message, rate limit) OR manual pause
4. `Paused → Enabled`: TTL expiry (auto-resume) OR manual resume
5. Global pause (`PAUSE:ALL`): Overrides all contact states, returns to previous state when cleared

### Session State Machine

```
[Disconnected] ──(QR scan)──> [Connected]
                                  │
                                  │ (24h expiry OR
                                  │  WhatsApp disconnect)
                                  ↓
                             [Expired]
                                  │
                                  │ (new QR scan)
                                  ↓
                             [Connected]
```

**State Rules**:
1. Initial state: `Disconnected`
2. `Disconnected → Connected`: Successful QR code authentication
3. `Connected → Expired`: 24-hour inactivity OR WhatsApp protocol disconnect
4. `Expired → Connected`: Re-authentication via new QR code

---

## Validation Rules

### Contact Entity
- `phoneNumber`: E.164 format (+1234567890), validated on creation
- `relationshipType`: Must be one of predefined types (enum)
- `botEnabled`: Cannot be `true` if global pause is active

### Message Entity
- `content`: Max length 4096 characters (WhatsApp limit)
- `timestamp`: Must be within last 7 days (reject old messages)
- `direction`: Either "incoming" or "outgoing"

### Persona Entity
- `styleGuide`: 100-10000 characters
- `exampleMessages`: At least 3, max 20 examples
- `applicableTo`: Must reference valid relationship types

### Knowledge Graph Entities
- `name`: Required for all entities, 1-100 characters
- `embedding`: Optional, but required for semantic search functionality
- Duplicate detection: Entities with same `name` + `type` merged (deduplication)

---

## Data Retention & Privacy

Per constitution requirements:

1. **Message Content**: NEVER stored permanently
   - Transient in Redis queue (TTL: 5 minutes)
   - Not written to logs

2. **Session Tokens**: Encrypted at rest (AES-256)
   - Stored in Redis with 24h TTL
   - Automatically purged on expiry

3. **Graph Data**: Encrypted at rest (LUKS encryption on FalkorDB volume)
   - Requires authentication for all connections
   - Backup excluded from message content

4. **Logs**: Metadata only
   - No message text
   - Contact IDs hashed
   - 30-day retention, then purged

---

## Query Patterns

### Frequently Used Queries

**1. Get Contact Context** (for response generation):
```cypher
MATCH (c:Contact {id: $contactId})-[:KNOWS]->(p:Person)-[:WORKS_AT]->(comp:Company)
RETURN p.name, p.occupation, comp.name, comp.industry
UNION
MATCH (c:Contact {id: $contactId})-[:MENTIONED]->(t:Topic)
RETURN t.name, t.category
ORDER BY t.lastMentioned DESC
LIMIT 10
```

**2. Semantic Search** (find related entities):
```cypher
MATCH (t:Topic)
WHERE vecf32.cosine(t.embedding, $queryEmbedding) > 0.85
RETURN t.name, t.category
LIMIT 5
```

**3. Get User Preferences**:
```cypher
MATCH (u:User {id: $userId})-[:HAS_PERSONA]->(p:Persona)
RETURN p.id, p.name, p.styleGuide, p.applicableTo
```

---

## Migration Strategy

**Initial Setup**:
1. Deploy FalkorDB with init-schema.cypher (creates constraints, indexes)
2. Create default User node
3. Seed default personas (professional, casual, friendly)

**Chat History Import**:
1. User uploads WhatsApp export (.txt or .zip)
2. Graph worker parses messages
3. Entity extraction via Claude Sonnet (structured output mode)
4. Batch insert entities/relationships into FalkorDB
5. Background vectorization of entities for semantic search

**Schema Evolution**:
- All schema changes via migration scripts (versioned)
- Backward compatible additions only (no breaking changes to existing entities)
- New entity types added as needed without disrupting existing graph

---

## Next Steps

Data model complete. Proceed to:
1. ✅ `data-model.md` (this file)
2. ⏳ `contracts/` - API specifications
3. ⏳ `quickstart.md` - Developer setup guide
