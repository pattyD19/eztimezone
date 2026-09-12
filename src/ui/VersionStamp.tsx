/**
 * Build stamp.
 *
 * Deliberately shows the commit as well as the version: the service worker
 * caches aggressively, so the useful question is not "what version is this"
 * but "is this the build that was deployed". A trailing `+` means the build
 * was made from a tree with uncommitted changes.
 */
export function VersionStamp() {
  const built = new Date(__BUILD_TIME__);
  const on = built.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <p className="version" title={`EzTimeZone ${__APP_VERSION__}, build ${__BUILD_REF__}, built ${on}`}>
      v{__APP_VERSION__} <span aria-hidden="true">·</span> {__BUILD_REF__}
    </p>
  );
}
