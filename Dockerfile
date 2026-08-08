# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable

# ---- deps: install dependencies with pnpm, cached by lockfile ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- builder: build the Next.js app in standalone mode ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_APP_URL tiene que estar presente EN EL BUILD, no en runtime:
# Next.js incrusta las variables NEXT_PUBLIC_* en el bundle del cliente al
# compilar (lib/hooks/use-dashboard.ts y compañía la leen desde el navegador).
# Sin esto se hornea como `undefined` y el código cae a su valor por defecto,
# http://localhost:3000 — con lo que el panel desplegado intentaría llamar a
# la API en la máquina del usuario y no funcionaría nada.
#
# En Dokploy hay que declararla como *build argument*, no solo como variable
# de entorno del contenedor. Ej.: NEXT_PUBLIC_APP_URL=https://panel.tudominio
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN if [ -z "$NEXT_PUBLIC_APP_URL" ]; then \
      echo "ERROR: falta el build arg NEXT_PUBLIC_APP_URL (ver comentario en el Dockerfile)." >&2; \
      exit 1; \
    fi
RUN pnpm build

# ---- runner: minimal production image ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
