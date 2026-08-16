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

## Notes

- Type is loaded from Google Fonts (DM Serif Display + Manrope) via an `@import`
  at the top of `index.css`.
- All non-essential motion is disabled under `prefers-reduced-motion`.
- The page is a single route; `wouter` handles the `/` and 404 cases in
  `client/src/App.tsx`.
