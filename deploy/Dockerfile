FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

# Copy all package.json files (needed for pnpm workspace install)
COPY lib/db/package.json lib/db/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY lib/integrations-openai-ai-react/package.json lib/integrations-openai-ai-react/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/limited-ink/package.json artifacts/limited-ink/

RUN pnpm install --frozen-lockfile

COPY . .

# Build frontend + api-server bundle
RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.cjs"]
