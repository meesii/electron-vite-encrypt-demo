import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin, bytecodePlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin(), bytecodePlugin()],
        build: {
            outDir: 'dist/main',
            emptyOutDir: true,
            sourcemap: false,
            rollupOptions: {
                external: ['original-fs']
            }
        }
    },
    preload: {
        plugins: [externalizeDepsPlugin(), bytecodePlugin()],
        build: {
            outDir: 'dist/preload',
            emptyOutDir: true,
            sourcemap: false
        }
    },
    renderer: {
        resolve: {
            alias: {
                '@renderer': resolve('src/renderer/src')
            }
        },
        plugins: [vue()],
        build: {
            outDir: 'dist/renderer',
            emptyOutDir: true,
            sourcemap: false
        }
    }
});
