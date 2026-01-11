# SecondMe - Personal AI Clone

> **Context-Adaptive WhatsApp Automation with Knowledge Graph Memory**

SecondMe is a sophisticated WhatsApp bot that acts as your personal AI clone, powered by Claude AI and equipped with knowledge graph memory for context-aware conversations.

## 🚀 Features

- **Context-Adaptive AI**: Uses Claude Sonnet 4.5 with dynamic persona switching
- **Knowledge Graph Memory**: FalkorDB-powered entity extraction and relationship mapping
- **Human Typing Simulation**: Realistic typing indicators with configurable delays
- **Constitutional AI**: Built-in safety guardrails and behavior constraints
- **Real-time Dashboard**: Next.js 16 frontend for monitoring and control
- **Microservices Architecture**: Scalable design with Redis-backed state management

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 24.12.0 LTS** or later ([Download](https://nodejs.org))
- **Docker 20.x** or later ([Download](https://www.docker.com/get-started))
- **Docker Compose v5.x** or later
- **Anthropic API Key** ([Get one here](https://console.anthropic.com/))

### Verify Installation

```bash
node --version  # Should show v24.12.0 or later
npm --version   # Should show v10.x or later
docker --version  # Should show 20.x or later
docker compose version  # Should show v5.x or later
```

## 🛠️ Technology Stack

### Core Technologies (Updated January 2026)

- **Runtime**: Node.js 24.12.0 LTS
- **Language**: TypeScript 5.9.3
- **Frontend**: Next.js 16.1.1 (App Router) + React 19.2
- **AI Orchestration**: LangGraph.js 1.0.7 + @anthropic-ai/sdk 0.71.2
- **Knowledge Graph**: FalkorDB 4.14.11
- **State & Queue**: Redis 8.4 + ioredis 5.9.1
- **WhatsApp Integration**: whatsapp-web.js 1.34.2
- **Real-time Communication**: Socket.io 4.8.3
- **Styling**: Tailwind CSS 4.1.18

### Testing & Tooling

- **Unit Testing**: Vitest 4.0.16
- **E2E Testing**: Playwright 1.57.0
- **Linting**: ESLint 9.18.0 (flat config)
- **Formatting**: Prettier 3.7.4

## 📦 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd SecondMe
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your Anthropic API key
nano .env  # or use your preferred editor
```

**Required Configuration**:
- `ANTHROPIC_API_KEY`: Your Anthropic API key (required)
- `FALKORDB_PASSWORD`: Change from default in production

### 3. Install Dependencies

```bash
# Install all workspace dependencies
npm install
```

### 4. Start Services with Docker

```bash
# Start all services in detached mode
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

## 🔧 Development

### Local Development (Without Docker)

```bash
# Terminal 1: Start Redis
redis-server --port 6380

# Terminal 2: Start FalkorDB
docker run -p 6379:6379 falkordb/falkordb:v4.14.11

# Terminal 3: Start all services concurrently
npm run dev
```

### Available Scripts

```bash
npm run dev          # Start all services in development mode
npm run build        # Build all services
npm run test         # Run unit tests
npm run test:contract    # Run contract tests
npm run test:integration # Run integration tests
npm run test:e2e     # Run Playwright E2E tests
npm run lint         # Lint all code
npm run format       # Format code with Prettier
npm run type-check   # TypeScript type checking
```

## 📐 Architecture

```
SecondMe/
├── frontend/              # Next.js 16.1.1 Dashboard
│   ├── src/
│   │   ├── app/          # App Router pages
│   │   └── components/   # React 19.2 components
│   └── package.json
│
├── services/
│   ├── gateway/          # WhatsApp Web.js integration
│   │   ├── src/
│   │   └── package.json
│   │
│   ├── orchestrator/     # LangGraph.js AI workflow
│   │   ├── src/
│   │   └── package.json
│   │
│   └── graph-worker/     # Knowledge graph ingestion
│       ├── src/
│       └── package.json
│
├── specs/                # Project specifications
│   └── 001-personal-ai-clone/
│       ├── constitution.md
│       ├── plan.md
│       ├── research.md
│       └── contracts/
│
└── docker-compose.yml    # Service orchestration
```

## 🎯 Usage

### First-Time Setup

1. **Start the services**:
   ```bash
   docker compose up -d
   ```

2. **Connect WhatsApp**:
   - Open the dashboard at http://localhost:3000
   - Scan the QR code with WhatsApp (Settings → Linked Devices)
   - Wait for "WhatsApp Connected" status

3. **Test the bot**:
   - Send a test message to your WhatsApp number
   - Bot will respond after HTS delay (1-3 seconds)

### Dashboard Controls

Access the dashboard at http://localhost:3000:

- **Bot Status**: View connection status and uptime
- **Master Kill Switch**: Emergency stop for all bot responses
- **Pause/Resume**: Temporarily pause bot responses
- **Persona Switching**: Change conversation style
- **Rate Limiting**: Configure message throttling
- **Sleep Hours**: Set quiet hours (default: 11 PM - 7 AM)

## 🔐 Constitutional Constraints

SecondMe includes built-in safety guardrails:

- **No Financial Advice**: Bot will not provide investment guidance
- **No Medical Advice**: Redirects health questions to professionals
- **Auto-Pause on User Message**: Stops responding when you reply
- **Rate Limiting**: Maximum 10 messages per minute
- **Sleep Hours**: Respects configured quiet hours

See `specs/001-personal-ai-clone/constitution.md` for full details.

## 🧪 Testing

### Run All Tests

```bash
# Unit tests
npm run test

# Contract tests (service boundaries)
npm run test:contract

# Integration tests (requires Docker services running)
docker compose up -d
npm run test:integration

# E2E tests (requires frontend running)
npm run test:e2e
```

## 📊 Monitoring

### Service Health

```bash
# Check all services
docker compose ps

# View logs for specific service
docker compose logs -f gateway
docker compose logs -f orchestrator
docker compose logs -f graph-worker

# Redis CLI
docker exec -it secondme_redis redis-cli

# FalkorDB CLI
docker exec -it secondme_falkordb redis-cli
```

### Dashboard Metrics

The frontend dashboard displays:
- Message throughput
- Response latency
- Graph context retrieval stats
- Rate limit status
- Bot uptime

## 🔄 Migration Notes

### Breaking Changes in Latest Versions

#### Node.js 20 → 24.12.0
- **Security**: OpenSSL 3.5 with stricter defaults (RSA/DSA/DH keys < 2048 bits rejected)
- **Platform**: macOS now requires 13.5+ (Ventura), Linux requires gcc 12.2+
- **API Removals**: `util.is*()` methods, `fs.truncate()` with file descriptors

#### React 18 → 19.2
- **Breaking Change**: `useRef()` now requires an argument:
  ```typescript
  // Before
  const ref = useRef();

  // After
  const ref = useRef(null);
  ```

#### Next.js 16 Async APIs
- All route APIs now require `await`:
  ```typescript
  // Before
  export default function Page({ params }) {
    const id = params.id;
  }

  // After
  export default async function Page({ params }) {
    const { id } = await params;
  }
  ```

#### LangGraph.js 0.1 → 1.0.7
- Stable v1.0 API with ResumableStreams
- RemoteCheckpointer for distributed workflows
- `toolsCondition` undeprecated

See `specs/001-personal-ai-clone/research.md` Section 7 for comprehensive migration guide.

## 📝 License

This project is private and proprietary.

## 🤝 Contributing

This is a personal project. External contributions are not currently accepted.

## 📞 Support

For issues and questions:
1. Check `specs/001-personal-ai-clone/quickstart.md`
2. Review constitutional constraints in `constitution.md`
3. Examine service logs: `docker compose logs -f`

## 🗺️ Roadmap

- [ ] Multi-user support with isolated knowledge graphs
- [ ] Voice message transcription and synthesis
- [ ] Advanced context retrieval with semantic search
- [ ] Mobile app for dashboard access
- [ ] Backup and restore functionality

---

**Built with Claude AI** | Powered by Anthropic | Last Updated: January 2026
