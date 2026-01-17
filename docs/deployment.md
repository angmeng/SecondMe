# SecondMe Deployment Guide

This guide covers deploying SecondMe in various environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Development)](#quick-start-development)
3. [Production Deployment](#production-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Service Architecture](#service-architecture)
7. [Health Monitoring](#health-monitoring)
8. [Backup & Recovery](#backup--recovery)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js**: v24.12.0 or higher
- **Docker**: v24.0 or higher (for containerized deployment)
- **Docker Compose**: v2.20 or higher
- **Redis**: v8.4 or higher
- **Anthropic API Key**: Required for AI features

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Storage | 20 GB | 50 GB |
| Network | 10 Mbps | 100 Mbps |

---

## Quick Start (Development)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/secondme.git
   cd secondme
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Copy environment file**:
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env`** and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your_key_here
   ```

5. **Start infrastructure services**:
   ```bash
   docker compose up -d redis falkordb
   ```

6. **Start all services**:
   ```bash
   npm run dev
   ```

7. **Open the dashboard**: http://localhost:3000

---

## Production Deployment

### Using Docker Compose (Recommended)

1. **Copy production environment file**:
   ```bash
   cp .env.production .env
   ```

2. **Configure production settings** in `.env`:
   - Set strong passwords for Redis and FalkorDB
   - Add your Anthropic API key
   - Configure CORS allowed origins
   - Set appropriate log levels

3. **Build and start all services**:
   ```bash
   docker compose -f docker-compose.yml up -d --build
   ```

4. **Verify deployment**:
   ```bash
   docker compose ps
   docker compose logs -f
   ```

### Manual Deployment

1. **Build all services**:
   ```bash
   npm run build --workspaces
   ```

2. **Start services in order**:
   ```bash
   # Start Redis
   redis-server /path/to/redis.conf

   # Start FalkorDB
   docker run -d --name falkordb falkordb/falkordb:v4.14.11

   # Start backend services
   cd services/gateway && npm start &
   cd services/orchestrator && npm start &
   cd services/graph-worker && npm start &

   # Start frontend
   cd frontend && npm start
   ```

---

## Docker Deployment

### Building Images

```bash
# Build all services
docker compose build

# Build specific service
docker compose build gateway
```

### Managing Containers

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f [service_name]

# Restart a service
docker compose restart gateway

# Scale a service
docker compose up -d --scale orchestrator=2
```

### Health Checks

All services include health checks. Check status with:

```bash
docker compose ps
```

Healthy services show `(healthy)` status.

---

## Environment Configuration

### Required Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | (required) |
| `REDIS_HOST` | Redis server host | `localhost` |
| `REDIS_PORT` | Redis server port | `6380` |
| `FALKORDB_HOST` | FalkorDB host | `localhost` |
| `FALKORDB_PORT` | FalkorDB port | `6379` |
| `FALKORDB_PASSWORD` | FalkorDB password | (required in production) |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `HTS_WPM_MIN` / `HTS_WPM_MAX` | Typing speed range | `35` / `45` |
| `SLEEP_HOURS_ENABLED` | Enable sleep hours feature | `true` |

---

## Service Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Gateway   │────▶│ Orchestrator│
│   (Next.js) │     │  (Express)  │     │ (LangGraph) │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │    Redis    │     │  FalkorDB   │
                    │  (Streams)  │     │   (Graph)   │
                    └─────────────┘     └─────────────┘
```

### Ports

| Service | Default Port |
|---------|--------------|
| Frontend | 3000 |
| Gateway | 3001 |
| Orchestrator | 3002 |
| Graph Worker | 3003 |
| Redis | 6380 |
| FalkorDB | 6379 |

---

## Health Monitoring

### Health Endpoints

- Frontend: `GET http://localhost:3000/api/health`
- Gateway: `GET http://localhost:3001/health`
- Orchestrator: `GET http://localhost:3002/health`

### Response Format

```json
{
  "status": "healthy",
  "timestamp": "2024-01-17T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": [
    { "name": "redis", "status": "pass", "latencyMs": 2 },
    { "name": "falkordb", "status": "pass", "latencyMs": 5 }
  ]
}
```

### Status Codes

- `healthy` (200): All checks pass
- `degraded` (200): Some non-critical checks have warnings
- `unhealthy` (503): Critical checks failed

---

## Backup & Recovery

### Automated Backups

Run the backup script:

```bash
./scripts/backup-falkordb.sh -o ./backups -r 7
```

### Scheduled Backups (cron)

Add to crontab for daily backups at 2 AM:

```bash
0 2 * * * /path/to/secondme/scripts/backup-falkordb.sh >> /var/log/secondme-backup.log 2>&1
```

### Manual Recovery

1. Stop services:
   ```bash
   docker compose stop falkordb
   ```

2. Copy backup file:
   ```bash
   docker cp ./backups/falkordb_backup_TIMESTAMP.rdb secondme_falkordb:/data/dump.rdb
   ```

3. Restart services:
   ```bash
   docker compose start falkordb
   ```

---

## Troubleshooting

See [troubleshooting.md](./troubleshooting.md) for common issues and solutions.

### Quick Checks

1. **Services not starting**: Check logs with `docker compose logs`
2. **Connection refused**: Verify ports are not in use
3. **Authentication failed**: Check environment variables
4. **High memory usage**: Increase container limits

### Support

For issues, please open a GitHub issue with:
- Error messages and logs
- Environment details
- Steps to reproduce
