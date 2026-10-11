const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const assets = ['manifest.json', 'background.js', 'content.js', 'shared.js', 'switcher.html', 'switcher.js', 'switcher.css',
  'options.html', 'options.js', 'options.css', 'fallback.svg', 'icon16.png', 'icon32.png', 'icon48.png', 'icon128.png', 'LICENSE'];
function check(condition, message) { if (!condition) throw new Error(message); }
check(manifest.version === pkg.version, 'Package and manifest versions differ');
check(manifest.manifest_version === 3, 'Manifest V3 is required');
check(manifest.description.length <= 132, 'Description exceeds the store limit');
for (const asset of assets) check(fs.existsSync(path.join(root, asset)), `Missing asset: ${asset}`);
for (const file of assets.filter(asset => asset.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  check(result.status === 0, result.stderr || `Invalid JavaScript: ${file}`);
}
for (const [size, name] of Object.entries(manifest.icons)) {
  const data = fs.readFileSync(path.join(root, name));
  check(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Invalid PNG: ${name}`);
  check(data.readUInt32BE(16) === Number(size) && data.readUInt32BE(20) === Number(size), `Wrong icon dimensions: ${name}`);
}
for (const file of ['background.js', 'content.js', 'shared.js', 'switcher.js', 'options.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  check(!source.includes('google.com/s2/favicons'), `External favicon proxy: ${file}`);
}
check(manifest.content_scripts[0].all_frames && manifest.content_scripts[0].run_at === 'document_start', 'Keyboard bridge must start early in frames');
check(manifest.web_accessible_resources.every(entry => entry.resources.every(name => name === 'switcher.html')), 'Only the opaque UI document should be web-accessible');
console.log(`Validated version ${manifest.version}: syntax, manifest, runtime assets, privacy invariants, and icon dimensions.`);
module.exports = { root, assets, manifest };
