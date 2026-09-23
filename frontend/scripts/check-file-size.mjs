#!/usr/bin/env node
/**
 * Enforces the architecture's hard rule: no handwritten frontend source file
 * may exceed 350 lines (OPENISAVE2_PROJECT_ARCHITECTURE.md section 9).
 *
 * Exits non-zero when any file is at or over the limit.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 350;
const WARN_AT = 300;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.vite', 'coverage']);
/** Generated files are excluded by the architecture; list them explicitly. */
const EXCLUDED_FILES = new Set(['src/vite-env.d.ts']);

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const searchRoot = join(root, 'src');

function collect(directory, found = []) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry)) collect(fullPath, found);
      continue;
    }
    if (EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(fullPath);
  }
  return found;
}

function countLines(filePath) {
  return readFileSync(filePath, 'utf8').split(/\r\n|\r|\n/).length;
}

const results = collect(searchRoot)
  .map((filePath) => ({
    path: relative(root, filePath).split(sep).join('/'),
    lines: countLines(filePath),
  }))
  .filter((entry) => !EXCLUDED_FILES.has(entry.path))
  .sort((a, b) => b.lines - a.lines);

const violations = results.filter((entry) => entry.lines >= LIMIT);
const warnings = results.filter((entry) => entry.lines >= WARN_AT && entry.lines < LIMIT);

console.log(`Checked ${results.length} handwritten frontend files (limit ${LIMIT} lines).`);

if (results.length > 0) {
  console.log('\nLargest files:');
  results.slice(0, 5).forEach((entry) => {
    console.log(`  ${String(entry.lines).padStart(4)}  ${entry.path}`);
  });
}

if (warnings.length > 0) {
  console.log(`\nApproaching the limit (>= ${WARN_AT} lines):`);
  warnings.forEach((entry) => console.log(`  ${String(entry.lines).padStart(4)}  ${entry.path}`));
}

if (violations.length > 0) {
  console.error(`\nFAILED: ${violations.length} file(s) at or over ${LIMIT} lines:`);
  violations.forEach((entry) => console.error(`  ${String(entry.lines).padStart(4)}  ${entry.path}`));
  console.error('\nSplit these files by responsibility before continuing.');
  process.exit(1);
}

console.log('\nOK: every handwritten frontend file is under the 350-line limit.');
