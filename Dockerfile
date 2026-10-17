# Image of the canteen site for any Linux server with Docker (e.g. a Viettel cloud server).
# Build:  docker compose build app      Run:  docker compose up -d
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# openssl: needed by Prisma. tzdata: the app works in Vietnam time (meal cutoffs, "today"), see TZ below.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build downloads the page fonts (next/font/google), so the server needs internet access while building.
# DATABASE_URL is only a placeholder here: the build never connects to a database.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

FROM base AS run
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Ho_Chi_Minh
COPY --from=build /app ./
EXPOSE 3000
# Applies database migrations and the one-off data scripts (all guarded, safe to repeat), then starts the site.
CMD ["npm", "run", "start:server"]
