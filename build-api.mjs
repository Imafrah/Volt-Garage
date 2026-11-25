// build-api.mjs
// Bundles api/server.ts → api/server.js using esbuild.
// Vercel runs the compiled JS directly, bypassing the tsconfig "bundler" moduleResolution
// that only works inside Vite.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/vercelApp.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',           // ESM output — Vercel Node runtime supports it
  outfile: 'api/server.js',
  external: ['express'],   // Keep express as a runtime dependency (not bundled)
  sourcemap: false,
  minify: false,
  tsconfig: undefined,     // Skip tsconfig — esbuild handles TS natively
});

console.log('API bundle written to api/server.js');
