# SecondMe Security Guide

This guide covers security best practices and hardening measures for SecondMe deployments.

## Table of Contents

1. [Security Overview](#security-overview)
2. [Authentication & Secrets](#authentication--secrets)
3. [Network Security](#network-security)
4. [Data Protection](#data-protection)
5. [API Security](#api-security)
6. [WhatsApp Session Security](#whatsapp-session-security)
7. [Container Security](#container-security)
8. [Monitoring & Auditing](#monitoring--auditing)
9. [Incident Response](#incident-response)

---

## Security Overview

SecondMe handles sensitive data including:
- WhatsApp messages and contacts
- Personal communication patterns
- AI-generated responses
- Authentication sessions

### Security Principles

1. **Least Privilege**: Services run with minimal permissions
2. **Defense in Depth**: Multiple security layers
3. **Data Minimization**: Only store necessary data
4. **Encryption**: Protect data at rest and in transit

---

## Authentication & Secrets

### Environment Variables

**Never commit secrets to version control.**

```bash
# Create local .env (gitignored)
cp .env.production .env

# Use strong passwords
openssl rand -base64 32  # Generate random password
```

### Required Secrets

| Secret | Purpose | Rotation |
|--------|---------|----------|
| `ANTHROPIC_API_KEY` | AI API access | As needed |
| `REDIS_PASSWORD` | Redis authentication | Quarterly |
| `FALKORDB_PASSWORD` | Graph DB authentication | Quarterly |

### Secret Management Best Practices

1. **Use a secrets manager** in production:
   - HashiCorp Vault
   - AWS Secrets Manager
   - Docker Secrets

2. **Rotate secrets regularly**:
   ```bash
   # Example: Rotate Redis password
   redis-cli -p 6380 CONFIG SET requirepass "new_password"
   ```

3. **Audit secret access**:
   ```bash
   # Check who accessed secrets
   vault audit-log
   ```

---

## Network Security

### Firewall Configuration

Only expose necessary ports:

```bash
# Development (local only)
# All services on localhost

# Production
# Only expose frontend (3000) externally
# Backend services internal only
```

### Docker Network Isolation

```yaml
# docker-compose.yml
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true  # No external access
```

### HTTPS/TLS

In production, always use HTTPS:

```nginx
# Example nginx config
server {
    listen 443 ssl;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
    }
}
```

### CORS Configuration

Configure allowed origins in `.env`:

```bash
# Production
CORS_ALLOWED_ORIGINS=https://yourdomain.com

# Development
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

---

## Data Protection

### Data at Rest

#### Redis Encryption

Enable Redis encryption for persistent data:

```conf
# redis.conf
# Enable AOF persistence
appendonly yes
appendfsync everysec
```

For full encryption, use volume encryption:

```bash
# Example: LUKS encryption on Linux
cryptsetup luksFormat /dev/sdX
cryptsetup open /dev/sdX redis_encrypted
mkfs.ext4 /dev/mapper/redis_encrypted
```

#### FalkorDB Encryption

Mount encrypted volumes:

```yaml
volumes:
  falkordb_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /path/to/encrypted/volume
```

### Data in Transit

All internal communication should use TLS:

```yaml
# Enable Redis TLS
services:
  redis:
    command: redis-server --tls-port 6379 --tls-cert-file /certs/redis.crt
```

### Data Retention

Implement data retention policies:

```bash
# Auto-expire old messages (30 days)
redis-cli EXPIRE "MSG:*" 2592000

# Clean old audit logs
find ./logs -name "*.log" -mtime +30 -delete
```

---

## API Security

### Rate Limiting

Configured in security middleware:

```typescript
// services/gateway/src/middleware/security.ts
rateLimitMiddleware({
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100,     // requests per window
})
```

### Input Validation

All inputs are validated:

```typescript
validateInput({
  body: {
    contactId: { type: 'string', required: true, maxLength: 100 },
    duration: { type: 'number', min: 0, max: 604800 },
  },
})
```

### Security Headers

Applied to all responses:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
```

### Request Tracing

Every request gets a unique ID:

```
X-Request-ID: req_abc123_xyz789
```

---

## WhatsApp Session Security

### Session Storage

WhatsApp sessions are stored in `.wwebjs_auth/`:

```bash
# Secure the session directory
chmod 700 services/gateway/.wwebjs_auth
chown -R app:app services/gateway/.wwebjs_auth
```

### Session Encryption

For additional security, encrypt session data:

```typescript
// Example: AES-256 encryption for session tokens
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY;
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}
```

### Session Rotation

Sessions expire after 24 hours by default. Configure in `.env`:

```bash
SESSION_EXPIRY_HOURS=24
SESSION_WARNING_MINUTES=60
```

---

## Container Security

### Non-Root User

All containers run as non-root:

```dockerfile
# Dockerfile
RUN addgroup --system app && adduser --system --group app
USER app
```

### Read-Only Filesystem

Where possible, use read-only mounts:

```yaml
services:
  orchestrator:
    read_only: true
    tmpfs:
      - /tmp
```

### Resource Limits

Prevent resource exhaustion:

```yaml
services:
  gateway:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Security Scanning

Regularly scan images:

```bash
# Scan for vulnerabilities
docker scout cve secondme_gateway

# Update base images
docker pull node:24-alpine
docker compose build --no-cache
```

---

## Monitoring & Auditing

### Audit Logging

All message processing is logged:

```bash
# View audit log
cat logs/messages.jsonl | jq '.'

# Search for specific contact
grep "contactId.*123" logs/messages.jsonl
```

### Security Events

Monitor for suspicious activity:

```bash
# Failed authentication attempts
grep -i "auth\|failed\|denied" logs/*.log

# Rate limit triggers
grep "rate.*limit" logs/gateway-combined.log
```

### Alerting

Configure alerts for security events:

```yaml
# Example: Prometheus alerting rule
- alert: HighFailedAuthRate
  expr: rate(auth_failures_total[5m]) > 10
  for: 5m
  annotations:
    summary: High rate of failed authentications
```

---

## Incident Response

### Security Incident Checklist

1. **Contain**: Isolate affected systems
   ```bash
   docker compose stop gateway
   ```

2. **Assess**: Determine scope
   ```bash
   # Check recent activity
   docker compose logs --since 1h
   ```

3. **Eradicate**: Remove threat
   ```bash
   # Rotate compromised credentials
   # Revoke API keys
   # Reset sessions
   ```

4. **Recover**: Restore normal operations
   ```bash
   docker compose up -d
   ```

5. **Document**: Record incident details

### Emergency Procedures

#### Disable All Bot Activity

```bash
# Master kill switch
redis-cli -p 6380 SET PAUSE:ALL $(date +%s)
```

#### Revoke WhatsApp Session

```bash
# Delete session data
rm -rf services/gateway/.wwebjs_auth/
docker compose restart gateway
```

#### Emergency Shutdown

```bash
docker compose down
```

### Contact Information

- Security issues: security@yourcompany.com
- Emergency contact: [Phone number]
- Bug bounty program: [Link]

---

## Security Checklist

### Deployment

- [ ] Strong passwords for all services
- [ ] HTTPS enabled
- [ ] Firewall configured
- [ ] Non-root containers
- [ ] Volume encryption

### Operations

- [ ] Regular security updates
- [ ] Log monitoring enabled
- [ ] Backup procedures tested
- [ ] Incident response plan documented

### Development

- [ ] Dependencies audited (`npm audit`)
- [ ] No secrets in code
- [ ] Input validation on all endpoints
- [ ] Security headers configured

---

## Additional Resources

- [OWASP Security Guidelines](https://owasp.org/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)
