import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import netlify from "@netlify/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const staticOnly = env.VITE_STATIC_ONLY === "true";
  const base = env.VITE_BASE || "/";

  return {
    base,
    plugins: [
      react(),
      ...(staticOnly ? [] : [netlify()]),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "icons/*.png", ".nojekyll"],
        manifest: {
          name: "CateringCRM",
          short_name: "CateringCRM",
          description: "CRM simple para catering: clientes, eventos, recetas y compras",
          lang: "es",
          theme_color: "#1f6b4a",
          background_color: "#f3efe6",
          display: "standalone",
          orientation: "portrait-primary",
          start_url: "./",
          scope: "./",
          icons: [
            {
              src: "icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
          navigateFallback: "index.html",
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  };
});
