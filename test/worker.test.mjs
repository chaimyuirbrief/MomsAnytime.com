// The Cloudflare Worker (worker.ts): the CAPTCHA wall in front of the static
// build (PORTAL-STANDARD §10). `pnpm test` runs this with tsx, against a
// stubbed ASSETS binding that behaves like wrangler.jsonc's
// `not_found_handling: "single-page-application"`. No network: siteverify is
// stubbed and any other outbound fetch fails the test.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { captcha, serveAsset } from "../worker.ts";
import {
  SITEVERIFY_URL,
  VERIFY_PATH,
  PASS_COOKIE,
  MSG_NOT_CONFIGURED,
  gateStatus,
} from "../gate-kit/gate.mjs";

const HOST = "momsanytime.com";
const IP = "203.0.113.7";
const UA = "Mozilla/5.0 (Test) MomsAnytime/1.0";
const HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
// Real-looking keys: Cloudflare's always-pass test keys are refused off localhost.
const KEYS = Object.freeze({
  TURNSTILE_SITE_KEY: "0x4AAAAAAAmomsSITEkeyTESTS",
  TURNSTILE_SECRET_KEY: "0x4AAAAAAAmomsSECRETkeyFORtestsONLY",
});
const SITE_HTML =
  '<!doctype html><title>For All the Moms — A Living Thank-You</title><div id="root"></div>';

/** dist/public as the binding serves it, with the SPA fallback for unknown paths. */
function spaAssets() {
  const files = {
    "/index.html": ["text/html; charset=utf-8", SITE_HTML],
    "/assets/index-abc123.js": [
      "text/javascript; charset=utf-8",
      "console.log('app')",
    ],
    "/assets/index-abc123.css": ["text/css; charset=utf-8", "body{}"],
    "/media/for-all-moms-seal.svg": [
      "image/svg+xml",
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
    ],
  };
  const calls = [];
  return {
    calls,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      calls.push(`${request.method} ${pathname}`);
      const [type, body] =
        files[pathname === "/" ? "/index.html" : pathname] ||
        files["/index.html"];
      return new Response(request.method === "HEAD" ? null : body, {
        status: 200,
        headers: {
          "Content-Type": type,
          "Cache-Control": "public, max-age=0, must-revalidate",
          ETag: '"x"',
        },
      });
    },
  };
}

let siteverifyCalls;
let otherFetches;
const realFetch = globalThis.fetch;
beforeEach(() => {
  siteverifyCalls = [];
  otherFetches = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url !== SITEVERIFY_URL) {
      otherFetches.push(url);
      throw new Error(`unexpected outbound fetch ${url}`);
    }
    const params = Object.fromEntries(new URLSearchParams(String(init.body)));
    siteverifyCalls.push(params);
    const ok = params.response === "good.token_123";
    return Response.json(
      ok
        ? { success: true, hostname: HOST, action: "gate", "error-codes": [] }
        : { success: false, "error-codes": ["invalid-input-response"] }
    );
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ctx = { waitUntil() {} };

function req(
  path,
  {
    method = "GET",
    accept,
    cookie,
    ip = IP,
    host = HOST,
    headers = {},
    body,
  } = {}
) {
  const h = new Headers(headers);
  h.set("cf-connecting-ip", ip);
  h.set("user-agent", UA);
  if (accept) h.set("accept", accept);
  if (cookie) h.set("cookie", cookie);
  return new Request(`https://${host}${path}`, {
    method,
    headers: h,
    ...(body !== undefined ? { body } : {}),
  });
}

function envWith(extra = {}) {
  const ASSETS = spaAssets();
  return { env: { ...KEYS, ASSETS, ...extra }, ASSETS };
}

async function passCookie(env, { ip = IP, ret = "/" } = {}) {
  const res = await worker.fetch(
    req(VERIFY_PATH, {
      method: "POST",
      ip,
      accept: HTML,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: `https://${HOST}`,
      },
      body: `token=good.token_123&return=${encodeURIComponent(ret)}`,
    }),
    env,
    ctx
  );
  assert.equal(res.status, 303);
  return res.headers.get("set-cookie").split(";")[0];
}

// Every kind of request the site gets: pages, client routes, static files,
// robots.txt, favicon, and the API/console/scanner paths the site doesn't have.
const NAVIGATIONS = ["/", "/404", "/no-such-page", "/?ref=newsletter"];
const NON_NAVIGATIONS = [
  ["GET", "/assets/index-abc123.js", "*/*"],
  ["GET", "/assets/index-abc123.css", "text/css,*/*;q=0.1"],
  [
    "GET",
    "/media/for-all-moms-seal.svg",
    "image/avif,image/webp,image/svg+xml,*/*;q=0.8",
  ],
  ["GET", "/robots.txt", "*/*"],
  ["GET", "/favicon.ico", "image/*"],
  ["GET", "/api/status", "application/json"],
  ["GET", "/admin/api/overview", "application/json"],
  ["GET", "/no-such-file.js", "*/*"],
  ["POST", "/", "*/*"],
  ["OPTIONS", "/", "*/*"],
];
const SCANNERS = [
  "/.env",
  "/wp-login.php",
  "/.git/config",
  "/wp-admin/",
  "/phpmyadmin/",
  "/?q=%27%20OR%201%3D1--",
  "/?x=%3Cscript%3Ealert(1)%3C/script%3E",
];

describe("without a pass nothing loads", () => {
  test("a navigation to any path gets the challenge page, 403, and no site content", async () => {
    const { env, ASSETS } = envWith();
    for (const path of NAVIGATIONS) {
      for (const method of ["GET", "HEAD"]) {
        const res = await worker.fetch(
          req(path, { method, accept: HTML }),
          env,
          ctx
        );
        assert.equal(res.status, 403, `${method} ${path}`);
        assert.match(res.headers.get("content-type"), /^text\/html/);
        assert.equal(res.headers.get("cache-control"), "no-store, private");
        assert.match(res.headers.get("x-robots-tag"), /noindex/);
        // The challenge's own nonce CSP comes back untouched.
        assert.match(
          res.headers.get("content-security-policy"),
          /script-src 'nonce-[^']+' https:\/\/challenges\.cloudflare\.com/
        );
        const body = await res.text();
        if (method === "GET") {
          assert.match(
            body,
            /Checking that you(&#39;|')re human before loading For All the Moms\./
          );
          assert.doesNotMatch(body, /id="root"/);
        } else {
          assert.equal(body, "");
        }
      }
    }
    assert.deepEqual(ASSETS.calls, [], "no file was read");
  });

  test("assets, robots.txt, favicon, API and console paths, POST and OPTIONS get the 403 JSON", async () => {
    const { env, ASSETS } = envWith();
    for (const [method, path, accept] of NON_NAVIGATIONS) {
      const res = await worker.fetch(
        req(path, {
          method,
          accept,
          headers: { origin: "https://evil.example" },
        }),
        env,
        ctx
      );
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.match(res.headers.get("content-type"), /^application\/json/);
      assert.equal(res.headers.get("cache-control"), "no-store, private");
      assert.equal(res.headers.get("access-control-allow-origin"), null);
      assert.deepEqual(await res.json(), {
        ok: false,
        code: "captcha_required",
        error: `Complete the CAPTCHA at https://${HOST}/ first.`,
      });
    }
    assert.deepEqual(ASSETS.calls, []);
  });

  test("scanner and injection probes are silent: a 403, a counter, and nothing else runs", async () => {
    // The site has no alert mail, audit log, deny list or visitor log at all;
    // this proves no site code, file read or outbound call happens either.
    const { env, ASSETS } = envWith();
    const before = captcha.stats().totals;
    let n = 0;
    for (const path of SCANNERS) {
      for (const accept of [HTML, "*/*"]) {
        const res = await worker.fetch(req(path, { accept }), env, ctx);
        assert.equal(res.status, 403, path);
        n++;
      }
    }
    assert.deepEqual(ASSETS.calls, [], "no file was read");
    assert.deepEqual(siteverifyCalls, []);
    assert.deepEqual(
      otherFetches,
      [],
      "no outbound request (no mail, no webhook)"
    );
    const after = captcha.stats().totals;
    const counted =
      (after.challenge_served || 0) -
      (before.challenge_served || 0) +
      (after.blocked || 0) -
      (before.blocked || 0);
    assert.equal(counted, n, "each probe is only counted");
  });

  test("there is no machine-client exemption: client-looking paths need a pass too", async () => {
    const { env, ASSETS } = envWith();
    for (const path of [
      "/client/heartbeat",
      "/manifest.json",
      "/packages/app.msi",
      "/api/v1/sync",
    ]) {
      const r = req(path, {
        method: path === "/client/heartbeat" ? "POST" : "GET",
      });
      const res = await worker.fetch(r, env, ctx);
      assert.equal(res.status, 403, path);
      assert.equal(captcha.exemptionOf(r), null);
    }
    assert.deepEqual(ASSETS.calls, []);
  });
});

describe("verify and the pass", () => {
  test("verify answers 303 to the return path with the pass cookie", async () => {
    const { env } = envWith();
    const res = await worker.fetch(
      req(VERIFY_PATH, {
        method: "POST",
        accept: HTML,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: `https://${HOST}`,
        },
        body: "token=good.token_123&return=%2Fno-such-page%3Fref%3Dx",
      }),
      env,
      ctx
    );
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/no-such-page?ref=x");
    const set = res.headers.get("set-cookie");
    assert.match(set, new RegExp(`^${PASS_COOKIE}=v1\\.`));
    for (const attr of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"])
      assert.ok(set.includes(attr), attr);
    assert.doesNotMatch(set, /Domain=/i);
    assert.equal(siteverifyCalls.length, 1);
    assert.equal(siteverifyCalls[0].secret, KEYS.TURNSTILE_SECRET_KEY);
    assert.equal(siteverifyCalls[0].remoteip, IP);
  });

  test("a rejected token gets the challenge again and no cookie", async () => {
    const { env, ASSETS } = envWith();
    const res = await worker.fetch(
      req(VERIFY_PATH, {
        method: "POST",
        accept: HTML,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: `https://${HOST}`,
        },
        body: "token=bad.token&return=%2F",
      }),
      env,
      ctx
    );
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("set-cookie"), null);
    assert.deepEqual(ASSETS.calls, []);
  });

  test("with a pass every request class is served, privately", async () => {
    const { env, ASSETS } = envWith();
    const cookie = await passCookie(env);
    for (const path of NAVIGATIONS) {
      const res = await worker.fetch(
        req(path, { accept: HTML, cookie }),
        env,
        ctx
      );
      assert.equal(res.status, 200, path);
      assert.equal(
        await res.text(),
        SITE_HTML,
        `${path}: index.html (SPA fallback for client routes)`
      );
      assert.match(res.headers.get("vary"), /Cookie/);
      assert.match(res.headers.get("cache-control"), /^private\b/);
    }
    const expectType = {
      "/assets/index-abc123.js": /^text\/javascript/,
      "/assets/index-abc123.css": /^text\/css/,
      "/media/for-all-moms-seal.svg": /^image\/svg\+xml/,
    };
    for (const [method, path, accept] of NON_NAVIGATIONS) {
      const res = await worker.fetch(
        req(path, { method, accept, cookie }),
        env,
        ctx
      );
      assert.equal(res.status, 200, `${method} ${path}`);
      assert.match(
        res.headers.get("content-type"),
        expectType[path] || /^text\/html/,
        path
      );
      assert.match(res.headers.get("vary"), /Cookie/);
      assert.equal(
        res.headers.get("cache-control"),
        "private, max-age=0, must-revalidate"
      );
    }
    assert.ok(ASSETS.calls.includes("GET /"));
    assert.ok(ASSETS.calls.includes("GET /assets/index-abc123.js"));
  });

  test("the pass is bound to the visitor's IP address", async () => {
    const { env } = envWith();
    const cookie = await passCookie(env);
    const res = await worker.fetch(
      req("/", { accept: HTML, cookie, ip: "198.51.100.20" }),
      env,
      ctx
    );
    assert.equal(res.status, 403);
  });
});

describe("configuration", () => {
  test("missing keys: every request gets the plain 503, nothing else", async () => {
    for (const keys of [
      {},
      { TURNSTILE_SITE_KEY: KEYS.TURNSTILE_SITE_KEY },
      { TURNSTILE_SECRET_KEY: KEYS.TURNSTILE_SECRET_KEY },
    ]) {
      const ASSETS = spaAssets();
      const env = { ...keys, ASSETS };
      for (const [method, path, accept] of [
        ["GET", "/", HTML],
        ...NON_NAVIGATIONS,
        ["POST", VERIFY_PATH, HTML],
      ]) {
        const res = await worker.fetch(req(path, { method, accept }), env, ctx);
        assert.equal(res.status, 503, `${method} ${path}`);
        assert.match(res.headers.get("content-type"), /^text\/plain/);
        assert.equal(await res.text(), MSG_NOT_CONFIGURED);
      }
      assert.deepEqual(ASSETS.calls, []);
      assert.equal(gateStatus(env).ok, false);
      assert.equal(gateStatus(env).state, "not_configured");
    }
  });

  test("Cloudflare's always-pass test keys are refused on the real host", async () => {
    const ASSETS = spaAssets();
    const env = {
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      ASSETS,
    };
    for (const host of [HOST, `www.${HOST}`]) {
      const res = await worker.fetch(
        req("/", { accept: HTML, host }),
        env,
        ctx
      );
      assert.equal(res.status, 503, host);
    }
    assert.deepEqual(ASSETS.calls, []);
  });

  test('GATE_MODE="off" lets everything through, and the posture is red', async () => {
    const { env } = envWith({ GATE_MODE: "off" });
    for (const [method, path, accept] of [
      ["GET", "/", HTML],
      ...NON_NAVIGATIONS,
    ]) {
      const res = await worker.fetch(req(path, { method, accept }), env, ctx);
      assert.equal(res.status, 200, `${method} ${path}`);
    }
    const off = gateStatus(env);
    assert.equal(off.state, "off");
    assert.equal(off.ok, false);
    const on = gateStatus({ ...KEYS });
    assert.equal(on.state, "on");
    assert.equal(on.ok, true);
  });
});

describe("serveAsset", () => {
  // run_worker_first has been seen not to resolve "/" to "/index.html" in
  // production (gate-kit INTEGRATION.md 4(a)); serveAsset retries it.
  function quirkyAssets(map) {
    const calls = [];
    return {
      calls,
      async fetch(request) {
        const { pathname } = new URL(request.url);
        calls.push(`${request.method} ${pathname}`);
        const hit = map[pathname];
        if (!hit) return new Response("not found", { status: 404 });
        return typeof hit === "number"
          ? new Response(null, { status: hit, headers: { location: "/" } })
          : new Response(hit, {
              status: 200,
              headers: { "content-type": "text/html" },
            });
      },
    };
  }

  test("a 404 for / is retried as /index.html", async () => {
    const ASSETS = quirkyAssets({ "/index.html": SITE_HTML });
    const res = await serveAsset(req("/", { accept: HTML }), { ASSETS });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), SITE_HTML);
    assert.deepEqual(ASSETS.calls, ["GET /", "GET /index.html"]);
  });

  test("a redirecting retry is not used (no loop), and POST is never retried", async () => {
    const ASSETS = quirkyAssets({ "/index.html": 307 });
    assert.equal(
      (await serveAsset(req("/", { accept: HTML }), { ASSETS })).status,
      404
    );
    const ASSETS2 = quirkyAssets({ "/index.html": SITE_HTML });
    assert.equal(
      (await serveAsset(req("/", { method: "POST" }), { ASSETS: ASSETS2 }))
        .status,
      404
    );
    assert.deepEqual(ASSETS2.calls, ["POST /"]);
  });

  test("a file path is not retried", async () => {
    const ASSETS = quirkyAssets({});
    assert.equal(
      (await serveAsset(req("/robots.txt"), { ASSETS })).status,
      404
    );
    assert.deepEqual(ASSETS.calls, ["GET /robots.txt"]);
  });
});
