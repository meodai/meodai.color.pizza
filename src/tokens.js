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
  base.set("accent", color("#0000ee"));
  base.set("underline", ref("base.accent"));

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
  ui.set("underline", ref("base.underline"));
  ui.set(
    "muted",
    closestColor(ref("color.paper"), tone, { readableOn: ref("color.paper"), minContrast: 4.5 }),
  );
  ui.set("rule", nth(tone, 1));
  ui.set("on-accent", bestContrastWith(ref("color.accent"), tone));
});

const dark = layer("dark", {
  base: {
    paper: color("#0000ee"),
    ink: color("#f7f7f7"),
    accent: color("#ffffff"),
    underline: color("#000000"),
  },
});

export function books() {
  return { light: composeBook("light", [system]), night: composeBook("dark", [system, dark]) };
}

export function themeColors() {
  const { light, night } = books();
  return { light: light.resolve("color.paper"), dark: night.resolve("color.paper") };
}

export function tokensCSS() {
  const { light, night } = books();
  const declarations = (book, options) =>
    Object.entries(JSON.parse(book.render("json", { scopes: ["color"], ...options })))
      .map(([key, value]) => `--${key.replace(".", "-")}: ${value};`)
      .join(" ");
  return [
    `:root { ${declarations(light)} }`,
    `@media (prefers-color-scheme: dark) { :root { ${declarations(night, { changedFrom: light })} } }`,
    "",
  ].join("\n");
}
