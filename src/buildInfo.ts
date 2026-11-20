declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

/** Git commit the app was built from, with "+local" if it had uncommitted changes. */
export const APP_COMMIT = __APP_COMMIT__;
/** When the app was built (for the dev server: when it was started). ISO 8601. */
export const APP_BUILD_TIME = __APP_BUILD_TIME__;

export function versionLabel(): string {
  const built = new Date(APP_BUILD_TIME).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return `Version ${APP_COMMIT} · built ${built}${import.meta.env.DEV ? ' · dev server' : ''}`;
}
