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

const system = (accent) =>
  layer("system", (book) => {
    const base = book.addScope("base");
    base.set("paper", color("#f7f7f7"));
    base.set("ink", color("#303030"));
    base.set("accent", color(accent));
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

const dark = (paper) =>
  layer("dark", (book) => {
    const text = book.addScope("text");
    text.set("light", color("#f7f7f7"));
    text.set("dark", color("#161616"));
    const extreme = book.addScope("extreme");
    extreme.set("white", color("#ffffff"));
    extreme.set("black", color("#000000"));

    const base = book.getScope("base");
    base.set("paper", color(paper));
    base.set("ink", bestContrastWith(ref("base.paper"), text));
    base.set("accent", bestContrastWith(ref("base.paper"), extreme));
    base.set("underline", bestContrastWith(ref("base.accent"), extreme));
  });

const plainMuted = layer("plain-muted", { color: { muted: ref("color.ink") } });

function nightBook(light, night) {
  const book = composeBook("dark", [system(light), dark(night)]);
  try {
    book.resolve("color.muted");
    return book;
  } catch {
    return composeBook("dark", [system(light), dark(night), plainMuted]);
  }
}

export function books({ light = "#0000ee", dark: night = "#0010cc" } = {}) {
  return {
    light: composeBook("light", [system(light)]),
    night: nightBook(light, night),
  };
}

export function themeColors(colors) {
  const { light, night } = books(colors);
  return { light: light.resolve("color.paper"), dark: night.resolve("color.paper") };
}

export function tokensCSS(colors) {
  const { light, night } = books(colors);
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
