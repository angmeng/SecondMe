# SecondMe Deployment Checklist

**Version**: 1.0.0
**Last Updated**: 2026-01-20
**Status**: Production Ready

---

## Pre-Deployment Checklist

### 1. Environment Requirements

- [ ] **Node.js v24.12.0+** installed
  ```bash
  node --version  # Should output v24.12.0 or higher
  ```

- [ ] **npm v10+** installed
  ```bash
  npm --version  # Should output 10.x or higher
  ```

- [ ] **Docker v24+** installed and running
  ```bash
  docker --version  # Should output 24.x or higher
  docker info  # Should not show errors
  ```

- [ ] **Docker Compose v2.20+** installed
  ```bash
  docker compose version  # Should output v2.20 or higher
  ```

---

### 2. Configuration Files

- [ ] **Environment file** configured
  ```bash
  cp .env.example .env
  # Edit .env with production values
  ```

- [ ] **Required environment variables** set:
  | Variable | Description | Required |
  |----------|-------------|----------|
  | `ANTHROPIC_API_KEY` | Claude API key | Yes |
  | `VOYAGE_API_KEY` | Voyage AI embedding API key | For Semantic RAG |
  | `REDIS_HOST` | Redis server host | Yes |
  | `REDIS_PORT` | Redis server port | Yes |
  | `REDIS_PASSWORD` | Redis password | Production |
  | `FALKORDB_HOST` | FalkorDB server host | Yes |
  | `FALKORDB_PORT` | FalkorDB server port | Yes |
  | `FALKORDB_PASSWORD` | FalkorDB password | Production |
  | `NODE_ENV` | Environment (production) | Yes |
  | `SEMANTIC_RAG_ENABLED` | Enable semantic retrieval | Optional |

- [ ] **Docker Compose** file reviewed
  ```bash
  docker compose config  # Validates docker-compose.yml
  ```

- [ ] **Caddy configuration** for HTTPS (if using reverse proxy)
  ```bash
  cat infra/caddy/Caddyfile  # Review domain and cert settings
  ```

---

### 3. Security Verification

- [ ] **No secrets in code**
  ```bash
  grep -r "sk-ant-" . --include="*.ts" --include="*.js" | grep -v node_modules
  # Should return empty
  ```

- [ ] **Environment file not committed**
  ```bash
  git status | grep ".env"
  # .env should NOT appear in git tracked files
  ```

- [ ] **.gitignore configured**
  ```bash
  grep ".env" .gitignore  # Should exist
  grep "node_modules" .gitignore  # Should exist
  grep ".wwebjs_auth" .gitignore  # Should exist (WhatsApp session)
  ```

- [ ] **Strong passwords** configured for:
  - [ ] Redis (`REDIS_PASSWORD`)
  - [ ] FalkorDB (`FALKORDB_PASSWORD`)

- [ ] **CORS configuration** reviewed
  ```bash
  grep -r "CORS" services/gateway/src/
  # Verify allowed origins
  ```

---

### 4. Infrastructure Startup

- [ ] **Start Docker services**
  ```bash
  docker compose up -d redis falkordb
  docker compose ps  # All should show "Up" status
  ```

- [ ] **Verify Redis connectivity**
  ```bash
  docker exec secondme_redis redis-cli -p 6379 PING
  # Should return: PONG
  ```

- [ ] **Verify FalkorDB connectivity**
  ```bash
  docker exec secondme_falkordb redis-cli -a $FALKORDB_PASSWORD \
    GRAPH.QUERY knowledge_graph "RETURN 1"
  # Should return: 1
  ```

- [ ] **Initialize database schema** (if fresh deployment)
  ```bash
  docker exec -i secondme_falkordb redis-cli -a $FALKORDB_PASSWORD \
    < infra/falkordb/init-schema.cypher
  ```

- [ ] **Verify schema loaded**
  ```bash
  docker exec secondme_falkordb redis-cli -a $FALKORDB_PASSWORD \
    GRAPH.QUERY knowledge_graph "MATCH (u:User) RETURN u.id"
  # Should return: user-1
  ```

---

### 5. Application Build

- [ ] **Install dependencies**
  ```bash
  npm install
  ```

- [ ] **Build services** (for production)
  ```bash
  npm run build -w services/gateway
  npm run build -w services/orchestrator
  npm run build -w services/graph-worker
  npm run build -w frontend
  ```

- [ ] **Type check** (optional but recommended)
  ```bash
  npm run type-check
  # Note: Some pre-existing warnings in gateway may appear
  ```

---

### 6. Service Startup

Start services in order:

- [ ] **1. Gateway Service**
  ```bash
  npm run start -w services/gateway
  # Or: docker compose up -d gateway
  ```
  Verify: `curl http://localhost:3001/health`

- [ ] **2. Orchestrator Service**
  ```bash
  npm run start -w services/orchestrator
  # Or: docker compose up -d orchestrator
  ```
  Verify: `curl http://localhost:3002/health`

- [ ] **3. Graph Worker Service**
  ```bash
  npm run start -w services/graph-worker
  # Or: docker compose up -d graph-worker
  ```
  Verify: `curl http://localhost:3003/health`

- [ ] **4. Frontend Dashboard**
  ```bash
  npm run start -w frontend
  # Or: docker compose up -d frontend
  ```
  Verify: `curl http://localhost:3000/api/health`

---

### 7. Health Checks

- [ ] **All services responding**
  ```bash
  curl -s http://localhost:3001/health | jq .status  # gateway
  curl -s http://localhost:3002/health | jq .status  # orchestrator
  curl -s http://localhost:3003/health | jq .status  # graph-worker
  curl -s http://localhost:3000/api/health | jq .status  # frontend
  ```

- [ ] **Docker health checks passing**
  ```bash
  docker compose ps
  # All services should show "(healthy)"
  ```

---

### 8. Functional Verification

- [ ] **Dashboard accessible**
  - Open http://localhost:3000 in browser
  - Should see SecondMe dashboard

- [ ] **WhatsApp authentication ready**
  - Navigate to /auth page
  - QR code should be displayable

- [ ] **Kill switch functional**
  - Toggle kill switch on dashboard
  - Verify Redis key: `redis-cli GET PAUSE:ALL`

- [ ] **API endpoints responding**
  ```bash
  curl -s http://localhost:3000/api/contacts
  curl -s http://localhost:3000/api/persona
  curl -s http://localhost:3000/api/metrics
  ```

---

### 9. Semantic RAG Verification (if enabled)

- [ ] **VOYAGE_API_KEY** configured
  ```bash
  echo $VOYAGE_API_KEY | head -c 10  # Should show key prefix
  ```

- [ ] **SEMANTIC_RAG_ENABLED** set to true
  ```bash
  grep SEMANTIC_RAG_ENABLED .env  # Should be true
  ```

- [ ] **Vector indexes exist**
  ```bash
  docker exec secondme_falkordb redis-cli -a $FALKORDB_PASSWORD \
    GRAPH.QUERY knowledge_graph "CALL db.indexes()"
  ```

- [ ] **Embedding client configured**
  - Check logs for: `[Voyage Client]` entries

---

### 10. Backup Verification

- [ ] **Backup script exists**
  ```bash
  ls scripts/backup-falkordb.sh  # Should exist
  ```

- [ ] **Test backup creation**
  ```bash
  ./scripts/backup-falkordb.sh
  ls backups/  # Should show new backup file
  ```

---

### 11. Monitoring Setup

- [ ] **Log directories exist**
  ```bash
  mkdir -p logs
  ls logs/  # Should be writable
  ```

- [ ] **Metrics endpoint working**
  ```bash
  curl -s http://localhost:3000/api/metrics | jq .
  ```

- [ ] **Docker logs accessible**
  ```bash
  docker compose logs --tail=10
  ```

---

### 12. Production Hardening

- [ ] **NODE_ENV=production** set
  ```bash
  grep NODE_ENV .env  # Should be production
  ```

- [ ] **Debug logging disabled** (optional)
  ```bash
  grep LOG_LEVEL .env  # Should be info or warn
  ```

- [ ] **Rate limiting configured**
  - Check gateway middleware

- [ ] **HTTPS configured** (for public deployment)
  - Caddy with valid SSL certificate
  - Or: nginx/traefik with Let's Encrypt

---

## Post-Deployment Verification

### Smoke Tests

Run these tests after deployment:

```bash
# 1. Health check all services
for port in 3000 3001 3002 3003; do
  echo "Port $port: $(curl -s http://localhost:$port/health | jq -r .status)"
done

# 2. Check Docker container health
docker compose ps --format "table {{.Name}}\t{{.Status}}"

# 3. Verify database connectivity
docker exec secondme_redis redis-cli PING
docker exec secondme_falkordb redis-cli -a $FALKORDB_PASSWORD GRAPH.QUERY knowledge_graph "RETURN 1"

# 4. Check API functionality
curl -s http://localhost:3000/api/contacts | jq length
curl -s http://localhost:3000/api/persona | jq length
```

### Rollback Procedure

If deployment fails:

1. **Stop new services**
   ```bash
   docker compose down
   ```

2. **Restore previous version**
   ```bash
   git checkout <previous-tag>
   npm install
   ```

3. **Restart with previous config**
   ```bash
   docker compose up -d
   ```

4. **Restore database** (if needed)
   ```bash
   ./scripts/restore-falkordb.sh backups/<backup-file>
   ```

---

## Deployment Environments

### Development
```bash
NODE_ENV=development
docker compose up -d redis falkordb
npm run dev
```

### Staging
```bash
NODE_ENV=staging
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```

### Production
```bash
NODE_ENV=production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Quick Reference

### Service Ports

| Service | Port | Health Endpoint |
|---------|------|-----------------|
| Frontend | 3000 | /api/health |
| Gateway | 3001 | /health |
| Orchestrator | 3002 | /health |
| Graph Worker | 3003 | /health |
| Redis | 6380 | PING command |
| FalkorDB | 6379 | GRAPH.QUERY |

### Key Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f [service]

# Restart service
docker compose restart [service]

# Stop all services
docker compose down

# Full rebuild
docker compose build --no-cache
docker compose up -d
```

### Emergency Contacts

- **Technical Lead**: [your-email]
- **On-Call**: [on-call-rotation]
- **Anthropic Support**: support@anthropic.com

---

## Checklist Summary

| Phase | Items | Required |
|-------|-------|----------|
| Environment | 4 | All |
| Configuration | 4 | All |
| Security | 5 | All |
| Infrastructure | 6 | All |
| Application | 3 | All |
| Service Startup | 4 | All |
| Health Checks | 2 | All |
| Functional | 4 | All |
| Semantic RAG | 4 | If enabled |
| Backup | 2 | Recommended |
| Monitoring | 3 | Recommended |
| Hardening | 4 | Production |

**Total**: 45 items (33 required, 12 recommended)

---

*Generated by SecondMe Integration Check - 2026-01-20*
