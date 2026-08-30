# ==================== DOCKERFILE - GELİŞTİRİLMİŞ TICARET BOTU ====================
# Multi-stage build: Build → Runtime

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Bağımlılıkları yükle
COPY package*.json ./
RUN npm ci

# TypeScript derlemesi
COPY tsconfig.json ./
COPY src ./src
COPY index.html ./
COPY tailwind.config.js postcss.config.js ./
COPY vite.config.ts ./

RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Minimal production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Build outputları ve sunucu kodlarını kopyala
COPY --from=builder /app/dist ./dist
COPY src ./src
COPY data ./data

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Sunucu başlat
CMD ["npm", "start"]
