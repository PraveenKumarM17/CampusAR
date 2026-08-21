import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import path from 'path';

const cesiumBuildRoot = path.resolve(__dirname, '../../node_modules/cesium/Build');
const cesiumBuildPath = path.join(cesiumBuildRoot, 'Cesium');

export default defineConfig({
  plugins: [
    react(),
    cesium({
      rebuildCesium: true,
      cesiumBuildRootPath: cesiumBuildRoot,
      cesiumBuildPath: `${cesiumBuildPath}/`,
    }),
  ],
  optimizeDeps: {
    // MapLibre v6 ships a sibling ESM worker; pre-bundling breaks worker URL resolution.
    exclude: ['maplibre-gl'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@campusar/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
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
