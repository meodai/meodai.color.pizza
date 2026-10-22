const palette = document.querySelector("#palette");

palette.addEventListener(
  "toggle",
  () => import("./recolor.js").then(({ recolor }) => recolor(palette)),
  { once: true },
);
