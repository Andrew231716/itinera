import { readdir, writeFile } from 'node:fs/promises';
async function walk(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${item.name}`;
    if (item.isDirectory()) result.push(...await walk(path));
    else if (/\.(js|css|woff2?)$/.test(item.name)) result.push('/_next/' + path.slice('.next/'.length));
  }
  return result;
}
await writeFile('public/offline-assets.json', JSON.stringify(await walk('.next/static')));
const { readFile } = await import('node:fs/promises');
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const worker = await readFile('scripts/service-worker.js', 'utf8');
await writeFile('public/sw.js', worker.replace('itinera-shell-v1', `itinera-shell-${buildId}`));
