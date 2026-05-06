import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: "https://nobeldrop.no",
  trailingSlash: "ignore",
  integrations: [tailwind({ applyBaseStyles: false })],
  build: {
    format: "directory",
    inlineStylesheets: "auto",
  },
  vite: {
    build: {
      cssCodeSplit: true,
    },
  },
});
