# Orchestrator Service - LangGraph.js AI workflow
# Updated to Node.js 24.12.0 LTS (January 2026)
FROM node:24.12.0-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose Orchestrator port
EXPOSE 3002

# Start service
CMD ["npm", "start"]
