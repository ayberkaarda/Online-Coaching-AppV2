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
# Faz 4.5 (monorepo): `pnpm install --frozen-lockfile` workspace'in TÜM üyelerinin
# manifest'ini görmek zorunda — `pnpm-workspace.yaml` + her workspace paketinin
# `package.json`'ı olmadan pnpm kilidi eksik/uyumsuz sayar ve düşer (ÖLÇÜLDÜ: Faz 4.5
# commit 3-4'te `packages/config` ve `packages/types` eklendi ama burada unutulmuştu —
# `@repo/types` için symlink hiç kurulmadı, `pnpm --filter web run build` TS2307 ile
# düştü). `.npmrc` de kopyalanır: `auto-install-peers` ayarı next-pwa'nın hayalet
# `webpack` bağımlılığını çözen şeydir, dosya olmadan build aşaması kırılır.
#
# `--parents` bayrağı ZORUNLU: birden çok kaynak dosyası tek bir hedef dizine
# kopyalanırken Docker COPY varsayılan olarak dizin yapısını DÜZLEŞTİRİR — her paketin
# `package.json`'ı aynı basename'e sahip olduğu için sonuncusu öncekilerin üzerine yazar
# ve diğer workspace üyeleri sessizce kaybolur (ÖLÇÜLDÜ). `--parents` kaynağın dizin
# yolunu (packages/<ad>/package.json) hedefin altında KORUR.
#
# Glob paket-adı-bağımsızdır: yeni bir workspace paketi eklendiğinde (ör. Faz 4.5
# commit 5'te `packages/api-client`) bu satırın DEĞİŞMESİNE gerek YOK — `packages/*`
# desenine otomatik dahil olur. Yeni bir workspace GRUBU eklenirse (ör. `apps/*` /
# `packages/*` dışında, `pnpm-workspace.yaml`'da yeni bir üst dizin deseni) bu satıra
# yeni bir glob eklenmesi gerekir.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --parents apps/*/package.json packages/*/package.json ./
RUN pnpm install --frozen-lockfile

# ---- builder: build the Next.js standalone output ----
FROM base AS builder
WORKDIR /app
# Aynı pnpm sürümü burada da gerekiyor: `pnpm run build` script'i bu aşamada koşuyor.
# `runner` aşamasına BİLEREK eklenmiyor — orada yalnızca `node server.js` çalışır.
RUN npm i -g pnpm@10.34.5
# pnpm'in node_modules'ü symlink'lidir; bağlantılar node_modules/.pnpm içine GÖRELİ
# olarak işaret ettiği için dizinler bir bütün olarak kopyalandığında bozulmaz.
# Sanal depo kökte (`/app/node_modules/.pnpm`) tek parça olarak kopyalanır.
COPY --from=deps /app/node_modules ./node_modules
# Pakete özel symlink dizinleri (`apps/web/node_modules`, `packages/*/node_modules`) HER
# workspace üyesi için gerekli — `@repo/types` gibi paketlerin KENDİ node_modules'ü
# (ör. zod, @repo/config symlink'i) olmadan `pnpm --filter web run build` sırasındaki
# TypeScript adımı modülü çözemez (ÖLÇÜLDÜ, orijinal kırığın kök nedeni buydu).
#
# Kaynak yolları MUTLAK olmak ZORUNDA (deps aşamasının WORKDIR'ı /app; göreli bir glob,
# ör. `apps/*/node_modules`, --from ile eşleşme sağlamaz ve SESSİZCE hiçbir şey
# kopyalamaz — ÖLÇÜLDÜ). Hedef de kök "/" olmalı: `--parents` mutlak kaynağın TAM yolunu
# hedefin altında yeniden üretir, hedef "." (=/app) olsaydı sonuç `/app/app/packages/...`
# gibi YANLIŞ bir iç içelik olurdu — ÖLÇÜLDÜ, hedef "/" iken doğru şekilde
# `/app/packages/<ad>/node_modules` üretir.
#
# Glob paket-adı-bağımsızdır: yeni bir paket eklendiğinde bu satırın değişmesine gerek
# yok (bkz. `deps` aşamasındaki eşdeğer not).
COPY --from=deps --parents /app/apps/*/node_modules /app/packages/*/node_modules /
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

RUN pnpm --filter web run build

# ---- runner: minimal production image ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# ÖLÇÜLDÜ (Faz 4.5 commit 2): `outputFileTracingRoot` workspace köküne çekildiği için
# standalone çıktısı MONOREPO AĞACINI aynen yeniden üretir —
#   .next/standalone/node_modules/.pnpm/**   (sanal depo)
#   .next/standalone/apps/web/server.js      (giriş noktası)
#   .next/standalone/apps/web/node_modules/  (göreli symlink'ler)
# Bu yüzden standalone `/app`'in köküne açılır ve çalışma dizini `/app/apps/web` olur.
# İzleme kökü `apps/web` bırakılsaydı `node_modules/.pnpm` çıktının DIŞINDA kalır,
# imaj ilk istekte `Cannot find module` ile düşerdi.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# `public` ve `.next/static` standalone çıktısına BİLEREK dahil edilmez (Next dokümantasyonu,
# output.md) — elle kopyalanır; yolları da yeni yerleşime göre `apps/web` altındadır.
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

WORKDIR /app/apps/web

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
