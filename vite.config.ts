import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// Stamped into the app so you can tell which build is running (shown on the main menu
// and the Tournament Management tab). "+local" marks a build with uncommitted changes.
const commit = git('rev-parse --short HEAD') || 'unknown';
const dirty = git('status --porcelain') !== '';

// `base: './'` makes the build work from any GitHub Pages sub-path
// (e.g. https://user.github.io/repo-name/) without configuration.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_COMMIT__: JSON.stringify(dirty ? `${commit}+local` : commit),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
