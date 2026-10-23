import { defineConfig, type Connect, type Plugin } from 'vite';
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

const ADMIN_BASE = '/dashboard/CampusAdmin/';

/** Vite's own SPA fallback serves index.html (the visitor entry); route admin page loads to admin.html. */
function adminHtmlFallback(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const url = req.url ?? '';
    const pathname = url.split('?')[0];
    const wantsHtml = req.headers.accept?.includes('text/html');
    if (
      req.method === 'GET' &&
      wantsHtml &&
      pathname.startsWith(ADMIN_BASE) &&
      !pathname.startsWith(`${ADMIN_BASE}@`) &&
      path.extname(pathname) === ''
    ) {
      req.url = `${ADMIN_BASE}admin.html`;
    }
    next();
  };
  return {
    name: 'admin-html-fallback',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  base: ADMIN_BASE,
  // Separate from the visitor dev server; a shared cache makes each server invalidate the other's deps.
  cacheDir: 'node_modules/.vite-admin',
  plugins: [basicSsl(), react(), adminAuthPersistName(), adminHtmlFallback()],
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
