import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://matheus-santos-da-silva.github.io",
  base: "/tech-news-site",
  trailingSlash: "always",
  build: {
    format: "directory",
    // CSS sempre em arquivo: a CSP não permite estilos inline.
    inlineStylesheets: "never",
  },
  devToolbar: { enabled: false },
});
