FROM node:24.19.0-bookworm-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile

ARG CBC_APP
ENV CBC_APP=${CBC_APP}
RUN pnpm --filter "@cbc/${CBC_APP}..." build

CMD ["sh", "-c", "pnpm --filter @cbc/${CBC_APP} start"]
