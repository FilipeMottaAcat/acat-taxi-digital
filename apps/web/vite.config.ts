import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
      includeAssets: ["icons/favicon-48.png"],
      manifest: {
        name: "ACAT Táxi Digital",
        short_name: "ACAT Táxi",
        description: "Painel de escalas — Cotur Viagem e Cotur Cidade",
        lang: "pt-BR",
        theme_color: "#e30613",
        background_color: "#16171a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectRegister: "auto",
      devOptions: { enabled: true, type: "module" },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/socket.io": { target: "http://localhost:3001", changeOrigin: true, ws: true },
    },
  },
});
