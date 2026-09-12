/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The time engine is pure and runs on Node's own ICU, so no DOM is needed.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
