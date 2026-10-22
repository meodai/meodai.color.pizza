import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig } from "vite";

const tokensSource = fileURLToPath(new URL("./src/tokens.js", import.meta.url));
const tokensOutput = fileURLToPath(new URL("./src/tokens.css", import.meta.url));

function designBookTokens() {
  const load = () => import(`${pathToFileURL(tokensSource).href}?t=${Date.now()}`);
  async function write() {
    const { tokensCSS } = await load();
    await writeFile(tokensOutput, tokensCSS());
  }
  return {
    name: "design-book-tokens",
    buildStart: write,
    async transformIndexHtml(html) {
      const { themeColors } = await load();
      return html.replace(
        /<meta name="theme-color" content="[^"]*" media="\(prefers-color-scheme: (light|dark)\)"/g,
        (tag, scheme) => tag.replace(/content="[^"]*"/, `content="${themeColors()[scheme]}"`),
      );
    },
    configureServer(server) {
      server.watcher.add(tokensSource);
      server.watcher.on("change", (file) => {
        if (file === tokensSource) write();
      });
    },
  };
}

export default defineConfig({
  plugins: [designBookTokens()],
});
