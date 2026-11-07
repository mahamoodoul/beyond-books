// Generate TypeScript types for the 3D contracts from packages/three-d-contracts/schemas.
// The JSON Schemas are themselves generated from the canonical backend Pydantic models.
//   npm run contracts:types   -> write
//   npm run contracts:check   -> fail if stale (CI)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "..", "..", "packages", "three-d-contracts", "schemas");
const outDir = join(here, "..", "src", "features", "three-d", "schemas", "generated");
const targets = [
  ["scene.schema.json", "scene.ts"],
  ["animation.schema.json", "animation.ts"],
];
const banner = "/* AUTO-GENERATED from packages/three-d-contracts — do not edit. Run `npm run contracts:types`. */";
const check = process.argv.includes("--check");
const stale = [];

await mkdir(outDir, { recursive: true });
for (const [schemaFile, outFile] of targets) {
  const schema = JSON.parse(await readFile(join(schemaDir, schemaFile), "utf8"));
  const ts = await compile(schema, schema.title, {
    bannerComment: banner,
    additionalProperties: false,
    style: { singleQuote: false, semi: true, printWidth: 100 },
  });
  const path = join(outDir, outFile);
  if (check) {
    if (!existsSync(path) || (await readFile(path, "utf8")) !== ts) stale.push(outFile);
  } else {
    await writeFile(path, ts);
    console.log(`wrote ${outFile}`);
  }
}
if (stale.length) {
  console.error(`stale contract types: ${stale.join(", ")}. Run: npm run contracts:types`);
  process.exit(1);
}
