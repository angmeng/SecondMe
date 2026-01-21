# Redis Schema: SecondMe

**Purpose**: Document all Redis key patterns, data structures, and TTL policies

---

## Key Patterns

### Session Management
```
SESSION:{userId}
Type: Hash
Fields: { token: String (encrypted), connectedAt: Timestamp, expiresAt: Timestamp }
TTL: 24 hours
Example: SESSION:user-1 → { token: "enc_abc...", connectedAt: 1704931200, expiresAt: 1705017600 }
```

### Pause States
```
PAUSE:{contactId}
Type: String (timestamp)
Value: Timestamp when pause will expire
TTL: 60 minutes (default, configurable per pause action)
Example: PAUSE:contact_hash123 → "1704931800000"

PAUSE:ALL
Type: String (timestamp)
Value: Timestamp when global pause was activated
TTL: None (manually cleared)
Example: PAUSE:ALL → "1704931200000"
```

### Rate Limiting
```
COUNTER:{contactId}:msgs
Type: Integer
Value: Message count in current 1-minute window
TTL: 60 seconds
Example: COUNTER:contact_hash123:msgs → 7
```

### Message Queue
```
QUEUE:messages
Type: Stream
Entries: { messageId, contactId, content, timestamp, direction, fromMe }
Max Length: 1000 (trimmed automatically)
TTL per entry: 5 minutes
Example: XADD QUEUE:messages * messageId msg_123 contactId contact_hash content "Hello" ...
```

### Persona Cache
```
CACHE:persona:{personaId}
Type: JSON
Value: { styleGuide, tone, exampleMessages }
TTL: 30 minutes
Example: CACHE:persona:professional → '{"styleGuide":"Use formal...",...}'
```

---

## Pub/Sub Channels

### Pause Events
```
Channel: events:pause
Payload: { contactId, action: "pause" | "resume", expiresAt }
Purpose: Real-time dashboard updates when bot pauses/resumes
```

### Message Events
```
Channel: events:messages
Payload: { messageId, contactId, content, botSent, timestamp }
Purpose: Stream new messages to dashboard for conversation view
```

### QR Code Updates
```
Channel: events:qr
Payload: { qrCode: String (base64), expiresIn: Number }
Purpose: Stream QR code to dashboard during authentication
```

---

## Data Structures

### Message Queue Entry
```typescript
{
  messageId: string;        // "msg_abc123"
  contactId: string;        // "contact_hash456"
  content: string;          // Message text
  timestamp: number;        // Unix timestamp (ms)
  direction: "incoming" | "outgoing";
  fromMe: boolean;          // true if sent by user
}
```

### Session Data
```typescript
{
  token: string;            // Encrypted WhatsApp session token (AES-256)
  connectedAt: number;      // Unix timestamp (ms)
  expiresAt: number;        // Unix timestamp (ms)
}
```

---

## Operation Patterns

### Check Pause State
```typescript
async function isPaused(contactId: string): Promise<boolean> {
  // Check global pause first
  const globalPause = await redis.exists('PAUSE:ALL');
  if (globalPause) return true;

  // Check contact-specific pause
  const contactPause = await redis.get(`PAUSE:${contactId}`);
  if (contactPause) {
    const expiresAt = parseInt(contactPause);
    return Date.now() < expiresAt;
  }

  return false;
}
```

### Rate Limit Check
```typescript
async function checkRateLimit(contactId: string): Promise<boolean> {
  const key = `COUNTER:${contactId}:msgs`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 60); // Set TTL on first increment
  }

  if (count > 10) {
    // Trigger auto-pause
    await redis.setex(`PAUSE:${contactId}`, 3600, Date.now() + 3600000);
    await redis.publish('events:pause', JSON.stringify({
      contactId,
      action: 'pause',
      reason: 'rate_limit',
      expiresAt: Date.now() + 3600000
    }));
    return false;
  }

  return true;
}
```

### Message Queue Consumer
```typescript
async function consumeMessages() {
  const results = await redis.xread(
    'BLOCK', 5000,
    'STREAMS', 'QUEUE:messages', '$'
  );

  for (const [stream, entries] of results) {
    for (const [id, fields] of entries) {
      const message = parseStreamEntry(fields);
      await processMessage(message);
      await redis.xdel('QUEUE:messages', id); // Remove after processing
    }
  }
}
```

---

## Backup & Recovery

- **Session tokens**: Stored in Redis, lost on restart (user must re-authenticate via QR)
- **Pause states**: Ephemeral, reset on restart (conservative: all contacts default to disabled)
- **Message queue**: Drained before shutdown (graceful stop), unprocessed messages logged for manual review
- **Caches**: Rebuilt on demand from FalkorDB

---

## Monitoring

Track these metrics:
- `SESSION:{userId}` existence: Connection health
- `PAUSE:ALL` existence: Global pause status
- `COUNTER:*:msgs` values: Rate limiting activity
- `QUEUE:messages` length: Processing backlog
- Pub/Sub subscriber count: Dashboard connections
