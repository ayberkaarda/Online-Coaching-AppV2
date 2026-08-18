# syntax=docker/dockerfile:1

FROM node:20-alpine AS base

# ---- deps: install dependencies with full lockfile fidelity ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
# pnpm, corepack ile DEĞİL doğrudan npm ile kuruluyor: corepack Node 25'ten itibaren
# dağıtımdan çıkarıldı. Sürüm, package.json'daki `packageManager` alanıyla BİREBİR aynı
# tutulmalıdır — ikisi ayrışırsa imaj CI/yerelden farklı bir çözümleme üretir.
RUN npm i -g pnpm@10.34.5
# `.npmrc` de kopyalanır: `auto-install-peers` ayarı next-pwa'nın hayalet `webpack`
# bağımlılığını çözen şeydir, dosya olmadan build aşaması kırılır.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---- builder: build the Next.js standalone output ----
FROM base AS builder
WORKDIR /app
# Aynı pnpm sürümü burada da gerekiyor: `pnpm run build` script'i bu aşamada koşuyor.
# `runner` aşamasına BİLEREK eklenmiyor — orada yalnızca `node server.js` çalışır.
RUN npm i -g pnpm@10.34.5
# pnpm'in node_modules'ü symlink'lidir; bağlantılar node_modules/.pnpm içine GÖRELİ
# olarak işaret ettiği için dizin bir bütün olarak kopyalandığında bozulmaz.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public env vars (baked into the client bundle).
# Pass actual values via `docker build --build-arg NEXT_PUBLIC_...=...`
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

# ---- runner: minimal production image ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
