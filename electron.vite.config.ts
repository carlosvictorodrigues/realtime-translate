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
      rollupOptions: {
        input: {
          preload: resolve('src/main/preload.ts'),
          offscreenPreload: resolve('src/main/offscreenPreload.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    publicDir: resolve('assets'),
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          offscreen: resolve('src/renderer/offscreen.html'),
          floatingWidget: resolve('src/renderer/floating-widget.html'),
          setupView: resolve('src/renderer/setup-view.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@offscreen': resolve('src/renderer/offscreen'),
        '@shared': resolve('src/shared')
      }
    }
  }
});
