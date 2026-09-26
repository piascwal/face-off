import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@core': '/src/core',
      '@render': '/src/render',
      '@audio': '/src/audio',
      '@input': '/src/input',
      '@app': '/src/app',
      '@net': '/src/net',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
