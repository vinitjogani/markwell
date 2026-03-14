import * as esbuild from 'esbuild';
import { mkdirSync } from 'fs';

const watch = process.argv.includes('--watch');

mkdirSync('out/webview', { recursive: true });

const ctx = await esbuild.context({
  entryPoints: ['webview-src/main.ts'],
  bundle: true,
  outfile: 'out/webview/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome108'],
  sourcemap: 'inline',
  minify: false,
  define: {
    'process.env.NODE_ENV': '"development"',
  },
});

if (watch) {
  await ctx.watch();
  console.log('[esbuild] watching webview-src...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('[esbuild] webview bundle built → out/webview/bundle.js');
}
