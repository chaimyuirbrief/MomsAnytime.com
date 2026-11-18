/**
 * POST /contribute: the "Add your voice" form, forwarded to Formspree from
 * behind the CAPTCHA wall (PORTAL-STANDARD §10).
 *
 * The browser used to post straight to Formspree, so a script could send
 * notes (and with them notification emails to the owner) without ever
 * solving the CAPTCHA: the form ID was public. Now the browser posts here,
 * worker.ts and server/app.ts only call this after `captcha.handle()` has let
 * the request through, and the Formspree form ID comes from the secret
 * `FORMSPREE_FORM_ID`.
 *
 * Until the owner sets that secret, the old public ID is the fallback so the
 * form keeps working. That old form still accepts posts sent straight to it,
 * so the owner must create a new form, set the secret, and then delete or
 * disable the old one (README: "Contact form").
 *
 * Runtime-neutral (Fetch API only), so both runtimes share it unchanged.
 */

/** The form ID that shipped in the client bundle. Public: retire it. */
export const LEGACY_FORMSPREE_FORM_ID = "xwlerjkw";

export const CONTRIBUTE_PATH = "/contribute";

/** The largest request body accepted, in bytes. A long note is ~10 KB. */
export const MAX_CONTRIBUTE_BYTES = 32 * 1024;

/** The fields forwarded, with their longest accepted length. Anything else is dropped. */
export const CONTRIBUTE_FIELDS = Object.freeze({
  purpose: 100,
  name: 200,
  email: 254,
  message: 10_000,
});

/** Set here, not taken from the browser. */
export const CONTRIBUTE_SUBJECT = "For All the Moms — a new note";

const FORMSPREE_TIMEOUT_MS = 10_000;
const FORM_ID = /^[A-Za-z0-9]{4,32}$/;

export interface ContributeEnv {
  FORMSPREE_FORM_ID?: string;
}

/** The Formspree form ID to post to: the secret if it is set and well formed, else the old public one. */
export function formspreeFormId(env: ContributeEnv | undefined): string {
  const id = String(env?.FORMSPREE_FORM_ID ?? "").trim();
  return FORM_ID.test(id) ? id : LEGACY_FORMSPREE_FORM_ID;
}

/** The same `{ errors: [{ message }] }` shape Formspree answers with, which the form already shows. */
function answer(
  status: number,
  body: object,
  extra: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

function refuse(
  status: number,
  message: string,
  extra?: Record<string, string>
) {
  return answer(status, { ok: false, errors: [{ message }] }, extra);
}

/** The body, or null once it grows past `limit` bytes (read as a stream, so a huge body is never held). */
async function readLimited(
  request: Request,
  limit: number
): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export interface ContributeOptions {
  /** Tests: a stand-in for the outbound fetch to Formspree. */
  fetch?: typeof fetch;
}

/**
 * Answer a request for CONTRIBUTE_PATH. Call it only after the CAPTCHA wall
 * has let the request through.
 */
export async function handleContribute(
  request: Request,
  env: ContributeEnv | undefined,
  options: ContributeOptions = {}
): Promise<Response> {
  if (request.method !== "POST") {
    return refuse(405, "Use POST.", { Allow: "POST" });
  }
  const url = new URL(request.url);

  // Same-origin only. The pass cookie is SameSite=Lax, so a cross-site POST
  // already arrives without it and the wall refuses it; this is the backstop.
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let same = false;
    try {
      same = new URL(origin).host.toLowerCase() === url.host.toLowerCase();
    } catch {
      same = false;
    }
    if (!same) return refuse(403, "That did not send. Please try once more.");
  }

  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (
    !type.startsWith("multipart/form-data") &&
    !type.startsWith("application/x-www-form-urlencoded")
  ) {
    return refuse(415, "That did not send. Please try once more.");
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CONTRIBUTE_BYTES) {
    return refuse(413, "That note is too long to send. Please shorten it.");
  }
  const bytes = await readLimited(request, MAX_CONTRIBUTE_BYTES);
  if (bytes === null) {
    return refuse(413, "That note is too long to send. Please shorten it.");
  }

  let form: FormData;
  try {
    form = await new Request(url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") || "" },
      body: bytes,
    }).formData();
  } catch {
    return refuse(400, "That did not send. Please try once more.");
  }

  // Honeypot: a person never fills it in. Answer as if it worked and send nothing.
  const trap = form.get("_gotcha");
  if (trap !== null && trap !== "") return answer(200, { ok: true });

  const out = new URLSearchParams();
  for (const [field, max] of Object.entries(CONTRIBUTE_FIELDS)) {
    const v = form.get(field);
    if (v === null) continue;
    if (typeof v !== "string")
      return refuse(400, "That did not send. Please try once more.");
    const value = v.trim();
    if (value.length > max) {
      return refuse(413, "That note is too long to send. Please shorten it.");
    }
    if (value) out.set(field, value);
  }
  if (!out.get("name") || !out.get("message")) {
    return refuse(400, "Please add your name and your note.");
  }
  out.set("_subject", CONTRIBUTE_SUBJECT);

  const fetchImpl = options.fetch ?? fetch;
  const endpoint = `https://formspree.io/f/${formspreeFormId(env)}`;
  let res: Response;
  try {
    const signal =
      typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(FORMSPREE_TIMEOUT_MS)
        : undefined;
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        // The page the note came from, as a browser post would have sent it.
        Referer: `https://${url.hostname}/`,
      },
      body: out.toString(),
      signal,
    });
  } catch {
    return refuse(
      502,
      "We could not reach the server. Check your connection and try again."
    );
  }
  if (res.ok) return answer(200, { ok: true });

  // Formspree's own validation messages ("should be an email", 400/422) are
  // shown to the visitor; anything else (a wrong form ID's 404 "Form not
  // found", a 5xx) is a generic failure.
  const data = (await res.json().catch(() => null)) as {
    errors?: Array<{ message?: unknown }>;
  } | null;
  const messages = Array.isArray(data?.errors)
    ? data.errors
        .map(e =>
          typeof e?.message === "string" ? e.message.slice(0, 200) : ""
        )
        .filter(Boolean)
        .slice(0, 5)
    : [];
  if ((res.status === 400 || res.status === 422) && messages.length) {
    return answer(400, {
      ok: false,
      errors: messages.map(message => ({ message })),
    });
  }
  return refuse(502, "That did not send. Please try once more.");
}
