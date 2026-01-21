# Graph Worker Service - Knowledge graph ingestion and entity extraction
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

# Expose Graph Worker port
EXPOSE 3003

# Start service
CMD ["npm", "start"]
