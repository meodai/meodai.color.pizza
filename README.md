# meodai.color.pizza

The personal site of David Aerne, and the domain behind the Bluesky handle
[@meodai.color.pizza](https://bsky.app/profile/meodai.color.pizza).

A single static page built with [Vite](https://vite.dev) and served by
Cloudflare Workers as static assets. No JavaScript ships to the browser.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # build to dist/
npm run format   # Prettier
npm run deploy   # build and publish with Wrangler
```

## Notes

- `public/.well-known/atproto-did` holds the DID that verifies the Bluesky handle;
  `public/_headers` serves it as plain text.
- CSS is organised in cascade layers: `reset`, `tokens`, `base`, `layout`, `components`.
- The portrait in `index.html` is a hand-traced SVG line drawing.
- Titles and text use [Libre Caslon Condensed](https://github.com/ertekinno/libre-caslon-condensed),
  subset to Latin, under the SIL Open Font License (`src/fonts/LibreCaslonCondensed-OFL.txt`).
- `src/projects.js` is a parked draft for a fuller project list; nothing renders it yet.
