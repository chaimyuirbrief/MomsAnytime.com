// shared/contribute.ts: the "Add your voice" form, forwarded to Formspree from
// behind the CAPTCHA wall. No network: every forward goes to a stub.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleContribute,
  formspreeFormId,
  LEGACY_FORMSPREE_FORM_ID,
  MAX_CONTRIBUTE_BYTES,
  CONTRIBUTE_SUBJECT,
} from "../shared/contribute.ts";

const URL_ = "https://momsanytime.com/contribute";

function formspree(answer = () => Response.json({ ok: true })) {
  const calls = [];
  return {
    calls,
    async fetch(url, init) {
      calls.push({
        url: String(url),
        headers: new Headers(init.headers),
        body: Object.fromEntries(new URLSearchParams(String(init.body))),
      });
      return answer();
    },
  };
}

function post(fields, { headers = {}, url = URL_ } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request(url, { method: "POST", body: fd, headers });
}

const NOTE = {
  purpose: "A testimonial",
  name: "Ruth",
  email: "ruth@example.com",
  message: "She fed everyone on our street.",
  _gotcha: "",
};

test("a note is forwarded to the secret form with only the allowed fields and a fixed subject", async () => {
  const fs = formspree();
  const res = await handleContribute(
    post({
      ...NOTE,
      _subject: "spoofed",
      _replyto: "x@evil.example",
      _next: "https://evil.example",
      extra: "x",
    }),
    { FORMSPREE_FORM_ID: "newSecretId42" },
    { fetch: fs.fetch }
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get("cache-control"), "no-store, private");
  assert.equal(fs.calls.length, 1);
  const [call] = fs.calls;
  assert.equal(call.url, "https://formspree.io/f/newSecretId42");
  assert.equal(call.headers.get("accept"), "application/json");
  assert.equal(call.headers.get("referer"), "https://momsanytime.com/");
  assert.deepEqual(call.body, {
    purpose: NOTE.purpose,
    name: NOTE.name,
    email: NOTE.email,
    message: NOTE.message,
    _subject: CONTRIBUTE_SUBJECT,
  });
});

test("the form ID: the secret when well formed, else the old public one", () => {
  assert.equal(
    formspreeFormId({ FORMSPREE_FORM_ID: " abcd1234 " }),
    "abcd1234"
  );
  for (const bad of [
    undefined,
    "",
    "   ",
    "../x",
    "a/b",
    "x".repeat(40),
    "f/abc123",
  ])
    assert.equal(
      formspreeFormId({ FORMSPREE_FORM_ID: bad }),
      LEGACY_FORMSPREE_FORM_ID,
      String(bad)
    );
  assert.equal(formspreeFormId(undefined), LEGACY_FORMSPREE_FORM_ID);
});

test("without the secret it still works, on the old form", async () => {
  const fs = formspree();
  const res = await handleContribute(post(NOTE), {}, { fetch: fs.fetch });
  assert.equal(res.status, 200);
  assert.equal(
    fs.calls[0].url,
    `https://formspree.io/f/${LEGACY_FORMSPREE_FORM_ID}`
  );
});

test("only POST", async () => {
  const fs = formspree();
  for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
    const res = await handleContribute(
      new Request(URL_, { method }),
      {},
      { fetch: fs.fetch }
    );
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get("allow"), "POST");
  }
  assert.equal(fs.calls.length, 0);
});

test("size limit: a body over the limit is a 413 and nothing is sent, whatever Content-Length says", async () => {
  const fs = formspree();
  const big = { ...NOTE, message: "x".repeat(MAX_CONTRIBUTE_BYTES) };
  assert.equal(
    (await handleContribute(post(big), {}, { fetch: fs.fetch })).status,
    413
  );
  // Declared length alone.
  const declared = new Request(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(MAX_CONTRIBUTE_BYTES + 1),
    },
    body: "name=a&message=b",
  });
  assert.equal(
    (await handleContribute(declared, {}, { fetch: fs.fetch })).status,
    413
  );
  // A stream with no length that keeps going.
  let sent = 0;
  const stream = new ReadableStream({
    pull(c) {
      sent += 8192;
      if (sent > MAX_CONTRIBUTE_BYTES * 4) return c.close();
      c.enqueue(new TextEncoder().encode("a".repeat(8192)));
    },
  });
  const chunked = new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: stream,
    duplex: "half",
  });
  assert.equal(
    (await handleContribute(chunked, {}, { fetch: fs.fetch })).status,
    413
  );
  assert.ok(sent < MAX_CONTRIBUTE_BYTES * 2, "stopped reading early");
  // One field over its own cap.
  assert.equal(
    (
      await handleContribute(
        post({ ...NOTE, name: "n".repeat(201) }),
        {},
        { fetch: fs.fetch }
      )
    ).status,
    413
  );
  assert.equal(fs.calls.length, 0);
});

test("refused: missing name or note, files, other content types, other origins, bad bodies", async () => {
  const fs = formspree();
  const cases = [
    [post({ ...NOTE, name: "  " }), 400],
    [post({ ...NOTE, message: "" }), 400],
    [post({ purpose: "x" }), 400],
    [post({ ...NOTE, message: new File(["x"], "a.txt") }), 400],
    [
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(NOTE),
      }),
      415,
    ],
    [
      new Request(URL_, {
        method: "POST",
        body: "name=a&message=b",
        headers: { "content-type": "text/plain" },
      }),
      415,
    ],
    [
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=zz" },
        body: "garbage",
      }),
      400,
    ],
    [post(NOTE, { headers: { origin: "https://evil.example" } }), 403],
    [post(NOTE, { headers: { origin: "null" } }), 403],
  ];
  for (const [request, status] of cases) {
    const res = await handleContribute(request, {}, { fetch: fs.fetch });
    assert.equal(
      res.status,
      status,
      `${request.headers.get("content-type")} ${request.headers.get("origin")}`
    );
    const data = await res.json();
    assert.ok(
      Array.isArray(data.errors) && data.errors[0].message,
      "Formspree-shaped error"
    );
  }
  assert.equal(fs.calls.length, 0);
  // Same origin, and a urlencoded body, are fine.
  const ok = await handleContribute(
    new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://momsanytime.com",
      },
      body: "name=Ann&message=Thanks",
    }),
    {},
    { fetch: fs.fetch }
  );
  assert.equal(ok.status, 200);
  assert.equal(fs.calls.length, 1);
});

test("honeypot filled: answered as success, nothing sent", async () => {
  const fs = formspree();
  const res = await handleContribute(
    post({ ...NOTE, _gotcha: "Acme" }),
    {},
    { fetch: fs.fetch }
  );
  assert.equal(res.status, 200);
  assert.equal(fs.calls.length, 0);
});

test("Formspree errors: its validation messages come through, anything else is a generic 502", async () => {
  const invalid = formspree(() =>
    Response.json(
      { errors: [{ field: "email", message: "should be an email" }] },
      { status: 422 }
    )
  );
  const r1 = await handleContribute(post(NOTE), {}, { fetch: invalid.fetch });
  assert.equal(r1.status, 400);
  assert.deepEqual((await r1.json()).errors, [
    { message: "should be an email" },
  ]);

  const missing = formspree(() =>
    Response.json({ errors: [{ message: "Form not found" }] }, { status: 404 })
  );
  const r0 = await handleContribute(post(NOTE), {}, { fetch: missing.fetch });
  assert.equal(r0.status, 502, "a wrong form ID is not shown to the visitor");
  assert.doesNotMatch(JSON.stringify(await r0.json()), /not found/i);

  const down = formspree(() => new Response("oops", { status: 500 }));
  const r2 = await handleContribute(post(NOTE), {}, { fetch: down.fetch });
  assert.equal(r2.status, 502);

  const r3 = await handleContribute(
    post(NOTE),
    {},
    {
      fetch: async () => {
        throw new TypeError("network");
      },
    }
  );
  assert.equal(r3.status, 502);
  assert.match((await r3.json()).errors[0].message, /could not reach/);
});
