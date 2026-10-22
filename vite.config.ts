import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: {
        device: 'metaQuestPro',
        environment: 'office_small',
        activation: 'localhost',
      },
      https: true,
      verbose: true,
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 8082,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
  },
  esbuild: {
    target: 'esnext',
  },
  publicDir: 'public',
  base: './',
});
