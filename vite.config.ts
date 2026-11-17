import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` makes the build work from any GitHub Pages sub-path
// (e.g. https://user.github.io/repo-name/) without configuration.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
