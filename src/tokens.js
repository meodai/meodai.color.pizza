import {
  bestContrastWith,
  closestColor,
  color,
  colorMix,
  composeBook,
  layer,
  nth,
  ref,
} from "design-book";

const steps = 6;

const system = layer("system", (book) => {
  const base = book.addScope("base");
  base.set("paper", color("#f7f7f7"));
  base.set("ink", color("#303030"));
  base.set("accent", color("#ff4f2b"));

  const tone = book.addScope("tone");
  for (let step = 0; step < steps; step++) {
    tone.set(
      `t${step}`,
      colorMix(ref("base.paper"), ref("base.ink"), {
        ratio: Math.round((step / (steps - 1)) ** 1.6 * 100) / 100,
        colorSpace: "oklch",
      }),
    );
  }

  const ui = book.addScope("color");
  ui.set("paper", nth(tone, 0));
  ui.set("ink", bestContrastWith(ref("color.paper"), tone));
  ui.set("accent", ref("base.accent"));
  ui.set(
    "muted",
    closestColor(ref("color.paper"), tone, { readableOn: ref("color.paper"), minContrast: 4.5 }),
  );
  ui.set("rule", nth(tone, 1));
  ui.set("on-accent", bestContrastWith(ref("color.accent"), tone));
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
