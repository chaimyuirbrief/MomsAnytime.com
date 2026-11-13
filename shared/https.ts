import { canonicalIp, isLoopbackHost } from "../gate-kit/gate.mjs";

/**
 * Plain http:// visitors are sent to https:// before the CAPTCHA wall.
 *
 * The wall's pass is a `__Host-` cookie, which is always `Secure`, and a
 * browser refuses to store a Secure cookie from an http:// response. Without
 * this redirect a visitor on http://momsanytime.com (an old bookmark, a QR
 * code, an in-app browser that doesn't upgrade on its own) would solve the
 * challenge, get the cookie dropped, and be shown the challenge again forever.
 *
 * The redirect carries no site content, so it may run ahead of the wall
 * (gate-kit/INTEGRATION.md §3). Loopback hosts (`wrangler dev`, a developer's
 * http://localhost) are left alone: browsers treat them as secure, so the
 * pass is stored there. So is a loopback client: plain `wrangler dev` (without
 * `--local-upstream localhost`) rewrites each request to
 * http://momsanytime.com/... and each Location back to http://localhost, which
 * would loop; Cloudflare never sends a loopback CF-Connecting-IP.
 */

// The Host header forms the kit itself accepts (gate-node.mjs toWebRequest),
// minus IP-literal IPv6, which a public site is never reached on.
const HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

/**
 * The https:// URL to send this request to, or null when it needs no redirect.
 *   protocol  the visitor's scheme: "http:" / "http" (URL.protocol) or "https"
 *   host      the request's host, with or without a port
 *   target    the path and query, starting with "/"
 */
export function httpsLocation(
  protocol: string,
  host: string,
  target: string
): string | null {
  if (protocol.replace(/:$/, "").toLowerCase() !== "http") return null;
  if (!HOST.test(host) || isLoopbackHost(host)) return null;
  // Only an origin-form target, all printable ASCII (URL.pathname/search
  // already are): anything else is left to the wall, which refuses it.
  if (!target.startsWith("/") || /[^\x21-\x7e]/.test(target)) return null;
  // Drop the port: an http port is never the https one.
  const hostname = host.replace(/:\d{1,5}$/, "").toLowerCase();
  return `https://${hostname}${target}`;
}

/** True for a loopback client address (127.0.0.0/8, ::1, ::ffff:127.x). */
export function isLoopbackClient(ip: string | null | undefined): boolean {
  const v = canonicalIp(ip ?? "");
  return v === "::1" || /^127\./.test(v);
}

/** 301 for GET/HEAD; 308 for the rest, so a POST stays a POST. */
export function httpsRedirectStatus(method: string): 301 | 308 {
  return method === "GET" || method === "HEAD" ? 301 : 308;
}

/**
 * Not cached: HSTS (an owner setting in the Cloudflare dashboard) is the way
 * to make the upgrade stick, and an uncached redirect can't outlive a mistake.
 */
export const HTTPS_REDIRECT_CACHE_CONTROL = "no-store, private";
