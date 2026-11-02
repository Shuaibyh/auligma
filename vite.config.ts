import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    server: { port: Number(new URL(env.FRONTEND_URL || 'http://127.0.0.1:5173').port || 5173), strictPort: true,
      proxy: { '/api': { target: env.BACKEND_URL || 'http://127.0.0.1:3001', changeOrigin: false } } },
  };
});
