# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* bun.lock* ./

# Install dependencies
RUN npm ci --prefer-offline --no-audit 2>&1 || true

# Copy source
COPY . .

# Build vite
RUN npm run build 2>&1 || true

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install necessary packages
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Copy public assets if they exist
COPY --from=builder /app/dist/public ./dist/public 2>/dev/null || true

# Expose port
EXPOSE 3000

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.cjs"]
