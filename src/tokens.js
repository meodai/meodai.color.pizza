import {
  bestContrastWith,
  closestColor,
  color,
  colorMix,
  composeBook,
  layer,
  ref,
} from "design-book";

const system = layer("system", (book) => {
  const base = book.addScope("base");
  base.set("paper", color("#f7f7f7"));
  base.set("ink", color("#303030"));
  base.set("accent", color("#ff4f2b"));
  base.set("night", color("#161616"));

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
  ui.set(
    "muted",
    closestColor(ref("base.paper"), grey, { readableOn: ref("base.paper"), minContrast: 4.5 }),
  );
  ui.set("rule", colorMix(ref("base.paper"), ref("base.ink"), { ratio: 0.1, colorSpace: "oklch" }));
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
    light.render("css-variables").trim(),
    "@media (prefers-color-scheme: dark) {",
    indent(night.render("css-variables", { changedFrom: light }).trim()),
    "}",
    "",
  ].join("\n");
}
