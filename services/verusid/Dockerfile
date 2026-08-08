# syntax=docker/dockerfile:1.7
FROM node:24.19.0-bookworm-slim AS dependencies

ARG VERUSID_TS_CLIENT_COMMIT=48a1d48a5d076f313022a5891986339851ad7c0c
ARG VERUS_PRIMITIVES_COMMIT=30c951804228a285546a45457be57ead39d90888
ARG VERUSD_RPC_CLIENT_COMMIT=fd2c6b0d35d468ee6174bcdd569f5aa990b05282
ARG VERUS_BITGO_COMMIT=7c754d4a5920198d9fe6827d3e23bd5cf431f264
ARG VERUS_BLAKE2B_COMMIT=578dc12b7b68a3ce76d1e1add1402b28a5890a6b

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY vendor/bitcoin-ops /tmp/bitcoin-ops
RUN git clone https://github.com/VerusCoin/BitGoJS.git /tmp/bitgojs \
    && git -C /tmp/bitgojs checkout "${VERUS_BITGO_COMMIT}" \
    && git clone https://github.com/VerusCoin/verus-typescript-primitives.git /tmp/primitives \
    && git -C /tmp/primitives checkout "${VERUS_PRIMITIVES_COMMIT}" \
    && git clone https://github.com/VerusCoin/verusd-rpc-ts-client.git /tmp/rpc-client \
    && git -C /tmp/rpc-client checkout "${VERUSD_RPC_CLIENT_COMMIT}" \
    && git clone https://github.com/VerusCoin/verusid-ts-client.git /tmp/verusid-client \
    && git -C /tmp/verusid-client checkout "${VERUSID_TS_CLIENT_COMMIT}"

# Replace every moving Git dependency with the exact checked-out source or commit.
RUN node - <<'NODE'
const fs = require('node:fs');
const securityOverrides = {
  axios: '1.19.0',
  'base-x': '3.0.11',
  'brace-expansion': '1.1.18',
  'cipher-base': '1.0.5',
  elliptic: '6.6.1',
  'form-data': '4.0.6',
  'ip-address': '10.3.1',
  secp256k1: '3.8.1',
  'sha.js': '2.4.12',
  tar: '7.5.19',
  'tiny-secp256k1': '1.1.7',
  undici: '6.27.0',
};
function applySecurityOverrides(pkg) {
  if (pkg.dependencies?.axios) pkg.dependencies.axios = securityOverrides.axios;
  pkg.overrides = { ...pkg.overrides, ...securityOverrides };
}
function update(path, transform) {
  const value = JSON.parse(fs.readFileSync(path, 'utf8'));
  transform(value);
  delete value.devDependencies;
  delete value.optionalDependencies;
  delete value.resolutions;
  delete value.scripts;
  fs.writeFileSync(path, JSON.stringify(value, null, 2));
}
update('/tmp/bitgojs/package.json', pkg => {
  applySecurityOverrides(pkg);
});
update('/tmp/primitives/package.json', pkg => {
  pkg.dependencies.blake2b = `git+https://github.com/VerusCoin/blake2b.git#${process.env.VERUS_BLAKE2B_COMMIT || '578dc12b7b68a3ce76d1e1add1402b28a5890a6b'}`;
  applySecurityOverrides(pkg);
});
update('/tmp/rpc-client/package.json', pkg => {
  pkg.dependencies.blake2b = `git+https://github.com/VerusCoin/blake2b.git#${process.env.VERUS_BLAKE2B_COMMIT || '578dc12b7b68a3ce76d1e1add1402b28a5890a6b'}`;
  pkg.dependencies['verus-typescript-primitives'] = 'file:/tmp/primitives';
  applySecurityOverrides(pkg);
});
update('/tmp/verusid-client/package.json', pkg => {
  pkg.dependencies['@bitgo/utxo-lib'] = 'file:/tmp/bitgojs';
  pkg.dependencies['verus-typescript-primitives'] = 'file:/tmp/primitives';
  pkg.dependencies['verusd-rpc-ts-client'] = 'file:/tmp/rpc-client';
  applySecurityOverrides(pkg);
});
NODE

RUN cd /tmp/bitgojs \
    && npm install --omit=dev --ignore-scripts --legacy-peer-deps \
    && cd /tmp/primitives \
    && npm install --omit=dev --ignore-scripts --legacy-peer-deps \
    && cd /tmp/rpc-client \
    && npm install --omit=dev --ignore-scripts --legacy-peer-deps \
    && cd /tmp/verusid-client \
    && npm install --omit=dev --ignore-scripts --legacy-peer-deps

RUN mkdir -p /app/node_modules/@bitgo \
    && if [ -d /tmp/bitgojs/modules/utxo-lib ]; then \
         cp -a /tmp/bitgojs/modules/utxo-lib /app/node_modules/@bitgo/utxo-lib; \
       elif [ -d /tmp/bitgojs/packages/utxo-lib ]; then \
         cp -a /tmp/bitgojs/packages/utxo-lib /app/node_modules/@bitgo/utxo-lib; \
       else \
         cp -a /tmp/bitgojs /app/node_modules/@bitgo/utxo-lib; \
       fi \
    && cp -rL /tmp/primitives /app/node_modules/verus-typescript-primitives \
    && cp -rL /tmp/rpc-client /app/node_modules/verusd-rpc-ts-client \
    && cp -rL /tmp/verusid-client /app/node_modules/verusid-ts-client \
    && rm -rf /app/node_modules/@bitgo/utxo-lib/.git \
              /app/node_modules/verus-typescript-primitives/.git \
              /app/node_modules/verusd-rpc-ts-client/.git \
              /app/node_modules/verusid-ts-client/.git \
    && rm -rf /app/node_modules/bitcoin-ops \
    && cp -r /tmp/bitcoin-ops /app/node_modules/bitcoin-ops \
    && find /app/node_modules -type d -name utxo-lib -path '*/@bitgo/utxo-lib' -print0 \
       | xargs -0 -r -I{} sh -c 'mkdir -p "{}/node_modules"; rm -rf "{}/node_modules/bitcoin-ops"; cp -r /tmp/bitcoin-ops "{}/node_modules/bitcoin-ops"'

RUN node -e "const sdk=require('verusid-ts-client'); if(typeof sdk.VerusIdInterface!=='function') process.exit(1)"

FROM node:24.19.0-bookworm-slim AS runtime
ARG SERVICE_SOURCE_REVISION
ARG VERUSID_TS_CLIENT_COMMIT=48a1d48a5d076f313022a5891986339851ad7c0c
ARG VERUS_PRIMITIVES_COMMIT=30c951804228a285546a45457be57ead39d90888
ARG VERUSD_RPC_CLIENT_COMMIT=fd2c6b0d35d468ee6174bcdd569f5aa990b05282
ARG VERUS_BITGO_COMMIT=7c754d4a5920198d9fe6827d3e23bd5cf431f264

LABEL org.opencontainers.image.source="https://github.com/constitutionalmoney/checks-and-balances-app" \
      org.opencontainers.image.revision="${SERVICE_SOURCE_REVISION}" \
      money.constitution.cbc.verusid-ts-client="${VERUSID_TS_CLIENT_COMMIT}" \
      money.constitution.cbc.verus-primitives="${VERUS_PRIMITIVES_COMMIT}" \
      money.constitution.cbc.verusd-rpc-client="${VERUSD_RPC_CLIENT_COMMIT}" \
      money.constitution.cbc.verus-bitgo="${VERUS_BITGO_COMMIT}"

ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
              /usr/local/lib/node_modules/npm \
              /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm \
             /usr/local/bin/npx \
             /usr/local/bin/corepack \
             /usr/local/bin/yarn \
             /usr/local/bin/yarnpkg \
             /usr/local/bin/pnpm \
             /usr/local/bin/pnpx
RUN groupadd --system --gid 10001 verusid \
    && useradd --system --uid 10001 --gid verusid --home-dir /app verusid
COPY --from=dependencies --chown=verusid:verusid /app/node_modules ./node_modules
COPY --chown=verusid:verusid package.json package-lock.json ./
COPY --chown=verusid:verusid src ./src
USER 10001:10001
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
