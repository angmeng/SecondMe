# SecondMe Monitoring Configuration

This directory contains monitoring and alerting configurations for SecondMe.

## Overview

SecondMe exposes metrics and health endpoints that can be integrated with:
- **Prometheus** for metrics collection
- **Grafana** for visualization
- **Alertmanager** for alerting

## Health Endpoints

| Service | Endpoint | Port |
|---------|----------|------|
| Gateway | `/health` | 3001 |
| Orchestrator | `/health` | 3002 |
| Graph Worker | `/health` | 3003 |
| Frontend | `/api/health` | 3000 |

## Metrics

### Gateway Metrics (via Redis pub/sub)

| Metric | Type | Description |
|--------|------|-------------|
| `whatsapp_connected` | gauge | 1 if connected, 0 if not |
| `messages_received_total` | counter | Total incoming messages |
| `messages_sent_total` | counter | Total outgoing messages |
| `session_expiry_timestamp` | gauge | Session expiry time |

### Orchestrator Metrics (via Redis pub/sub)

| Metric | Type | Description |
|--------|------|-------------|
| `tokens_used_total` | counter | Total AI tokens consumed |
| `cache_hit_rate` | gauge | Prompt cache hit rate (0-1) |
| `response_latency_seconds` | histogram | Response generation time |
| `classification_latency_seconds` | histogram | Message classification time |

### System Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `active_pauses_total` | gauge | Number of active contact pauses |
| `deferred_messages_total` | gauge | Messages waiting for sleep hours |
| `uptime_seconds` | counter | Service uptime |

## Alerting Rules

See `alerting-rules.yml` for Prometheus-compatible alerting rules.

### Alert Severity Levels

| Level | Action Required |
|-------|-----------------|
| `critical` | Immediate attention - service degraded |
| `warning` | Investigation needed within 4 hours |
| `info` | Monitor, no immediate action |

### Key Alerts

1. **ServiceDown** - Any service unavailable for >1 minute
2. **WhatsAppDisconnected** - WhatsApp client lost connection
3. **SessionExpiringSoon** - Session will expire within 1 hour
4. **AnthropicAPIErrors** - Elevated error rate from AI API
5. **HighTokenUsage** - Token consumption above threshold

## Quick Setup

### Docker-based Prometheus Setup

```yaml
# Add to docker-compose.yml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./infra/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    - ./infra/monitoring/alerting-rules.yml:/etc/prometheus/rules/alerting.yml
  ports:
    - "9090:9090"

alertmanager:
  image: prom/alertmanager:latest
  volumes:
    - ./infra/monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml
  ports:
    - "9093:9093"
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: 'gateway'
    static_configs:
      - targets: ['gateway:3001']
    metrics_path: '/health'

  - job_name: 'orchestrator'
    static_configs:
      - targets: ['orchestrator:3002']
    metrics_path: '/health'

  - job_name: 'graph-worker'
    static_configs:
      - targets: ['graph-worker:3003']
    metrics_path: '/health'
```

### Alertmanager Configuration

```yaml
# alertmanager.yml
route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 3h
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'

receivers:
  - name: 'default'
    # Configure your notification method
    # email_configs:
    #   - to: 'alerts@yourdomain.com'

  - name: 'critical-alerts'
    # Configure urgent notifications
    # pagerduty_configs:
    #   - service_key: '<key>'
```

## Dashboard Integration

### Redis Metrics Dashboard

Query metrics from Redis:

```bash
# Get current stats
redis-cli -p 6380 HGETALL "STATS:tokens:$(date +%Y-%m-%d)"

# Get message logs
redis-cli -p 6380 ZREVRANGE "LOGS:messages" 0 10
```

### Built-in Metrics API

The frontend exposes `/api/metrics` for dashboard consumption:

```bash
curl http://localhost:3000/api/metrics
```

Response:
```json
{
  "messagesReceived": 150,
  "messagesSent": 145,
  "tokensUsed": 25000,
  "cacheHitRate": 0.82,
  "avgResponseTime": 1250,
  "uptime": 86400,
  "activePauses": 2,
  "deferredMessages": 0
}
```

## Troubleshooting

### No Metrics Data

1. Check service health endpoints are responding
2. Verify Redis connectivity
3. Check Prometheus scrape targets

### Missing Alerts

1. Verify alerting rules syntax: `promtool check rules alerting-rules.yml`
2. Check Alertmanager connectivity
3. Review Prometheus alert state in UI

### High Alert Noise

1. Adjust alert thresholds in `alerting-rules.yml`
2. Increase `for` duration to filter transient issues
3. Add alert inhibition rules for dependent alerts
