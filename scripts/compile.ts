import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileContracts } from "../src/compile.js";

const artifacts = compileContracts();
const artifactsDirectory = join(process.cwd(), "artifacts");
mkdirSync(artifactsDirectory, { recursive: true });

for (const [name, artifact] of Object.entries(artifacts)) {
  writeFileSync(join(artifactsDirectory, `${name}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
}

console.log(`Compiled ${Object.keys(artifacts).length} deployable contracts.`);
