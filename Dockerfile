FROM node:20-alpine AS builder

WORKDIR /app

ENV HUSKY=0
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm@10.29.3
RUN pnpm --version
RUN echo 'dangerouslyAllowAllBuiltScripts=true' > .npmrc
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.server.json tsconfig.build.json ./
COPY vite.config.ts ./
COPY instrument.ts ./
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY packages ./packages

RUN pnpm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV HUSKY=0
ENV NODE_ENV=production
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY --chown=node:node package.json pnpm-lock.yaml ./

RUN npm install -g pnpm@10.29.3
RUN pnpm --version
RUN echo 'dangerouslyAllowAllBuiltScripts=true' > .npmrc
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
RUN pnpm rebuild

COPY --from=builder --chown=node:node /app/dist ./dist

RUN mkdir -p /app/logs && chown -R node:node /app/logs

USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
