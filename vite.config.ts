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
function tryGit(...args: string[]): string | null {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function buildInfo(): BuildInfo {
  // On a CI build the platform states the commit outright, which beats shelling
  // out: the checkout is often shallow, and it is never a tree anyone has been
  // editing, so the dirty check would be noise at best and wrong at worst.
  const ciSha =
    process.env['COMMIT_REF'] ?? // Netlify
    process.env['GITHUB_SHA'] ?? // GitHub Actions
    null;

  const sha = ciSha ? ciSha.slice(0, 7) : tryGit('rev-parse', '--short', 'HEAD');
  if (!sha) {
    // Built from a tarball, or without git.
    const now = new Date();
    return { ref: now.toISOString().slice(0, 10), time: now.toISOString() };
  }

  const status = ciSha ? '' : tryGit('status', '--porcelain');
  const dirty = status !== null && status !== '';
  const committedAt = tryGit('log', '-1', '--format=%cI');

  return {
    ref: dirty ? `${sha}+` : sha,
    time: !dirty && committedAt ? committedAt : new Date().toISOString(),
  };
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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Type-only declarations and the entry point have nothing to execute.
      exclude: ['src/**/*.test.ts', 'src/vite-env.d.ts', 'src/main.tsx'],
      reporter: ['text', 'html'],

      /**
       * Thresholds are per-target, and there is deliberately no global one.
       *
       * A single project-wide number would fight the testing strategy rather
       * than enforce it: the UI is left to browser verification on purpose, so
       * adding a component would drag the global figure down and fail the
       * build. That pressures whoever added it into writing shallow DOM tests
       * or lowering the bar again, and neither makes the app more correct.
       *
       * Naming the parts that must stay covered says the same thing honestly,
       * and keeps growth in the untested areas from setting off an alarm about
       * the tested ones. Each is set a little below where it stands, so churn
       * is tolerated and a real regression is not.
       */
      thresholds: {
        // The timezone and interval maths: where a mistake is both easy to make
        // and invisible on screen.
        'src/time/**': { statements: 97, branches: 90, functions: 100, lines: 97 },

        // Two real bugs have already lived here.
        'src/state/TimelineStore.ts': {
          statements: 90,
          branches: 78,
          functions: 90,
          lines: 92,
        },

        // Small files that parse input the app does not control, and must never
        // throw. At 100% today; growing them without tests is the regression.
        'src/lib/share.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'src/lib/storage.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
      },
    },
  },
});
