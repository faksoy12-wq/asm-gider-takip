'use strict';
/*
 * Publish only browser assets to Cloudflare Pages / Render static hosting.
 * Never copy the Vercel API, migrations, source repository metadata or secrets.
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const assets = [
  'index.html',
  'style.css',
  'app.js',
  'cloud.js',
  'allowance-math.js',
  'pdf-report.js',
  'sw.js',
  'manifest.webmanifest',
  'public-config.json',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon-32.png',
  'favicon-48.png'
];
fs.rmSync(output, {recursive: true, force: true});
fs.mkdirSync(output, {recursive: true});
for (const file of assets) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) throw new Error('Missing static asset: ' + file);
  fs.copyFileSync(source, path.join(output, file));
}
const config = JSON.parse(fs.readFileSync(path.join(output, 'public-config.json'), 'utf8'));
if (config.enabled !== true || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)
  || !/^sb_publishable_[\w-]+$/.test(config.publishableKey)) {
  throw new Error('Missing/invalid public Supabase configuration');
}
console.log('Static site ready: ' + assets.length + ' public assets in dist/');
