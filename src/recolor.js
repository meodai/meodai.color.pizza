import { color } from "design-book";
import { books } from "./tokens.js";

const dark = matchMedia("(prefers-color-scheme: dark)");

export function recolor(panel) {
  const inputs = panel.querySelectorAll(".palette__input");
  const values = panel.querySelectorAll(".palette__value");
  const status = panel.querySelector(".palette__status");
  const themeColors = [...document.querySelectorAll('meta[name="theme-color"]')];
  const defaultThemeColors = themeColors.map((meta) => meta.content);
  const style = document.createElement("style");
  document.head.append(style);
  let book;

  function showValues() {
    values.forEach((value) => (value.textContent = book.resolve(value.dataset.token)));
  }

  function reset() {
    const { light, night } = books();
    book = dark.matches ? night : light;
    style.textContent = "";
    status.textContent = "";
    themeColors.forEach((meta, i) => (meta.content = defaultThemeColors[i]));
    inputs.forEach((input) => (input.value = book.resolve(`base.${input.name}`)));
    showValues();
  }

  inputs.forEach((input) =>
    input.addEventListener("input", () => {
      book.getScope("base").set(input.name, color(input.value));
      try {
        style.textContent = book.render("css-variables");
        themeColors.forEach((meta) => (meta.content = book.resolve("color.paper")));
        showValues();
        status.textContent = "";
      } catch {
        status.textContent =
          "No grey reads at 4.5:1 on this paper, so the page keeps its last colors.";
      }
    }),
  );
  panel.querySelector(".palette__reset").addEventListener("click", reset);
  dark.addEventListener("change", reset);
  reset();
}
