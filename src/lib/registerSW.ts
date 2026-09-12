/**
 * Service worker registration.
 *
 * Offline support is an enhancement: every failure path here is swallowed,
 * because a browser that blocks service workers (or a page served over plain
 * http) must still get a working app.
 */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) {
    // A worker registered by a previous production build on this origin would
    // otherwise keep serving stale assets over the dev server.
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((r) => void r.unregister()))
      .catch(() => {});
    return;
  }

  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
  });
}
