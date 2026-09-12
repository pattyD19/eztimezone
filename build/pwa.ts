import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Emits the service worker with its precache list baked in.
 *
 * The list has to be produced at build time because Vite content-hashes asset
 * filenames, and it has to include the contents of `public/` -- icons, the
 * manifest -- which are copied verbatim and so never appear in the bundle.
 *
 * The version is a hash of the precache list itself, so the cache name changes
 * exactly when the set of cached files does, and not on every rebuild.
 */

const PRECACHEABLE = /\.(?:js|css|html|png|svg|webmanifest|woff2?)$/;

function listPublicFiles(dir: string, prefix = ''): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = posix.join(prefix, entry);
    if (statSync(full).isDirectory()) out = out.concat(listPublicFiles(full, rel));
    else if (PRECACHEABLE.test(entry)) out.push(rel);
  }
  return out;
}

export function pwa(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'eztimezone:pwa',
    apply: 'build',

    configResolved(resolved) {
      config = resolved;
    },

    generateBundle(_options, bundle) {
      const base = config.base.endsWith('/') ? config.base : `${config.base}/`;

      const fromBundle = Object.keys(bundle).filter((name) => PRECACHEABLE.test(name));

      let fromPublic: string[] = [];
      try {
        fromPublic = listPublicFiles(resolve(config.root, config.publicDir));
      } catch {
        // No public directory: nothing extra to precache.
      }

      // The entry document is added explicitly rather than taken from the
      // bundle: `generateBundle` runs before Vite's HTML plugin emits it, so
      // it is not there yet. Leaving it out silently breaks the one thing the
      // worker exists for -- the offline navigation fallback would look for a
      // shell that was never cached.
      const shell = `${base}index.html`;
      const assets = [
        shell,
        ...[...new Set([...fromBundle, ...fromPublic])].sort().map((name) => base + name),
      ];

      if (!assets.includes(shell)) {
        this.error('pwa: the app shell is missing from the precache list');
      }

      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);

      const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
      const source = template
        .replace('__VERSION__', version)
        .replace('__SHELL__', shell)
        .replace('__ASSETS__', JSON.stringify(assets, null, 2));

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
      config.logger.info(`  pwa  sw.js precaching ${assets.length} files (${version})`);
    },
  };
}
