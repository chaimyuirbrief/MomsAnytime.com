import type { GateEnv, GateOptions } from "../gate-kit/gate.mjs";

/**
 * The CAPTCHA wall's options (PORTAL-STANDARD §10, gate-kit/INTEGRATION.md),
 * shared by the Cloudflare Worker (`worker.ts`) and the Node server
 * (`server/app.ts`) so the two runtimes can't drift.
 *
 * No hooks, on purpose: the site has no database, settings or console.
 * - no `getSetting`: a pass lasts the kit's default 12 hours;
 * - no `onStats` / `onEvent`: counts stay in memory (`captcha.stats()`);
 * - no `exempt`: there are no machine clients, so every request needs a pass.
 */
export function captchaOptions<E extends GateEnv = GateEnv>(): GateOptions<E> {
  // "Checking that you're human before loading For All the Moms."
  // The domain shown above it is the request's own host.
  return { siteName: "For All the Moms" };
}
