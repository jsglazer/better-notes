/**
 * Bundle the pure (Zotero-free) modules under test into CJS in test/.bundles/,
 * so the node:test files in test/unit/ can `require()` them. Run by `npm test`
 * (and in CI) before `node --test`. Mirrors what the modules import at runtime
 * via esbuild; no typechecking here (that's `tsc --noEmit`).
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = fileURLToPath(new URL("./.bundles", import.meta.url));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  format: "cjs",
  platform: "node",
  logLevel: "warning",
};

// Single-module bundles: [source entry, output file].
const targets = [
  ["src/utils/annotationGroup.ts", "annotationGroup.cjs"],
  ["src/utils/seededRandom.ts", "seededRandom.cjs"],
  ["src/modules/sync/merge.ts", "merge.cjs"],
  ["src/modules/template/filters.ts", "filters.cjs"],
  ["src/modules/template/model.ts", "model.cjs"],
  ["src/modules/template/directives.ts", "directives.cjs"],
  ["src/modules/template/engine.ts", "engine.cjs"],
  ["src/modules/template/legacyConvert.ts", "legacyConvert.cjs"],
  ["src/modules/template/completions.ts", "completions.cjs"],
  ["src/extras/convert.ts", "convert.cjs"],
];

for (const [entry, out] of targets) {
  await build({
    ...common,
    entryPoints: [root + entry],
    outfile: `${outDir}/${out}`,
  });
}

// The worker RPC test exercises both halves (main + worker), which share the
// protocol module — bundle them together via a generated entry so they do.
const workerEntry = `${outDir}/_workerEntry.ts`;
writeFileSync(
  workerEntry,
  `export { WorkerRpc } from "${root}src/utils/workerRpc";\n` +
    `export { serveWorker } from "${root}src/extras/lib/serveWorker";\n`,
);
await build({
  ...common,
  entryPoints: [workerEntry],
  outfile: `${outDir}/worker.cjs`,
});
rmSync(workerEntry, { force: true });

console.log("bundled test modules → test/.bundles/");
