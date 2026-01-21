# Gateway Service - WhatsApp Web.js integration
# Updated to Node.js 24.12.0 LTS (January 2026)
FROM node:24.12.0-alpine

# Install Chromium dependencies required by whatsapp-web.js
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Expose Gateway port
EXPOSE 3001

# Start service
CMD ["npm", "start"]
