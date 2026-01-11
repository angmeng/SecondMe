# Frontend Service - Next.js 16.1.1 Dashboard
# Updated to Node.js 24.12.0 LTS (January 2026)
FROM node:24.12.0-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build Next.js application
RUN npm run build

# Expose Frontend port
EXPOSE 3000

# Start Next.js in production mode
CMD ["npm", "start"]
