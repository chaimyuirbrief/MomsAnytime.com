// shared/https.ts: where a plain-http visitor is sent before the CAPTCHA wall
// (the pass cookie is Secure, so it can only be stored over https).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  httpsLocation,
  httpsRedirectStatus,
  isLoopbackClient,
  HTTPS_REDIRECT_CACHE_CONTROL,
} from "../shared/https.ts";

test("http on a real host goes to the same path and query on https, without the port", () => {
  assert.equal(
    httpsLocation("http:", "momsanytime.com", "/"),
    "https://momsanytime.com/"
  );
  assert.equal(
    httpsLocation("http", "WWW.MomsAnytime.com:80", "/a/b?c=1&d=%20"),
    "https://www.momsanytime.com/a/b?c=1&d=%20"
  );
  assert.equal(
    httpsLocation("HTTP:", "momsanytime.com:8080", "//evil.example/x"),
    "https://momsanytime.com//evil.example/x",
    "a protocol-relative-looking target stays a path on this host"
  );
});

test("https, loopback hosts and anything odd are left to the wall", () => {
  for (const [protocol, host, target] of [
    ["https:", "momsanytime.com", "/"],
    ["https", "momsanytime.com", "/"],
    ["", "momsanytime.com", "/"],
    ["ftp:", "momsanytime.com", "/"],
    ["http:", "localhost", "/"],
    ["http:", "localhost:8787", "/"],
    ["http:", "momsanytime.localhost:8787", "/"],
    ["http:", "127.0.0.1:3000", "/"],
    ["http:", "[::1]:3000", "/"],
    ["http:", "[2001:db8::1]", "/"],
    ["http:", "", "/"],
    ["http:", "evil.example/x", "/"],
    ["http:", "momsanytime.com@evil.example", "/"],
    ["http:", "momsanytime.com", "http://evil.example/"],
    ["http:", "momsanytime.com", "*"],
    ["http:", "momsanytime.com", ""],
    ["http:", "momsanytime.com", "/a b"],
    ["http:", "momsanytime.com", "/\r\nSet-Cookie: x=1"],
    ["http:", "momsanytime.com", "/café"],
  ])
    assert.equal(
      httpsLocation(protocol, host, target),
      null,
      JSON.stringify([protocol, host, target])
    );
});

test("GET and HEAD get a 301; other methods a 308, which keeps the method", () => {
  assert.equal(httpsRedirectStatus("GET"), 301);
  assert.equal(httpsRedirectStatus("HEAD"), 301);
  for (const m of ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"])
    assert.equal(httpsRedirectStatus(m), 308, m);
  assert.equal(HTTPS_REDIRECT_CACHE_CONTROL, "no-store, private");
});

test("loopback clients (wrangler dev) are recognised; Cloudflare's real visitors are not", () => {
  for (const ip of [
    "127.0.0.1",
    "127.8.9.10",
    "::1",
    "[::1]",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isLoopbackClient(ip), true, ip);
  for (const ip of [
    "",
    null,
    undefined,
    "203.0.113.7",
    "2001:db8::1",
    "10.0.0.1",
    "::",
    "128.0.0.1",
    "::ffff:203.0.113.7",
  ])
    assert.equal(isLoopbackClient(ip), false, String(ip));
});
