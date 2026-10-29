# meodai.color.pizza

The personal site of David Aerne, and the domain behind the Bluesky handle
[@meodai.color.pizza](https://bsky.app/profile/meodai.color.pizza).

A single static page built with [Vite](https://vite.dev) and served by
Cloudflare Workers as static assets. The page reads without JavaScript; a few small
scripts add the extras on top.

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
  resolves `src/tokens.js` into plain hex values in `src/tokens.css` on every build (a small Vite plugin, which also fills in the `theme-color` tags). Three
  primitives (paper, ink, accent) carry each theme; dark mode is a layer that overrides only
  those, and the rest follows. Every neutral comes from one six-step ramp from paper to ink:
  hairlines are the step next to the paper, muted text the step closest to the paper that
  still reads at 4.5:1, and ink and selected text the steps with the best contrast.
- The portrait in `index.html` is an inline black and white SVG drawing that follows `--color-ink`.
- Titles and text use [Libre Caslon Condensed](https://github.com/ertekinno/libre-caslon-condensed),
  subset to Latin, under the SIL Open Font License (`src/fonts/LibreCaslonCondensed-OFL.txt`).
- `src/reel.js` lazy-loads the video reel and plays the clip for the highlight in view or under
  the pointer.
- `src/ball.js` is the WebGL ball in the run-out that rolls, stamps and leaves a paint trail,
  with a small settings panel for its look (stamp, size, colors, a Pokéball preset).
- `src/eyes.js` makes the portrait's eyes follow the pointer on desktop.
- `src/theme.js` lets `?cl=` and `?cd=` (hex, no `#`) recolor the light and dark themes by
  running `src/tokens.js` in the browser.
- `src/projects.js` is a parked draft for a fuller project list; nothing renders it yet.

## License

All rights reserved. The source is public to read, not to reuse. See [LICENSE](LICENSE).
