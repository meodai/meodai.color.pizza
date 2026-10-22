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
- CSS is organised in cascade layers: `reset`, `tokens`, `base`, `layout`, `components`,
  with BEM class names.
- Colors are rules, not hex values: [Design Book](https://github.com/meodai/design-book)
  turns `src/tokens.js` into `src/tokens.css` on every build (a small Vite plugin). Three
  primitives (paper, ink, accent) carry each theme; dark mode is a layer that overrides only
  those, and the rest follows. The muted grey is picked as the one closest to the paper that
  still reads at 4.5:1, and the selected-text color as the best contrast on the accent.
- The crayon in the corner opens a panel that runs the same rules in the browser
  (`src/recolor.js`): visitors pick the three primitives and Design Book re-derives the rest.
  It is loaded only when the panel opens, so the page itself stays almost script-free.
- The portrait in `index.html` is a hand-traced SVG line drawing.
- Titles and text use [Libre Caslon Condensed](https://github.com/ertekinno/libre-caslon-condensed),
  subset to Latin, under the SIL Open Font License (`src/fonts/LibreCaslonCondensed-OFL.txt`).
- `src/projects.js` is a parked draft for a fuller project list; nothing renders it yet.
