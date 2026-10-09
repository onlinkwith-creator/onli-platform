import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";

export async function loadPolicyBundle() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const result = await build({
    root,
    configFile: false,
    logLevel: "error",
    ssr: { noExternal: true },
    plugins: [react()],
    build: {
      ssr: `${root}scripts/fixtures/policy-render-entry.mjs`,
      write: false,
      minify: false,
      rolldownOptions: { output: { codeSplitting: false, format: "cjs" } },
    },
  });
  const chunk = result.output.find((file) => file.type === "chunk" && file.isEntry);
  if (!chunk) throw new Error("Missing policy bundle");
  const bundledModule = { exports: {} };
  runInThisContext(`(function(require, module, exports) {\n${chunk.code}\n})`, {
    filename: "policy-test-bundle.cjs",
  })(createRequire(import.meta.url), bundledModule, bundledModule.exports);
  return bundledModule.exports;
}
