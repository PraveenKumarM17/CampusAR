import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'apps/web/dist');
const extensions = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.map']);
const needles = [
  'admin',
  'campusadmin',
  'map-builder',
  'mapbuilder',
  'adminmapeditor',
  'analytics/summary',
  'admin123',
  'campusar-admin-auth',
];

/** Exact vendor phrases approved by the project owner. Matches inside them are reported, not failed. */
const allowedPhrases = [
  {
    phrase: 'National Oceanic and Atmospheric Administration',
    reason: 'Cesium imagery credit text',
  },
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (extensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

function allowedRanges(lower) {
  const ranges = [];
  for (const entry of allowedPhrases) {
    const phrase = entry.phrase.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(phrase, from);
      if (at < 0) break;
      ranges.push({ start: at, end: at + phrase.length, entry });
      from = at + phrase.length;
    }
  }
  return ranges;
}

const info = await stat(dist).catch(() => null);
if (!info?.isDirectory()) {
  console.error(`Visitor dist not found: ${dist}`);
  process.exit(1);
}

const files = await walk(dist);
const hits = [];
const allowed = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const lower = text.toLowerCase();
  const ranges = allowedRanges(lower);
  const rel = path.relative(root, file);
  for (const needle of needles) {
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      from = at + needle.length;
      const range = ranges.find((r) => at >= r.start && at + needle.length <= r.end);
      if (range) {
        allowed.push({ file: rel, needle, entry: range.entry });
        continue;
      }
      const excerpt = text.slice(
        Math.max(0, at - 40),
        Math.min(text.length, at + needle.length + 40),
      );
      hits.push({ file: rel, needle, excerpt: excerpt.replace(/\s+/g, ' ') });
    }
  }
}

for (const item of allowed) {
  console.log(
    `allowed: ${item.file}: ${item.needle}: "${item.entry.phrase}" (${item.entry.reason})`,
  );
}

if (hits.length === 0) {
  console.log(`No admin leaks in ${files.length} visitor dist files.`);
  process.exit(0);
}

for (const hit of hits) {
  console.error(`${hit.file}: ${hit.needle}: ${hit.excerpt}`);
}
console.error(`${hits.length} admin leak hit(s) in the visitor build.`);
process.exit(1);
