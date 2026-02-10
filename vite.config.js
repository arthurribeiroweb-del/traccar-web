import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { execSync } from 'node:child_process';

const resolveAppVersion = () => {
  if (process.env.VITE_APP_VERSION) {
    return process.env.VITE_APP_VERSION;
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch (error) {
    return 'unknown';
  }
};

const emitVersionPlugin = (version) => ({
  name: 'emit-version',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version }),
    });
  },
});

export default defineConfig(() => {
  const appVersion = resolveAppVersion();

  return {
    server: {
      port: 3000,
      proxy: {
        '/api/socket': 'ws://localhost:8082',
        '/api': 'http://localhost:8082',
      },
    },
    build: {
      outDir: 'build',
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    plugins: [
      svgr(),
      react(),
      emitVersionPlugin(appVersion),
      viteStaticCopy({
        targets: [
          { src: 'node_modules/@mapbox/mapbox-gl-rtl-text/dist/mapbox-gl-rtl-text.js', dest: '' },
        ],
      }),
    ],
  };
});
