import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  plugins: mode === 'singlefile' ? [viteSingleFile()] : [],
  define: {
    '__APP_VERSION__': JSON.stringify(process.env.npm_package_version || '0.7.1'),
    '__BUILD_DATE__': JSON.stringify(new Date().toISOString().split('T')[0]),
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    setupFiles: 'tests/setup.ts',
  },
}));
