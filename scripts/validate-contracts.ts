import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

await SwaggerParser.validate("packages/contracts/openapi/openapi.json");

const schemaDirectory = "schemas";
const schemaFiles = (await readdir(schemaDirectory)).filter((file) => file.endsWith(".json"));
for (const file of schemaFiles) {
  const schema = JSON.parse(await readFile(join(schemaDirectory, file), "utf8")) as object;
  ajv.compile(schema);
}

console.warn(`Validated OpenAPI and ${schemaFiles.length} JSON Schemas.`);
