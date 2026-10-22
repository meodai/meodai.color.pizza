import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig } from "vite";

const tokensSource = fileURLToPath(new URL("./src/tokens.js", import.meta.url));
const tokensOutput = fileURLToPath(new URL("./src/tokens.css", import.meta.url));

function designBookTokens() {
  async function write() {
    const { tokensCSS } = await import(`${pathToFileURL(tokensSource).href}?t=${Date.now()}`);
    await writeFile(tokensOutput, tokensCSS());
  }
  return {
    name: "design-book-tokens",
    buildStart: write,
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
