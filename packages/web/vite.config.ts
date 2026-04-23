import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Speed Reader",
        short_name: "Speed Reader",
        description: "Personal speed-reading toolkit with RSVP, Bunching, and Bionic modes.",
        theme_color: "#7c3aed",
        background_color: "#0f0f1a",
        display: "standalone",
        // GH Pages subpath — must match vite base.
        scope: process.env.VITE_BASE ?? "/",
        start_url: process.env.VITE_BASE ?? "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  base: process.env.VITE_BASE ?? "/",
  server: { port: 5173, host: true },
});
