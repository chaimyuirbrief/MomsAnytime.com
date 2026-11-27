// `pnpm dev` and `pnpm preview` run Vite, not worker.ts, so they serve the
// whole site with no CAPTCHA wall. They must listen on this machine only:
// bound to every interface, anyone on the same network could load the site
// without solving anything. This starts both for real and checks the address
// each one actually listens on.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, preview } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(root, "vite.config.ts");
const LOOPBACK = new Set(["127.0.0.1", "::1"]);

const outDir = mkdtempSync(path.join(os.tmpdir(), "moms-preview-"));
writeFileSync(
  path.join(outDir, "index.html"),
  "<!doctype html><title>t</title>"
);
after(() => rmSync(outDir, { recursive: true, force: true }));

test("the dev and preview scripts don't ask for every interface", () => {
  const { scripts } = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8")
  );
  for (const name of ["dev", "preview"]) {
    assert.ok(scripts[name], name);
    assert.doesNotMatch(scripts[name], /--host\b|0\.0\.0\.0|::(?!1)/, name);
  }
});

test("pnpm dev (the Vite dev server) listens on loopback only", async () => {
  const server = await createServer({
    configFile,
    logLevel: "silent",
    clearScreen: false,
    server: { port: 0, strictPort: true, watch: null },
  });
  try {
    await server.listen();
    const { address } = server.httpServer.address();
    assert.ok(LOOPBACK.has(address), `listening on ${address}`);
  } finally {
    await server.close();
  }
});

test("pnpm preview listens on loopback only", async () => {
  const server = await preview({
    configFile,
    logLevel: "silent",
    clearScreen: false,
    build: { outDir },
    preview: { port: 0, strictPort: true, open: false },
  });
  try {
    const { address } = server.httpServer.address();
    assert.ok(LOOPBACK.has(address), `listening on ${address}`);
  } finally {
    await new Promise(resolve => server.httpServer.close(resolve));
  }
});
