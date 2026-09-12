/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwa } from './build/pwa.ts';

const pkg: { version: string } = JSON.parse(readFileSync('./package.json', 'utf8'));

/**
 * A short identifier for *this* build.
 *
 * The package version alone cannot answer the question a deployed PWA actually
 * gets asked -- "am I looking at the build I just shipped, or one the service
 * worker cached?" -- because it does not change between deploys. The commit
 * does, and a trailing `+` marks a build made from a dirty tree, so a stamp
 * can never quietly claim to be a commit it isn't.
 */
function buildRef(): string {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    return git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain') ? '+' : '');
  } catch {
    // Built from a tarball, or without git: fall back to the date.
    return new Date().toISOString().slice(0, 10);
  }
}

export default defineConfig({
  plugins: [react(), pwa()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_REF__: JSON.stringify(buildRef()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // The time engine is pure and runs on Node's own ICU, so no DOM is needed.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
