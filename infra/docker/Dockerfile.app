FROM node:24.22.1-bookworm-slim AS base

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile

ARG CBC_APP
RUN pnpm --filter "@cbc/${CBC_APP}..." build

FROM debian:bookworm-slim AS runtime

WORKDIR /workspace

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates libatomic1 libstdc++6 openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/local/bin/node /usr/local/bin/node

ARG CBC_APP
ENV CBC_APP=${CBC_APP}
ENV NODE_ENV=production
RUN groupadd --system --gid 10001 cbc \
  && useradd --system --uid 10001 --gid cbc --home-dir /workspace cbc
COPY --from=build --chown=cbc:cbc /workspace /workspace
USER 10001:10001

CMD ["sh", "-c", "if [ \"${CBC_APP}\" = \"api\" ] || [ \"${CBC_APP}\" = \"worker\" ]; then exec node \"apps/${CBC_APP}/dist/main.js\"; else cd \"apps/${CBC_APP}\" && exec node node_modules/next/dist/bin/next start; fi"]
