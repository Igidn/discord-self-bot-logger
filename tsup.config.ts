import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  clean: true,
  bundle: true,
  shims: true,
  // sharp and better-sqlite3 are native modules; keep them external
  external: ['sharp', 'better-sqlite3', 'discord.js-selfbot-v13'],
});
