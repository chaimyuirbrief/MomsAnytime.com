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
pnpm dev        # dev server on http://localhost:3000
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server with HMR |
| `pnpm build` | Builds the client to `dist/public` and the static server to `dist/index.js` |
| `pnpm start` | Serves the production build (`NODE_ENV=production node dist/index.js`) |
| `pnpm preview` | Previews the production client build via Vite |
| `pnpm check` | TypeScript typecheck (`tsc --noEmit`) |
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
server/index.ts         Express static file server for the production build
shared/                 Constants shared between client and server
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

## Deployment

The repo is wired to Cloudflare Workers Builds (worker `momsanytime-com`).
[`wrangler.jsonc`](wrangler.jsonc) declares an assets-only Worker: it serves
`dist/public` directly with no Worker script, and falls back to `index.html` for
unknown paths so client-side routing works.

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

## Notes

- Type is loaded from Google Fonts (DM Serif Display + Manrope) via an `@import`
  at the top of `index.css`.
- All non-essential motion is disabled under `prefers-reduced-motion`.
- The page is a single route; `wouter` handles the `/` and 404 cases in
  `client/src/App.tsx`.
