# QuickStart Guide: SecondMe Personal AI Clone

**Last Updated**: 2026-01-10
**Target Audience**: Developers setting up local development environment

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js 24.12.0 LTS** ([Download](https://nodejs.org)) - Required: v24.x for long-term support through April 2028
- **Docker Desktop 20+** ([Download](https://www.docker.com/products/docker-desktop))
- **Anthropic API Key** ([Get one](https://console.anthropic.com))
- **Git** (for cloning repository)
- **Code editor** (VS Code recommended)

### Verify Installations

After installing prerequisites, verify versions:

```bash
# Check Node.js version (should be v24.12.0 or later)
node --version

# Check npm version (should be v10.x or later)
npm --version

# Check Docker version (should be 20.x or later)
docker --version

# Check Docker Compose version (should be v5.x or later)
docker compose version
```

**Expected output**:
```
v24.12.0 (or later)
10.x.x (or later)
Docker version 20.x.x or later
Docker Compose version v5.0.1 or later
```

---

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/SecondMe.git
cd SecondMe
```

### 2. Install Dependencies

```bash
# Install workspace dependencies
npm install

# Install service-specific dependencies
cd services/gateway && npm install && cd ../..
cd services/orchestrator && npm install && cd ../..
cd services/graph-worker && npm install && cd ../..
cd frontend && npm install && cd ..
```

### 3. Configure Environment Variables

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env
```

Required environment variables:
```env
# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=

# FalkorDB Configuration
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_PASSWORD=

# User Configuration
USER_PHONE_NUMBER=+1234567890
DEFAULT_PAUSE_DURATION=3600  # seconds (60 minutes)
SLEEP_HOURS_START=23:00:00
SLEEP_HOURS_END=07:00:00

# Development Settings
NODE_ENV=development
LOG_LEVEL=debug
```

### 4. Start Infrastructure Services

```bash
# Start Redis and FalkorDB via Docker Compose
docker-compose up -d redis falkordb

# Verify services are running
docker ps
```

Expected output:
```
CONTAINER ID   IMAGE              STATUS          PORTS
abc123...      redis:7-alpine     Up 10 seconds   0.0.0.0:6380->6379/tcp
def456...      falkordb/falkordb  Up 10 seconds   0.0.0.0:6379->6379/tcp
```

### 5. Initialize Graph Database

```bash
# Run schema initialization
docker exec -i $(docker ps -qf "name=falkordb") redis-cli < specs/001-personal-ai-clone/contracts/graph-schema.cypher
```

Verify schema:
```bash
# Connect to FalkorDB
docker exec -it $(docker ps -qf "name=falkordb") redis-cli

# Run query
GRAPH.QUERY knowledge_graph "MATCH (u:User) RETURN u"

# Expected: User node with id='user-1'
```

### 6. Start Backend Services

Open three separate terminal windows:

**Terminal 1 - WhatsApp Gateway:**
```bash
cd services/gateway
npm run dev
```

Expected output:
```
[Gateway] Server running on port 3001
[Gateway] Waiting for WhatsApp authentication...
```

**Terminal 2 - AI Orchestrator:**
```bash
cd services/orchestrator
npm run dev
```

Expected output:
```
[Orchestrator] Server running on port 3002
[Orchestrator] Connected to Redis
[Orchestrator] Connected to FalkorDB
[Orchestrator] Listening for messages...
```

**Terminal 3 - Graph Worker:**
```bash
cd services/graph-worker
npm run dev
```

Expected output:
```
[Graph Worker] Server running on port 3003
[Graph Worker] Connected to FalkorDB
[Graph Worker] Ready for ingestion tasks
```

### 7. Start Frontend Dashboard

```bash
cd frontend
npm run dev
```

Expected output:
```
> Next.js 16.0.0
> Local:    http://localhost:3000
> Ready in 2.1s
```

---

## First-Time Setup

### 8. Authenticate WhatsApp

1. Open browser to `http://localhost:3000`
2. Navigate to "Auth" page
3. Scan QR code with WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Tap "Settings" > "Linked Devices"
   - Tap "Link a Device"
   - Scan the QR code displayed in dashboard

Expected result: Dashboard shows "Connected ✅"

### 9. Configure Your First Persona

1. Navigate to "Persona" page
2. Edit the "Professional Colleague" persona:
   - Update style guide with your communication patterns
   - Add 3-5 example messages in your style
   - Save changes

### 10. Enable Bot for Test Contact

1. Navigate to "Contacts" page
2. Find a test contact (or add one in WhatsApp)
3. Toggle bot to "Enabled" for that contact
4. Verify status shows "Active"

### 11. Send Test Message

From a separate WhatsApp account (or ask a friend):
1. Send a message to your WhatsApp number
2. Watch the dashboard "Conversation" view for real-time updates
3. Bot should respond after 3-8 seconds (including typing simulation)

**Success Criteria**:
- Message appears in dashboard
- Bot status remains "Active"
- Response is sent with typing indicator
- Response matches your persona style

---

## Development Workflow

### Running Tests

```bash
# Unit tests (all services)
npm test

# Contract tests
npm run test:contract

# Integration tests
npm run test:integration

# E2E tests (requires services running)
npm run test:e2e
```

### Code Quality Checks

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Format
npm run format
```

### Viewing Logs

**Service logs:**
```bash
# Gateway logs
docker logs -f secondme_gateway

# Orchestrator logs
docker logs -f secondme_orchestrator

# FalkorDB logs
docker logs -f $(docker ps -qf "name=falkordb")
```

**Audit logs:**
```bash
# Message metadata logs
tail -f logs/messages.jsonl

# Each line is a JSON object with metadata (no message content)
```

### Database Inspection

**Redis:**
```bash
# Connect to Redis CLI
docker exec -it $(docker ps -qf "name=redis") redis-cli -p 6380

# View keys
KEYS *

# Check pause state
GET PAUSE:contact_hash123

# Monitor pub/sub
SUBSCRIBE events:messages
```

**FalkorDB:**
```bash
# Connect to FalkorDB CLI
docker exec -it $(docker ps -qf "name=falkordb") redis-cli

# Run Cypher query
GRAPH.QUERY knowledge_graph "MATCH (c:Contact) RETURN c LIMIT 10"

# View graph statistics
GRAPH.QUERY knowledge_graph "CALL db.labels()"
```

---

## Troubleshooting

### Issue: WhatsApp won't connect

**Symptom**: QR code doesn't appear or shows error

**Solutions**:
1. Check gateway logs: `docker logs secondme_gateway`
2. Ensure WhatsApp isn't already connected on another device
3. Clear session data: `rm -rf services/gateway/.wwebjs_auth`
4. Restart gateway service

### Issue: Bot doesn't respond

**Symptom**: Messages appear in dashboard but no response sent

**Checklist**:
1. Verify bot is enabled for contact: Check Redis `GET PAUSE:contact_hash`
2. Check Anthropic API key: `echo $ANTHROPIC_API_KEY`
3. Review orchestrator logs for errors
4. Verify rate limiting isn't triggered: `GET COUNTER:contact_hash:msgs`

### Issue: Graph queries return empty

**Symptom**: Contact context not retrieved, responses lack personalization

**Solutions**:
1. Verify graph schema initialized: Run test query `MATCH (u:User) RETURN u`
2. Check graph worker logs for ingestion errors
3. Manually add test entities via Cypher console
4. Verify FalkorDB connection in orchestrator logs

### Issue: Dashboard not updating in real-time

**Symptom**: Messages don't appear until page refresh

**Solutions**:
1. Check Socket.io connection: Open browser DevTools > Network > WS
2. Verify Redis pub/sub working: `PUBLISH events:messages '{"test": true}'`
3. Restart frontend: `cd frontend && npm run dev`

---

## Production Deployment

For production deployment guide, see:
- `docs/deployment.md` (VPS setup)
- `docs/security.md` (Encryption, HTTPS, secrets management)
- `docs/monitoring.md` (Logging, metrics, alerts)

**Key differences from development**:
- Use `docker-compose.prod.yml` (includes Caddy reverse proxy for HTTPS)
- Set `NODE_ENV=production`
- Enable disk encryption for FalkorDB volume
- Use strong Redis passwords
- Configure firewall rules (ports 3000, 3001, 3002 internal only)

---

## Next Steps

Once your local environment is running:

1. **Import Chat History**: Upload WhatsApp export to build knowledge graph
2. **Customize Personas**: Create personas for different relationship types
3. **Test with Real Contacts**: Enable bot for low-stakes contacts first
4. **Monitor Behavior**: Watch for HTS timing, rate limiting triggers
5. **Review Constitution**: Familiarize yourself with `.specify/memory/constitution.md`

**Resources**:
- Technical Specification: `specs/001-personal-ai-clone/spec.md`
- Implementation Plan: `specs/001-personal-ai-clone/plan.md`
- Data Model: `specs/001-personal-ai-clone/data-model.md`
- API Contracts: `specs/001-personal-ai-clone/contracts/`

---

## Support

For issues or questions:
- GitHub Issues: `https://github.com/yourusername/SecondMe/issues`
- Documentation: `docs/`
- Constitution: `.specify/memory/constitution.md`

Happy building! 🚀
