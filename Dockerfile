FROM node:20-alpine AS builder

WORKDIR /app

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init curl

WORKDIR /app

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app

USER nodejs

# Expose WebSocket/HTTP port
EXPOSE 8080

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default to WebSocket server for K8s deployment
CMD ["node", "dist/websocket-server.js"]