/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwa } from './build/pwa.ts';

export default defineConfig({
  plugins: [react(), pwa()],
  // The time engine is pure and runs on Node's own ICU, so no DOM is needed.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
