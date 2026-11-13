import express from "express";
import path from "path";
import { createGate } from "../gate-kit/gate.mjs";
import type { GateEnv, GateOptions } from "../gate-kit/gate.mjs";
import { createNodeGate } from "../gate-kit/gate-node.mjs";
import type { TrustCloudflare } from "../gate-kit/gate-node.mjs";
import { captchaOptions } from "../shared/captcha.ts";

export interface AppOptions {
  /** The built client (dist/public). */
  staticPath: string;
  /** Where the Turnstile keys and GATE_* variables live. Default: process.env. */
  env?: GateEnv | NodeJS.ProcessEnv;
  /** Which socket peers may set CF-Connecting-IP (gate-kit INTEGRATION.md 4(c)). */
  trustCloudflare?: TrustCloudflare;
  /** GATE_LOCAL_DEV=1: test keys from http://localhost on this machine only. */
  localDev?: boolean;
  /** Tests only: a stand-in for Turnstile's siteverify. */
  fetch?: GateOptions["fetch"];
}

/**
 * GATE_TRUST_CLOUDFLARE: empty means the socket address only; "1"/"true"
 * means every request really arrives through Cloudflare; otherwise the
 * comma-separated proxy addresses ("127.0.0.1,::1", "172.17.0.1", "unix")
 * allowed to set CF-Connecting-IP, which they must overwrite.
 */
export function trustCloudflareFromEnv(
  value = process.env.GATE_TRUST_CLOUDFLARE
): TrustCloudflare {
  const v = (value || "").trim();
  if (!v) return false;
  if (v === "1" || v === "true") return true;
  return v
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * The Node twin of worker.ts: the same CAPTCHA wall (PORTAL-STANDARD §10) in
 * front of the same static build, with the same SPA fallback.
 */
export function createApp(options: AppOptions) {
  const { staticPath } = options;
  const app = express();

  const captcha = createGate<GateEnv>({
    ...captchaOptions(),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const wall = createNodeGate(captcha, {
    // Read live, like gate-kit INTEGRATION.md 4(c). The cast is only for
    // TypeScript's weak-type check: ProcessEnv declares none of GateEnv's names.
    env: (options.env ?? process.env) as GateEnv,
    trustCloudflare: options.trustCloudflare ?? false,
    localDev: options.localDev === true,
  });

  // First, ahead of express.static and every route: nothing at all is served
  // before the visitor has solved the CAPTCHA. On a pass the adapter makes
  // whatever follows private (Vary: Cookie, private Cache-Control).
  app.use((req, res, next) => {
    wall(req, res, next).catch(() => {
      // Fail closed: an error in the gate is never a pass.
      if (res.headersSent) return void res.destroy();
      res
        .status(503)
        .type("text/plain")
        .set("Cache-Control", "no-store, private")
        .end("Not available: the CAPTCHA gate failed.");
    });
  });

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  return { app, captcha };
}
