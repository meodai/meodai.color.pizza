// Color tokens, as rules rather than hex values, rendered to CSS custom
// properties at build time with Design Book (see vite.config.js).
import {
  bestContrastWith,
  closestColor,
  color,
  colorMix,
  composeBook,
  layer,
  ref,
} from "design-book";

// Three primitives carry the theme; everything in `color` is derived.
const system = layer("system", (book) => {
  const base = book.addScope("base");
  base.set("paper", color("#f7f7f7"));
  base.set("ink", color("#303030"));
  base.set("accent", color("#ff4f2b"));
  // The darkest neutral either theme uses; a candidate for text on the accent.
  base.set("night", color("#161616"));

  // Ink faded toward paper in ten steps: the pool the muted grey is picked from.
  const grey = book.addScope("grey");
  for (let step = 1; step <= 9; step++) {
    grey.set(
      `g${step}0`,
      colorMix(ref("base.ink"), ref("base.paper"), { ratio: step / 10, colorSpace: "oklch" }),
    );
  }

  const ui = book.addScope("color");
  ui.set("paper", ref("base.paper"));
  ui.set("ink", ref("base.ink"));
  ui.set("accent", ref("base.accent"));
  // Labels: the grey closest to the paper that still reads at 4.5:1 on it.
  ui.set(
    "muted",
    closestColor(ref("base.paper"), grey, { readableOn: ref("base.paper"), minContrast: 4.5 }),
  );
  // Hairlines: a tenth of the way from paper to ink.
  ui.set("rule", colorMix(ref("base.paper"), ref("base.ink"), { ratio: 0.1, colorSpace: "oklch" }));
  // Selected text: whichever neutral reads best on the accent.
  ui.set("on-accent", bestContrastWith(ref("base.accent"), base, { not: [ref("base.accent")] }));
});

const dark = layer("dark", {
  base: {
    paper: color("#161616"),
    ink: color("#e8e8e8"),
    accent: color("#ff7a5c"),
  },
});

export function books() {
  return { light: composeBook("light", [system]), night: composeBook("dark", [system, dark]) };
}

export function tokensCSS() {
  const { light, night } = books();
  const indent = (css) => css.replace(/^/gm, "  ");
  return [
    "/* Generated from src/tokens.js by Design Book. Do not edit. */",
    light.render("css-variables").trim(),
    "@media (prefers-color-scheme: dark) {",
    indent(night.render("css-variables", { changedFrom: light }).trim()),
    "}",
    "",
  ].join("\n");
}
