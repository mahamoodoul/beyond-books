// Generate TypeScript types for every REST schema in the backend OpenAPI document.
// openapi.json is exported from FastAPI (canonical) by scripts/export_openapi.py.
//   npm run api:types | npm run api:check
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "api", "generated");
const spec = JSON.parse(await readFile(join(dir, "openapi.json"), "utf8"));
const schemas = spec.components?.schemas ?? {};

// Rewrite OpenAPI refs to JSON-Schema-local refs so the compiler can resolve them.
const rewrite = (node) => {
  if (Array.isArray(node)) return node.map(rewrite);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === "$ref" ? v.replace("#/components/schemas/", "#/$defs/") : rewrite(v);
    }
    return out;
  }
  return node;
};
const defs = rewrite(schemas);
const root = {
  title: "Api",
  type: "object",
  properties: Object.fromEntries(Object.keys(defs).map((k) => [k, { $ref: `#/$defs/${k}` }])),
  additionalProperties: false,
  $defs: defs,
};
const ts = await compile(root, "Api", {
  bannerComment:
    "/* AUTO-GENERATED from backend OpenAPI — do not edit. Run `npm run api:types`. */",
  additionalProperties: false,
  unreachableDefinitions: true,
  style: { singleQuote: false, semi: true, printWidth: 100 },
});
const out = join(dir, "schema.ts");
if (process.argv.includes("--check")) {
  if (!existsSync(out) || (await readFile(out, "utf8")) !== ts) {
    console.error("stale api types. Run: python scripts/export_openapi.py && npm run api:types");
    process.exit(1);
  }
} else {
  await writeFile(out, ts);
  console.log(`wrote schema.ts (${Object.keys(defs).length} schemas)`);
}
