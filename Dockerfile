# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
RUN npm install --global pnpm@10.33.2
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
# No database, authentication or storage credentials are needed at build time.
ENV KYBO_STANDALONE=1
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.mjs ./
COPY src ./src
COPY public ./public
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN chown node:node /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
