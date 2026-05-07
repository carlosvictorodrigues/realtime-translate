import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: { entry: 'src/main/app.ts', formats: ['es'] },
      rollupOptions: { external: ['electron', 'ws'] }
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: { entry: 'src/main/preload.ts', formats: ['cjs'] }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          offscreen: resolve('src/renderer/offscreen.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@offscreen': resolve('src/offscreen'),
        '@shared': resolve('src/shared')
      }
    }
  }
});
