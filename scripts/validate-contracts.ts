import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  CBC_ANCHOR_MANIFEST_V1_POLICY,
  CBC_VRSCTEST_NAMESPACE,
} from "../packages/verus/src/approved-fixtures.ts";
import {
  canonicalizeJson,
  prepareCanonicalPayload,
} from "../packages/verus/src/canonical-content.ts";
import type { JsonObject } from "../packages/verus/src/types.ts";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

await SwaggerParser.validate("packages/contracts/openapi/openapi.json");

const schemaDirectory = "schemas";
const schemaFiles = (await readdir(schemaDirectory)).filter((file) => file.endsWith(".json"));
const compiledSchemas = new Map<string, ReturnType<typeof ajv.compile>>();
for (const file of schemaFiles) {
  const schema = JSON.parse(await readFile(join(schemaDirectory, file), "utf8")) as object;
  compiledSchemas.set(file, ajv.compile(schema));
}

interface AnchorManifestFixture {
  readonly fixture: string;
  readonly payload: JsonObject & {
    readonly artifact: JsonObject & { readonly path: string; readonly sha256: string };
  };
  readonly expected: {
    readonly canonicalization: string;
    readonly byteLength: number;
    readonly sha256: string;
  };
}

interface VdxfNamespaceFixture {
  readonly owner: { readonly identityAddress: string };
  readonly keys: readonly { readonly uri: string; readonly vdxfId: string }[];
}

const anchorFixture = JSON.parse(
  await readFile("fixtures/verus/cbc-anchor-manifest.v1.fixture.json", "utf8"),
) as AnchorManifestFixture;
const manifestValidator = compiledSchemas.get("cbc-anchor-manifest.v1.schema.json");
if (!manifestValidator?.(anchorFixture.payload)) {
  throw new Error(
    `Anchor manifest fixture is invalid: ${JSON.stringify(manifestValidator?.errors)}`,
  );
}
const preparedManifest = prepareCanonicalPayload(
  anchorFixture.payload,
  CBC_ANCHOR_MANIFEST_V1_POLICY,
);
if (
  anchorFixture.expected.canonicalization !== "cbc-json-v1" ||
  anchorFixture.expected.byteLength !== preparedManifest.bytes.byteLength ||
  anchorFixture.expected.sha256 !== preparedManifest.digest
) {
  throw new Error("Anchor manifest canonical bytes or digest do not match the fixture");
}

const artifact = JSON.parse(
  await readFile(anchorFixture.payload.artifact.path, "utf8"),
) as JsonObject;
const artifactDigest = createHash("sha256")
  .update(canonicalizeJson(artifact), "utf8")
  .digest("hex");
if (artifactDigest !== anchorFixture.payload.artifact.sha256) {
  throw new Error("Anchor manifest artifact digest does not match the canonical repository file");
}

const namespaceFixture = JSON.parse(
  await readFile("fixtures/verus/vrsctest-vdxf-v1.json", "utf8"),
) as VdxfNamespaceFixture;
const approvedKeys = Object.values(CBC_VRSCTEST_NAMESPACE.keys);
if (
  namespaceFixture.owner.identityAddress !== CBC_VRSCTEST_NAMESPACE.ownerIdentityAddress ||
  namespaceFixture.keys.length !== approvedKeys.length ||
  approvedKeys.some(
    (approved) =>
      !namespaceFixture.keys.some(
        (fixture) => fixture.uri === approved.uri && fixture.vdxfId === approved.vdxfId,
      ),
  )
) {
  throw new Error("VDXF namespace JSON fixture and server allowlist constants have drifted");
}

console.warn(
  `Validated OpenAPI, ${schemaFiles.length} JSON Schemas, and deterministic VRSCTEST fixtures.`,
);
