const params = new URLSearchParams(location.search);
const hex = (name) => {
  const value = params.get(name);
  return /^([0-9a-f]{3}){1,2}$/i.test(value ?? "") ? `#${value}` : undefined;
};
const light = hex("cl") ?? hex("cd");
const dark = hex("cd") ?? light;
const colors = { light, dark };

export const themed = light
  ? import("./tokens.js")
      .then(({ tokensCSS, themeColors }) => {
        const style = document.createElement("style");
        style.textContent = tokensCSS(colors);
        document.head.append(style);
        const theme = themeColors(colors);
        for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
          meta.content = theme[meta.media.includes("dark") ? "dark" : "light"];
        dispatchEvent(new Event("themechange"));
      })
      .catch(() => {})
  : Promise.resolve();
