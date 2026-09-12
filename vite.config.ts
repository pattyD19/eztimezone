/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwa } from './build/pwa.ts';

const pkg: { version: string } = JSON.parse(readFileSync('./package.json', 'utf8'));

interface BuildInfo {
  /** Short commit, with a trailing `+` when the tree was dirty. */
  ref: string;
  /** ISO timestamp shown in the stamp's tooltip. */
  time: string;
}

/**
 * Identifies *this* build.
 *
 * The package version alone cannot answer the question a deployed PWA gets
 * asked -- "am I looking at the build that was just shipped, or one the service
 * worker cached?" -- because it does not change between deploys. The commit
 * does.
 *
 * A clean build takes its timestamp from the commit rather than the clock, so
 * the same commit always produces byte-identical output. Stamping `Date.now()`
 * instead makes every rebuild a different bundle: the content hash changes, so
 * every client re-downloads the JS even though nothing in it did, and two
 * builds of one commit cannot be compared to check what is deployed.
 *
 * A dirty tree gets the wall clock, because such a build is not reproducible
 * whatever timestamp it carries -- and it is already marked with `+`.
 */
function buildInfo(): BuildInfo {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    const sha = git('rev-parse', '--short', 'HEAD');
    const dirty = git('status', '--porcelain') !== '';
    return {
      ref: dirty ? `${sha}+` : sha,
      time: dirty ? new Date().toISOString() : git('log', '-1', '--format=%cI'),
    };
  } catch {
    // Built from a tarball, or without git.
    const now = new Date();
    return { ref: now.toISOString().slice(0, 10), time: now.toISOString() };
  }
}

const build = buildInfo();

export default defineConfig({
  plugins: [react(), pwa()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_REF__: JSON.stringify(build.ref),
    __BUILD_TIME__: JSON.stringify(build.time),
  },
  // The time engine is pure and runs on Node's own ICU, so no DOM is needed.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
