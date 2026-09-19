// Bumps the service worker cache version and rewrites its shell file list
// from what is actually on disk. Run this before every deploy:
//
//   node tools/bump-cache.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const swPath = join(root, 'sw.js');

const shell = ['./', 'index.html', 'styles.css', 'manifest.webmanifest'];
for (const dir of ['icons', 'src']) shell.push(...walk(join(root, dir)));

let sw = readFileSync(swPath, 'utf8');

const version = sw.match(/const CACHE_VERSION = 'v(\d+)';/);
if (!version) throw new Error('could not find CACHE_VERSION in sw.js');
const next = Number(version[1]) + 1;
sw = sw.replace(version[0], `const CACHE_VERSION = 'v${next}';`);

const list = shell.map((p) => `  '${p}',`).join('\n');
sw = sw.replace(/const SHELL = \[[\s\S]*?\n\];/, `const SHELL = [\n${list}\n];`);

writeFileSync(swPath, sw);
console.log(`sw.js cache is now v${next} with ${shell.length} shell files`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|css|png|json|webmanifest)$/.test(name)) {
      out.push(relative(root, full).split(sep).join('/'));
    }
  }
  return out.sort();
}
