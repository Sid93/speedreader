import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GH Pages hosts the site at /<repo>/; VITE_BASE is set by the Actions workflow.
  base: process.env.VITE_BASE ?? "/",
  server: { port: 5173, host: true },
});
