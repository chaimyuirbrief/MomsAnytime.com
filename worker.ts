/* The Cloudflare Worker for momsanytime.com: the CAPTCHA wall in front of the
   static build (PORTAL-STANDARD §10, gate-kit/INTEGRATION.md 4(a)).

   The site itself is still entirely static. This Worker exists only so that
   nothing (no page, asset, robots.txt, favicon or 404) loads before the
   visitor has solved the CAPTCHA. wrangler.jsonc sets
   `assets.run_worker_first: true`, so every request, every method and every
   path, comes here first; the files in dist/public are reachable only through
   env.ASSETS below, after the wall.

   Order in fetch(), as the standard sets it:
     (1) deny list      none: the site has no database
     (2) CAPTCHA wall   captcha.handle(); its answers go back untouched
     (3) detection      none: no scanner/decoy detection or alert mail exists
     (4) the site       the static build, made private to the pass by decorate()
*/
import { createGate } from "./gate-kit/gate.mjs";
import type { GateEnv, GateExecutionContext } from "./gate-kit/gate.mjs";
import { captchaOptions } from "./shared/captcha.ts";

/** The static-assets binding: dist/public with the SPA fallback (wrangler.jsonc). */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface Env extends GateEnv {
  ASSETS: AssetsBinding;
}

export const captcha = createGate<Env>(captchaOptions<Env>());

/**
 * The static file for this request. The binding applies wrangler.jsonc's
 * `not_found_handling: "single-page-application"`, so a client-side route
 * (wouter's "/404", any unknown path) comes back as index.html.
 *
 * With run_worker_first, env.ASSETS.fetch() has been seen not to resolve "/"
 * to "/index.html" in production (gate-kit INTEGRATION.md 4(a)), so a 404 for
 * a GET/HEAD of a directory or an extensionless path is retried as its HTML
 * file. Only a 2xx retry is used: a redirect (the binding's own
 * "/index.html" -> "/" canonicalisation) could loop.
 */
export async function serveAsset(
  request: Request,
  env: Env
): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  if (
    res.status !== 404 ||
    (request.method !== "GET" && request.method !== "HEAD")
  )
    return res;
  const url = new URL(request.url);
  const p = url.pathname;
  const last = p.slice(p.lastIndexOf("/") + 1);
  const tries: string[] = [];
  if (p.endsWith("/")) tries.push(p + "index.html");
  else if (!last.includes(".")) tries.push(p + ".html", p + "/index.html");
  for (const t of tries) {
    const r = await env.ASSETS.fetch(
      new Request(new URL(t, url.origin), request)
    );
    if (r.ok) return r;
  }
  return res;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: GateExecutionContext
  ): Promise<Response> {
    const blocked = await captcha.handle(request, env, ctx);
    if (blocked) return blocked;
    return captcha.decorate(await serveAsset(request, env));
  },
};
