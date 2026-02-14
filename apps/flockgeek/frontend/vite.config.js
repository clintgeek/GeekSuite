import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: false,
      allowedHosts: ['localhost', 'flockgeek.clintgeek.com'],
      proxy: {
        "/api": {
          // Default proxy target should match backend `env.port` (5001)
          target: env.VITE_DEV_API_PROXY || "http://localhost:4094",
          changeOrigin: true
        }
      }
    },
    preview: {
      port: 4173
    }
  };
});
