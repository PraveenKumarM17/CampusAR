import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';

/** Visitor and admin share authStore; only this build may persist the admin session key. */
function adminAuthPersistName(): Plugin {
  const from = "import.meta.env.VITE_AUTH_PERSIST_NAME || 'campusar-auth'";
  const to = "'campusar-admin-auth'";
  return {
    name: 'admin-auth-persist-name',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes(`${path.sep}stores${path.sep}authStore`)) return null;
      if (!code.includes(from)) return null;
      return code.replace(from, to);
    },
  };
}

export default defineConfig({
  base: '/dashboard/CampusAdmin/',
  plugins: [basicSsl(), react(), adminAuthPersistName()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@campusar/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist-admin',
    rollupOptions: {
      input: path.resolve(__dirname, 'admin.html'),
    },
  },
  server: {
    https: true,
    port: 5174,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
