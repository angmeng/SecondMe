# SecondMe MVP - Quick Start Guide

**Ready to test your Personal AI Clone!** 🎉

---

## Prerequisites

✅ **Node.js 24.12.0 LTS** installed
✅ **Docker & Docker Compose** installed
✅ **Anthropic API key** (for Claude)

---

## Setup Steps

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install service dependencies
cd services/gateway && npm install && cd ../..
cd services/orchestrator && npm install && cd ../..
cd services/graph-worker && npm install && cd ../..
cd frontend && npm install && cd ..
```

### 2. Configure Environment Variables

Create `.env` file in the project root:

```bash
# Anthropic API
ANTHROPIC_API_KEY=your_api_key_here

# Redis (default ports)
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=

# FalkorDB
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_PASSWORD=

# Frontend
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001

# Gateway
GATEWAY_PORT=3001

# Orchestrator
ORCHESTRATOR_PORT=3002

# Graph Worker
GRAPH_WORKER_PORT=3003

# Node Environment
NODE_ENV=development
```

### 3. Start Infrastructure (Redis & FalkorDB)

```bash
# Start Redis and FalkorDB via Docker Compose
docker compose up -d redis falkordb

# Verify they're running
docker ps
```

You should see:
- `secondme_redis` on port 6380
- `secondme_falkordb` on port 6379

### 4. Start Backend Services

Open 3 separate terminal windows:

**Terminal 1 - Gateway Service:**
```bash
cd services/gateway
npm run dev
```
Expected output: `Gateway service running on port 3001`

**Terminal 2 - Orchestrator Service:**
```bash
cd services/orchestrator
npm run dev
```
Expected output: `Orchestrator service ready on port 3002`

**Terminal 3 - Graph Worker Service:**
```bash
cd services/graph-worker
npm run dev
```
Expected output: `Graph Worker Service started successfully`

### 5. Start Frontend Dashboard

**Terminal 4 - Frontend:**
```bash
cd frontend
npm run dev
```
Expected output: `Ready on http://localhost:3000`

---

## Testing the MVP

### Step 1: Access Dashboard
Open http://localhost:3000 in your browser

You should see:
- ✅ WhatsApp Status: Disconnected
- ✅ Real-time Updates: Connected (Socket.io)
- ✅ Master Kill Switch

### Step 2: Authenticate WhatsApp
1. Click **"Authenticate WhatsApp"** button
2. Navigate to http://localhost:3000/auth
3. Wait for QR code to appear (should take 10-30 seconds)
4. Open WhatsApp on your phone:
   - **iOS**: Settings → Linked Devices → Link a Device
   - **Android**: Menu → Linked Devices → Link a Device
5. Scan the QR code
6. Wait for "Successfully Connected!" message

### Step 3: Test Bot Response
1. Send a test message to your WhatsApp from another contact
2. Watch the dashboard:
   - Recent activity should show "Message received"
   - Bot should generate a response (10-30 seconds)
   - Recent activity should show "Message sent"
3. Check WhatsApp - you should receive an automated reply!

### Step 4: Test fromMe Auto-Pause
1. **Manually send a message** from your WhatsApp to any contact
2. Watch the dashboard:
   - Recent activity should show "Bot paused (fromMe)"
3. Try sending another message from that contact
4. **Bot should NOT respond** (paused for 60 minutes)

### Step 5: Test Master Kill Switch
1. On the dashboard, click the **Kill Switch toggle**
2. It should turn RED with an X icon
3. Status should show "All bot activity paused"
4. Send a test message from any contact
5. **Bot should NOT respond** (globally paused)
6. Toggle kill switch OFF to resume

### Step 6: Test Contact Management
1. Navigate to http://localhost:3000/contacts
2. You should see placeholder contacts
3. Click the pause icon on any contact
4. Status should change to "Paused"
5. Click play icon to resume

### Step 7: Test Rate Limiting
⚠️ **Caution**: This will auto-pause the bot!

1. Send **11 rapid messages** from a test contact
2. After the 10th message, bot should auto-pause
3. Dashboard should show "Rate limit triggered"
4. Contact status should show "Paused (rate_limit)"

---

## Troubleshooting

### QR Code Not Appearing
- Check Gateway service logs for errors
- Ensure Socket.io is connected (check dashboard status)
- Try refreshing the `/auth` page

### Bot Not Responding
- Check Orchestrator service logs
- Verify Anthropic API key is set correctly
- Check if bot is paused (dashboard or `/contacts`)
- Verify kill switch is OFF

### "Failed to connect to Redis"
- Ensure Docker containers are running: `docker ps`
- Check Redis port: `docker logs secondme_redis`
- Verify `.env` has correct REDIS_HOST and REDIS_PORT

### "ANTHROPIC_API_KEY not set"
- Check `.env` file exists in project root
- Verify API key is valid
- Restart Orchestrator service

### Socket.io Disconnected
- Check Frontend server logs
- Verify Gateway is running on port 3001
- Check browser console for WebSocket errors

---

## Health Check Endpoints

Verify services are running:

```bash
# Gateway health check
curl http://localhost:3001/health

# Expected: {"status":"ok","service":"gateway",...}
```

---

## Logs & Debugging

### View Service Logs
```bash
# Gateway logs
cd services/gateway && npm run dev

# Orchestrator logs
cd services/orchestrator && npm run dev

# Graph Worker logs
cd services/graph-worker && npm run dev

# Frontend logs
cd frontend && npm run dev
```

### View Docker Logs
```bash
# Redis logs
docker logs secondme_redis

# FalkorDB logs
docker logs secondme_falkordb
```

### Check Redis Data
```bash
# Connect to Redis CLI
docker exec -it secondme_redis redis-cli -p 6379

# Check pause states
KEYS PAUSE:*

# Check message queues
XLEN QUEUE:messages
XLEN QUEUE:responses

# Exit Redis CLI
exit
```

---

## Stopping the System

### Stop Services (Terminal)
Press `Ctrl+C` in each terminal window running:
- Gateway
- Orchestrator
- Graph Worker
- Frontend

### Stop Docker Containers
```bash
docker compose down

# Or keep data and just stop:
docker compose stop
```

---

## Next Steps

✅ **MVP is working!** You now have a functional Personal AI Clone.

**Future Enhancements (User Stories 2-4):**
- Persona-based communication styles
- Knowledge graph context retrieval
- Advanced HTS timing with sleep hours
- Enhanced monitoring dashboard

See `IMPLEMENTATION_STATUS.md` for the full roadmap.

---

## Support

- **Issues**: Report bugs at GitHub Issues
- **Documentation**: See `/specs/001-personal-ai-clone/`
- **Architecture**: See `plan.md` for detailed design

---

**Happy Testing! 🚀**
