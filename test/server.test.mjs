// The Node server (server/app.ts, `pnpm start`): the same CAPTCHA wall as the
// Worker, through the Gate kit's Node adapter, in front of express.static and
// the SPA fallback. Runs a real HTTP server on 127.0.0.1 with an ephemeral
// port; siteverify is stubbed and any other outbound fetch fails the test.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp, trustCloudflareFromEnv } from "../server/app.ts";
import {
  SITEVERIFY_URL,
  VERIFY_PATH,
  PASS_COOKIE,
  MSG_NOT_CONFIGURED,
} from "../gate-kit/gate.mjs";
import { MSG_PRIVATE_CLIENT } from "../gate-kit/gate-node.mjs";

const HOST = "momsanytime.com";
const IP = "203.0.113.7";
const UA = "Mozilla/5.0 (Test) MomsAnytime/1.0";
const HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const KEYS = Object.freeze({
  TURNSTILE_SITE_KEY: "0x4AAAAAAAmomsSITEkeyTESTS",
  TURNSTILE_SECRET_KEY: "0x4AAAAAAAmomsSECRETkeyFORtestsONLY",
});
const SITE_HTML =
  '<!doctype html><title>For All the Moms</title><div id="root"></div>';

const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
  throw new Error(`unexpected outbound fetch ${url}`);
};
after(() => {
  globalThis.fetch = realFetch;
});

async function siteverify(url, init) {
  assert.equal(url, SITEVERIFY_URL);
  const params = new URLSearchParams(String(init.body));
  const ok =
    params.get("response") === "good.token_123" &&
    params.get("remoteip") === IP;
  return Response.json(
    ok
      ? { success: true, hostname: HOST, action: "gate" }
      : { success: false, "error-codes": ["invalid-input-response"] }
  );
}

let dir;
before(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "moms-static-"));
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "index.html"), SITE_HTML);
  writeFileSync(
    path.join(dir, "assets", "index-abc123.js"),
    "console.log('app')"
  );
});
after(() => rmSync(dir, { recursive: true, force: true }));

/** Start the app on 127.0.0.1:<ephemeral>, as it runs behind a proxy that overwrites CF-Connecting-IP. */
async function start(options = {}) {
  const { app } = createApp({
    staticPath: dir,
    env: { ...KEYS },
    trustCloudflare: ["127.0.0.1", "::1"],
    fetch: siteverify,
    ...options,
  });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
}

function get(
  port,
  pathname,
  { method = "GET", accept = "*/*", cookie, ip = IP, body, headers = {} } = {}
) {
  return new Promise((resolve, reject) => {
    const h = { host: HOST, "user-agent": UA, accept, ...headers };
    if (ip) h["cf-connecting-ip"] = ip;
    if (cookie) h.cookie = cookie;
    if (body) h["content-length"] = Buffer.byteLength(body);
    const r = http.request(
      { host: "127.0.0.1", port, path: pathname, method, headers: h },
      res => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", c => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: data })
        );
      }
    );
    r.on("error", reject);
    r.end(body);
  });
}

async function passCookie(port) {
  const res = await get(port, VERIFY_PATH, {
    method: "POST",
    accept: HTML,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: `https://${HOST}`,
    },
    body: "token=good.token_123&return=%2Fno-such-page",
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, "/no-such-page");
  const set = res.headers["set-cookie"][0];
  assert.match(set, new RegExp(`^${PASS_COOKIE}=v1\\.`));
  for (const attr of ["HttpOnly", "Secure", "SameSite=Lax"])
    assert.ok(set.includes(attr), attr);
  return set.split(";")[0];
}

describe("Node server behind the wall", () => {
  let srv;
  before(async () => {
    srv = await start();
  });
  after(() => srv.server.close());

  test("without a pass: challenge page for navigations, 403 JSON for the rest, no files", async () => {
    for (const p of ["/", "/no-such-page", "/.env"]) {
      const res = await get(srv.port, p, { accept: HTML });
      assert.equal(res.status, 403, p);
      assert.match(res.headers["content-type"], /^text\/html/);
      assert.match(res.body, /before loading For All the Moms\./);
      assert.doesNotMatch(res.body, /id="root"/);
    }
    for (const p of [
      "/assets/index-abc123.js",
      "/robots.txt",
      "/favicon.ico",
      "/api/status",
      "/wp-login.php",
      "/.git/config",
    ]) {
      const res = await get(srv.port, p);
      assert.equal(res.status, 403, p);
      assert.equal(JSON.parse(res.body).code, "captcha_required");
      assert.equal(res.headers["cache-control"], "no-store, private");
    }
  });

  test("verify gives a 303 and a cookie; with it the site is served privately, SPA fallback included", async () => {
    const cookie = await passCookie(srv.port);
    const home = await get(srv.port, "/", { accept: HTML, cookie });
    assert.equal(home.status, 200);
    assert.equal(home.body, SITE_HTML);
    assert.match(home.headers.vary, /Cookie/);
    assert.match(home.headers["cache-control"], /^private\b/);
    const js = await get(srv.port, "/assets/index-abc123.js", { cookie });
    assert.equal(js.status, 200);
    assert.match(js.headers["content-type"], /javascript/);
    assert.match(js.headers["cache-control"], /^private\b/);
    const route = await get(srv.port, "/no-such-page", {
      accept: HTML,
      cookie,
    });
    assert.equal(route.status, 200);
    assert.equal(route.body, SITE_HTML);
    const otherIp = await get(srv.port, "/", {
      accept: HTML,
      cookie,
      ip: "198.51.100.20",
    });
    assert.equal(otherIp.status, 403);
  });
});

describe("Node server configuration", () => {
  test("missing keys: 503 for everything", async () => {
    const srv = await start({ env: {} });
    try {
      for (const p of ["/", "/assets/index-abc123.js", "/robots.txt"]) {
        const res = await get(srv.port, p, { accept: HTML });
        assert.equal(res.status, 503, p);
        assert.equal(res.body, MSG_NOT_CONFIGURED);
      }
    } finally {
      srv.server.close();
    }
  });

  test("behind a proxy that isn't trusted, every visitor looks like 127.0.0.1: 503, never one shared pass", async () => {
    const srv = await start({ trustCloudflare: false });
    try {
      const res = await get(srv.port, "/", { accept: HTML });
      assert.equal(res.status, 503);
      assert.equal(res.body, MSG_PRIVATE_CLIENT);
    } finally {
      srv.server.close();
    }
  });

  test('GATE_MODE="off" serves the site without a pass', async () => {
    const srv = await start({ env: { ...KEYS, GATE_MODE: "off" } });
    try {
      const res = await get(srv.port, "/", { accept: HTML });
      assert.equal(res.status, 200);
      assert.equal(res.body, SITE_HTML);
    } finally {
      srv.server.close();
    }
  });

  test("GATE_TRUST_CLOUDFLARE parsing", () => {
    assert.equal(trustCloudflareFromEnv(""), false);
    assert.equal(trustCloudflareFromEnv("true"), true);
    assert.equal(trustCloudflareFromEnv("1"), true);
    assert.deepEqual(trustCloudflareFromEnv(" 127.0.0.1, ::1 ,"), [
      "127.0.0.1",
      "::1",
    ]);
    assert.deepEqual(trustCloudflareFromEnv("unix"), ["unix"]);
  });
});
