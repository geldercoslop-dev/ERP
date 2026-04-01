FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

COPY . .
# Build de produção via script padrão (gera dist/public + dist/server)
RUN pnpm run build

FROM node:20-alpine AS runner

WORKDIR /app

# Produção: instalar deps necessárias para runtime (sem scripts).
# Observação: o backend referencia `vite` no boot (dev server/static). Portanto, não podemos limitar a --prod aqui.
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts

# Copiar somente artefatos finais
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Garantir permissões para o usuário node
RUN chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
