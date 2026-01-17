# SecondMe Troubleshooting Guide

Common issues and their solutions.

## Table of Contents

1. [Service Issues](#service-issues)
2. [WhatsApp Connection](#whatsapp-connection)
3. [Database Issues](#database-issues)
4. [Performance Problems](#performance-problems)
5. [Frontend Issues](#frontend-issues)
6. [Docker Issues](#docker-issues)
7. [Logs and Debugging](#logs-and-debugging)

---

## Service Issues

### Services Won't Start

**Symptoms**: Services fail to start or crash immediately

**Solutions**:

1. **Check dependencies are running**:
   ```bash
   docker compose ps
   # Ensure redis and falkordb show as "healthy"
   ```

2. **Check environment variables**:
   ```bash
   # Verify .env file exists and has required variables
   cat .env | grep -E "(ANTHROPIC_API_KEY|REDIS_|FALKORDB_)"
   ```

3. **Check port conflicts**:
   ```bash
   lsof -i :3000,3001,3002,3003,6379,6380
   ```

4. **View service logs**:
   ```bash
   docker compose logs -f gateway
   docker compose logs -f orchestrator
   ```

### Service Health Check Failing

**Symptoms**: `docker compose ps` shows service as "unhealthy"

**Solutions**:

1. **Check service-specific health endpoint**:
   ```bash
   curl http://localhost:3001/health
   ```

2. **Increase health check timeout** in `docker-compose.yml`:
   ```yaml
   healthcheck:
     timeout: 30s
     start_period: 60s
   ```

3. **Check if service is overwhelmed** (CPU/memory):
   ```bash
   docker stats
   ```

---

## WhatsApp Connection

### QR Code Not Appearing

**Symptoms**: No QR code shown when starting the Gateway service

**Solutions**:

1. **Check WhatsApp Web.js session**:
   ```bash
   ls -la services/gateway/.wwebjs_auth/
   # If corrupted, delete and restart:
   rm -rf services/gateway/.wwebjs_auth/
   ```

2. **Check Chromium installation**:
   ```bash
   docker compose exec gateway which chromium
   ```

3. **View Gateway logs** for errors:
   ```bash
   docker compose logs gateway | grep -i "qr\|auth\|chrome"
   ```

### Session Expires Frequently

**Symptoms**: WhatsApp disconnects and requires re-authentication

**Solutions**:

1. **Check session persistence volume**:
   ```yaml
   # In docker-compose.yml
   volumes:
     - ./services/gateway/.wwebjs_auth:/app/.wwebjs_auth
   ```

2. **Avoid multiple simultaneous WhatsApp Web sessions** - only use SecondMe

3. **Check for WhatsApp Web updates** that may invalidate sessions

### Messages Not Sending

**Symptoms**: Bot receives messages but doesn't respond

**Solutions**:

1. **Check if contact is paused**:
   ```bash
   redis-cli -p 6380 KEYS "PAUSE:*"
   ```

2. **Check if in sleep hours**:
   ```bash
   curl http://localhost:3000/api/settings/sleep-hours
   ```

3. **Verify workflow processing**:
   ```bash
   docker compose logs orchestrator | grep "workflow"
   ```

4. **Check rate limiting**:
   ```bash
   docker compose logs gateway | grep "rate"
   ```

---

## Database Issues

### Redis Connection Failed

**Symptoms**: `Error: Redis connection refused`

**Solutions**:

1. **Verify Redis is running**:
   ```bash
   docker compose ps redis
   redis-cli -p 6380 ping
   ```

2. **Check Redis configuration**:
   ```bash
   cat infra/redis/redis.conf | grep -E "bind|port|requirepass"
   ```

3. **Check Redis memory**:
   ```bash
   redis-cli -p 6380 INFO memory
   ```

### FalkorDB Connection Failed

**Symptoms**: `Error: FalkorDB connection refused`

**Solutions**:

1. **Verify FalkorDB is running**:
   ```bash
   docker compose ps falkordb
   redis-cli -p 6379 -a $FALKORDB_PASSWORD ping
   ```

2. **Check authentication**:
   ```bash
   # Password should match .env
   echo $FALKORDB_PASSWORD
   ```

3. **Check FalkorDB logs**:
   ```bash
   docker compose logs falkordb
   ```

### Graph Queries Slow

**Symptoms**: Persona context retrieval takes too long

**Solutions**:

1. **Check graph size**:
   ```bash
   redis-cli -p 6379 -a $FALKORDB_PASSWORD GRAPH.QUERY persona "MATCH (n) RETURN count(n)"
   ```

2. **Add indexes for frequently queried properties**:
   ```cypher
   CREATE INDEX ON :Contact(id)
   CREATE INDEX ON :Message(timestamp)
   ```

3. **Consider archiving old data**

---

## Performance Problems

### High CPU Usage

**Symptoms**: Services consuming excessive CPU

**Solutions**:

1. **Identify the culprit**:
   ```bash
   docker stats
   ```

2. **Check for infinite loops in logs**:
   ```bash
   docker compose logs --tail 1000 orchestrator | grep -i "error\|loop"
   ```

3. **Reduce polling frequency** in configuration

### High Memory Usage

**Symptoms**: Services running out of memory

**Solutions**:

1. **Check memory limits**:
   ```bash
   docker stats --no-stream
   ```

2. **Increase container memory limits**:
   ```yaml
   # In docker-compose.yml
   services:
     orchestrator:
       deploy:
         resources:
           limits:
             memory: 2G
   ```

3. **Check for memory leaks** in Socket.io connections:
   ```bash
   docker compose logs gateway | grep "socket"
   ```

### Slow Response Times

**Symptoms**: Bot takes too long to respond

**Solutions**:

1. **Check Anthropic API latency**:
   ```bash
   docker compose logs orchestrator | grep "latency\|duration"
   ```

2. **Enable caching**:
   ```bash
   # Check cache hit rate in metrics
   curl http://localhost:3000/api/metrics | jq '.cacheHitRate'
   ```

3. **Reduce context retrieval scope** in persona settings

---

## Frontend Issues

### Dashboard Not Loading

**Symptoms**: Blank page or loading forever

**Solutions**:

1. **Check frontend service**:
   ```bash
   docker compose logs frontend
   curl http://localhost:3000/api/health
   ```

2. **Check browser console** for JavaScript errors

3. **Clear browser cache and try incognito mode**

### Real-time Updates Not Working

**Symptoms**: Dashboard doesn't update when messages arrive

**Solutions**:

1. **Check Socket.io connection**:
   ```javascript
   // In browser console
   window.__socket?.connected
   ```

2. **Check Gateway Socket.io**:
   ```bash
   docker compose logs gateway | grep "socket"
   ```

3. **Verify Redis pub/sub**:
   ```bash
   redis-cli -p 6380 PUBSUB CHANNELS
   ```

---

## Docker Issues

### Build Failures

**Symptoms**: `docker compose build` fails

**Solutions**:

1. **Clear Docker cache**:
   ```bash
   docker compose build --no-cache
   ```

2. **Check disk space**:
   ```bash
   df -h
   docker system df
   ```

3. **Prune unused resources**:
   ```bash
   docker system prune -a
   ```

### Volume Permission Issues

**Symptoms**: `Permission denied` errors in logs

**Solutions**:

1. **Fix permissions on host**:
   ```bash
   chmod -R 755 ./services/gateway/.wwebjs_auth
   chmod -R 755 ./logs
   ```

2. **Use appropriate user in Dockerfile**:
   ```dockerfile
   USER node
   ```

### Container Restarts

**Symptoms**: Containers keep restarting

**Solutions**:

1. **Check restart policy**:
   ```bash
   docker inspect secondme_gateway | jq '.[0].HostConfig.RestartPolicy'
   ```

2. **Check exit code**:
   ```bash
   docker compose ps -a
   docker compose logs gateway | tail -100
   ```

---

## Logs and Debugging

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f gateway

# Last N lines
docker compose logs --tail 100 orchestrator

# With timestamps
docker compose logs -t orchestrator
```

### Log Levels

Set in `.env`:
```
LOG_LEVEL=debug  # debug, info, warn, error
```

### Audit Logs

Message processing audit trail:
```bash
cat logs/messages.jsonl | jq '.'
tail -f logs/messages.jsonl
```

### Debug Mode

Enable verbose debugging:
```bash
DEBUG=* npm run dev
```

---

## Getting Help

If you can't resolve an issue:

1. **Collect diagnostic info**:
   ```bash
   # System info
   docker compose version
   node --version

   # Service status
   docker compose ps

   # Recent logs
   docker compose logs --tail 500 > debug-logs.txt
   ```

2. **Open a GitHub issue** with:
   - Problem description
   - Steps to reproduce
   - Error messages
   - Environment details
   - Relevant log excerpts

3. **Check existing issues** for similar problems
