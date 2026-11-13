# MomsAnytime.com

**For All the Moms** — an editorial thank-you to the people who make room for us,
every day. A single-page tribute built as a static React site.

The design direction is *The Keepsake Almanac*: warm-paper ground, asymmetric
album-spread composition, clay-red seals, and considerate motion. The full brief
lives in [`docs/design-brief.md`](docs/design-brief.md).

## Getting started

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev        # dev server on http://localhost:3000 (this machine only; no CAPTCHA wall)
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server with HMR, on this machine only (no CAPTCHA wall: it doesn't run the Worker) |
| `pnpm dev:worker` | The real Worker, wall included, on http://localhost:8787 (`wrangler dev`; builds first). Needs `.dev.vars`, see [CAPTCHA wall](#captcha-wall) |
| `pnpm build` | Builds the client to `dist/public` and the static server to `dist/index.js` |
| `pnpm start` | Serves the production build (`NODE_ENV=production node dist/index.js`) |
| `pnpm preview` | Previews the production client build via Vite, on this machine only (no CAPTCHA wall) |
| `pnpm check` | TypeScript typecheck (`tsc --noEmit`) |
| `pnpm test` | The Gate kit's own suite, then the Worker and Node server tests in `test/` |
| `pnpm format` | Prettier over the repo |

## Layout

```
client/
  index.html            Document shell, favicon, meta
  public/media/         Brand seal + section artwork (served from /media/…)
  src/
    pages/Home.tsx      The whole tribute page
    media.ts            Single source of truth for imagery (src + alt)
    index.css           Design tokens and every section style
    components/ui/      shadcn/ui primitives (available, mostly unused)
worker.ts               Cloudflare Worker: the CAPTCHA wall, then dist/public
server/app.ts           Express app for Node hosts: the same wall, then the static build
server/index.ts         Starts server/app.ts (`pnpm start`)
shared/                 Constants shared between client and server
  captcha.ts            The wall's options, shared by worker.ts and server/app.ts
  https.ts              The http -> https redirect worker.ts runs ahead of the wall
gate-kit/               The shared Gate kit, vendored unchanged (never edit it here)
test/                   Worker and Node server tests (`pnpm test`)
docs/design-brief.md    Design direction, palette, typography, voice
```

`Home.tsx` is deliberately written against hand-authored CSS classes in
`index.css` rather than utility classes — the layout is asymmetric and
composition-heavy, so the styles read better kept together.

## Imagery

All artwork is local, under `client/public/media/`, and referenced through
[`client/src/media.ts`](client/src/media.ts) — nothing else in the app hardcodes
an image path.

- **`for-all-moms-seal.svg`** — the brand mark: a hand-pressed circular seal
  holding three unequal nested heart contours. It carries no typography, so it
  stays legible as a favicon. Also used in the header and footer.
- **`for-all-moms-hero.svg`**, **`for-all-moms-window.svg`**,
  **`for-all-moms-hands.svg`** — the three section frames, currently on-brand
  editorial illustration in the Keepsake palette.

### Swapping in photography

The three scene frames are designed to be replaced with real photographs when
you have them. Drop the file into `client/public/media/` and update the matching
entry in `client/src/media.ts`:

```ts
export const heroPhoto: Media = {
  src: "/media/your-photo.jpg",
  alt: "Describe what the photograph actually shows",
};
```

Update `alt` at the same time — the current alt text describes the illustrations,
and it would be wrong for a photograph. The frames expect roughly 4:3 (hero),
0.8 portrait (window), and 1.12 (hands); CSS applies `object-fit: cover`, so
other ratios crop rather than distort.

## Contact form

The "Add your voice" section posts to [Formspree](https://formspree.io) so the
site stays fully static — there is no backend to run or secret to hold. The
endpoint lives in
[`client/src/components/ContributeForm.tsx`](client/src/components/ContributeForm.tsx);
form action URLs are public by design, since they appear in page markup either
way.

The form submits with `fetch` and `Accept: application/json`, so Formspree
answers with JSON instead of redirecting away from the page. That keeps the
visitor where they are and lets the component render its own success and error
states.

Fields sent: `purpose` (testimonial or offer to contribute), `name`, `email`
(optional), `message`, and a `_subject` so the notification email is labelled.

Spam is handled by a `_gotcha` honeypot, which Formspree drops silently when
filled. It is `display: none` rather than visually-hidden **on purpose** — a
visually-hidden field stays in the accessibility tree, so a screen-reader user
would be asked to fill in a decoy.

To point the form somewhere else, change `FORMSPREE_ENDPOINT`. To add a field,
give it a `name` and it is included automatically — the body is built from
`FormData`, not a hand-written object.

**The form is not behind the [CAPTCHA wall](#captcha-wall).** The browser posts
straight to Formspree, so the wall never sees a submission. The endpoint is in
this public repository (and its history), and Formspree accepts a post from any
origin, so a script can send notes, and with them notification emails, without
ever loading momsanytime.com or solving the CAPTCHA. Only Formspree's own spam
filtering and the honeypot stand in the way. Until the owner decides otherwise,
turn on Formspree's spam protection for the form (and its domain restriction to
`momsanytime.com` and `www.momsanytime.com`, which stops casual reuse but not a
script that forges the `Referer`). Putting the form behind the wall for real
means a small `POST /contribute` route in `worker.ts` and `server/app.ts`, after
the wall, that forwards to a new Formspree form whose ID is a secret, and then
retiring the current form, whose ID is already public.

## Deployment

The repo is wired to Cloudflare Workers Builds (worker `momsanytime-com`).
[`wrangler.jsonc`](wrangler.jsonc) declares a small Worker,
[`worker.ts`](worker.ts), in front of the built client. Every request runs it
first (`assets.run_worker_first: true`): it applies the
[CAPTCHA wall](#captcha-wall), then serves `dist/public` through the `ASSETS`
binding, which still falls back to `index.html` for unknown paths so client-side
routing works.

`wrangler.jsonc` also carries a `build.command` of `pnpm build`, so `npx wrangler
deploy` produces `dist/public` on its own and the deploy does not depend on a
build command being configured in the Cloudflare dashboard. `pnpm build` also
emits `dist/index.js`, which the Workers deploy ignores — that Express server is
for `pnpm start` and Node hosts; Workers cannot run an Express listener.

`.node-version` pins Node 22 for the build. Vite 7 requires
`^20.19.0 || >=22.12.0` and will fail on anything older.

### Custom domains

`momsanytime.com` and `www.momsanytime.com` are declared under `routes` with
`custom_domain: true`. Cloudflare creates the DNS records and issues the
certificates during deploy, so no dashboard DNS work is needed. Both hostnames
are listed deliberately — a custom domain matches its hostname exactly, so an
apex entry does not also cover `www`.

Only **production** deploys attach custom domains. A branch preview build will
succeed without putting the site on either hostname, so a change to `routes`
does not take effect until it lands on the default branch.

Cloudflare refuses to create a custom domain over a hostname that already has a
CNAME record. If a deploy fails on the routes step, check DNS for a pre-existing
record on that hostname and delete it before retrying.

## CAPTCHA wall

Nothing on the site loads (no page, script, image, `robots.txt`, favicon or 404)
until the visitor has solved a Cloudflare Turnstile CAPTCHA. This is the owner's
rule for every site (PORTAL-STANDARD §10), built once as the shared Gate kit and
vendored unchanged into [`gate-kit/`](gate-kit/); its
[`INTEGRATION.md`](gate-kit/INTEGRATION.md) is the full reference.

- A visitor without a pass gets the challenge page (403); anything that isn't a
  page navigation gets a 403 JSON. Solving it posts to `/__gate/verify`, which
  sets an HttpOnly cookie bound to the visitor's IP address, browser and host,
  and returns them to the page they asked for.
- A pass lasts 12 hours (the kit's default: the site has no settings store to
  change it). A new IP address (Wi-Fi to mobile data, a VPN) means a new
  challenge.
- Pages served on a pass are private (`Vary: Cookie`, `Cache-Control: private`),
  so no shared cache can hand them to someone without one.
- Plain `http://` requests are redirected to `https://` before the wall (301,
  or 308 for anything but GET/HEAD; `shared/https.ts`). The pass cookie is
  `Secure`, and a browser won't store it from an `http://` response, so without
  the redirect an `http://` visitor would solve the challenge and get it again,
  forever. The redirect carries no content. `localhost` and `wrangler dev` are
  left alone.
- There are no exemptions: the site has no machine clients.
- Counts of challenges served, solved and failed stay in memory
  (`captcha.stats()`); nothing is emailed or stored.

### Keys (before the first deploy with the wall: it fails closed)

Until both keys exist, every request gets a plain 503 "Not available: CAPTCHA
is not configured".

1. Cloudflare dashboard → Turnstile → **Add widget**, mode **Managed**, with the
   hostnames `momsanytime.com` and `www.momsanytime.com` (and any
   `*.workers.dev` hostname of this Worker that should work).
2. Put the **site key** in `wrangler.jsonc` under `vars` as `TURNSTILE_SITE_KEY`
   (the comment at the end of the file shows where). Not in the dashboard alone:
   deploys replace dashboard variables with the file's.
3. Store the **secret**: `npx wrangler secret put TURNSTILE_SECRET_KEY` (or as an
   encrypted variable in the dashboard).
4. Optional: a `GATE_SECRET` secret of 32+ characters signs passes instead of a
   key derived from the Turnstile secret; rotating it ends every pass.

Break-glass: a plain variable `GATE_MODE` = `off` lets everything through
without a CAPTCHA. Set in the dashboard, it is cleared again by the next deploy.

### Local development

`pnpm dev` (Vite) has no wall. To run the real Worker:

```bash
cp .dev.vars.example .dev.vars   # Cloudflare's always-pass TEST keys
pnpm dev:worker                  # http://localhost:8787
```

The script runs `wrangler dev --local-upstream localhost` (no port after
`localhost`). Without it, the custom-domain `routes` make wrangler rewrite every
request to `momsanytime.com`, where the test keys are refused with a 503. Use
Chrome or Firefox: Safari doesn't keep the `Secure` pass cookie on
`http://localhost`.

### Node hosts (`pnpm start`)

`server/app.ts` puts the same wall in front of `express.static` through the
kit's Node adapter. It reads the same variables from the environment:
`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, optionally `GATE_SECRET` and
`GATE_MODE`, plus two Node-only ones:

- **`GATE_TRUST_CLOUDFLARE`**, required behind a reverse proxy. The pass is
  bound to the visitor's IP address, and behind Caddy or nginx every request
  comes from the proxy's address, so without this setting every request gets
  a 503 rather than letting one solve unlock every visitor. Make the proxy
  **overwrite** `CF-Connecting-IP` with the visitor's address, then name the
  proxy's address here: `127.0.0.1,::1` for a proxy on the same machine,
  `172.17.0.1` or similar from a container, `unix` over a Unix socket, or
  `true` only when a firewall admits nothing but Cloudflare.

  ```caddyfile
  momsanytime.com, www.momsanytime.com {
  	reverse_proxy localhost:3000 {
  		header_up CF-Connecting-IP {remote_host}
  	}
  }
  ```

  ```nginx
  location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $host;                    # the real host: the pass and siteverify check it
      proxy_set_header CF-Connecting-IP $remote_addr; # overwrite; never pass the client's on
  }
  ```

  With Cloudflare also in front of the proxy, take the visitor's address from
  Cloudflare's header only for Cloudflare's ranges first (nginx `realip`, Caddy
  `trusted_proxies`): `gate-kit/INTEGRATION.md` 4(c) has the exact lines.

- **Redirect `http://` to `https://` at the proxy.** The pass cookie is
  `Secure`, so a visitor on `http://` solves the challenge and never gets in.
  On Cloudflare the Worker does this redirect itself; on a Node host it is the
  proxy's job, because only the proxy knows how the visitor connected. Caddy
  redirects by default. With nginx, answer port 80 with nothing but the
  redirect:

  ```nginx
  server {
      listen 80;
      server_name momsanytime.com www.momsanytime.com;
      return 301 https://$host$request_uri;
  }
  ```

- **`GATE_LOCAL_DEV=1`**, a developer's machine only, never a server: accepts the
  test keys for `http://localhost:<port>` (not `127.0.0.1`). Ignored when
  `NODE_ENV=production`, so use `node dist/index.js` rather than `pnpm start`:

  ```bash
  pnpm build
  GATE_LOCAL_DEV=1 TURNSTILE_SITE_KEY=1x00000000000000000000AA \
    TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA node dist/index.js
  ```

The pass cookie is `Secure`, so a Node host must be served over HTTPS.

### What the wall changes

- Search engines and link previews (Google, iMessage, WhatsApp, Facebook, Slack)
  only ever see the challenge, marked `noindex`. The site drops out of search
  results, and shared links show no preview.
- Uptime monitors and scripted fetches (`curl`, link checkers) get a 403.
- A link to a section (`/#contribute`, `/#honor`) opens at the top of the page
  after the challenge: the shared kit's challenge page doesn't carry the
  `#fragment` through (a kit fix, not a site one). Once a visitor has a pass,
  section links work as before.

### What the wall does not cover

- **The contribution form's Formspree endpoint.** See
  [Contact form](#contact-form): anyone can post to it without a pass.
- **This repository.** It is public, so GitHub (for example
  `raw.githubusercontent.com`) serves the page copy, the artwork in
  `client/public/media/` and the rest of the source to anyone, with no CAPTCHA.
  Making the repository private closes that (Workers Builds works with private
  repositories through the Cloudflare GitHub app); keeping it public is a
  reasonable choice for a site that invites contributions, but it is outside
  the wall.
- **`pnpm dev` and `pnpm preview`.** They run Vite, not the Worker, so they have
  no wall. They listen on this machine only (`localhost`); pass `--host` for a
  single run (`pnpm dev --host`) only to try the site from another device on a
  network you trust.

## Notes

- Type is loaded from Google Fonts (DM Serif Display + Manrope) via an `@import`
  at the top of `index.css`.
- All non-essential motion is disabled under `prefers-reduced-motion`.
- The page is a single route; `wouter` handles the `/` and 404 cases in
  `client/src/App.tsx`.
