FROM node:24.19.0-bookworm-slim AS base

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

FROM base AS runtime

ARG CBC_APP
ENV CBC_APP=${CBC_APP}
COPY --from=build /workspace /workspace

CMD ["sh", "-c", "if [ \"${CBC_APP}\" = \"api\" ] || [ \"${CBC_APP}\" = \"worker\" ]; then exec node \"apps/${CBC_APP}/dist/main.js\"; else cd \"apps/${CBC_APP}\" && exec node node_modules/next/dist/bin/next start; fi"]
