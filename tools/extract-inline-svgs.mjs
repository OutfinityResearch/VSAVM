#!/usr/bin/env node
/**
 * Extract inline SVGs from HTML files into docs/assets/svg.
 * Updates HTML to reference external SVG files via <img>.
 *
 * Usage:
 *   node tools/extract-inline-svgs.mjs docs/wiki docs/theory
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, extname, basename, dirname, relative } from 'node:path';

const DEFAULT_DIRS = ['docs/wiki', 'docs/theory'];
const SVG_DIR = join('docs', 'assets', 'svg');

/**
 * Recursively collect HTML files.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectHtmlFiles(fullPath));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract aria-label from SVG tag.
 * @param {string} svg
 * @returns {string | null}
 */
function extractAriaLabel(svg) {
  const match = svg.match(/aria-label\s*=\s*"([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * Sanitize an alt label.
 * @param {string} label
 * @returns {string}
 */
function sanitizeAlt(label) {
  return String(label).replace(/\\s+/g, ' ').trim();
}

/**
 * Convert path to web-friendly relative path.
 * @param {string} fromDir
 * @param {string} toPath
 * @returns {string}
 */
function toRelativeWebPath(fromDir, toPath) {
  const rel = relative(fromDir, toPath);
  return rel.split('\\').join('/');
}

async function main() {
  const dirs = process.argv.slice(2);
  const targetDirs = dirs.length > 0 ? dirs : DEFAULT_DIRS;

  await mkdir(SVG_DIR, { recursive: true });

  let extractedCount = 0;
  const updatedFiles = [];

  for (const dir of targetDirs) {
    const exists = await stat(dir).then(() => true).catch(() => false);
    if (!exists) continue;

    const htmlFiles = await collectHtmlFiles(dir);
    for (const filePath of htmlFiles) {
      const raw = await readFile(filePath, 'utf8');
      const svgRegex = /<svg[\s\S]*?<\/svg>/g;

      let match;
      let index = 0;
      let updated = raw;
      const replacements = [];

      while ((match = svgRegex.exec(raw)) !== null) {
        index++;
        const svgBlock = match[0];
        const fileBase = basename(filePath, '.html');
        const svgName = `${fileBase}-diagram${index > 1 ? `-${index}` : ''}.svg`;
        const svgPath = join(SVG_DIR, svgName);

        await writeFile(svgPath, svgBlock, 'utf8');
        extractedCount++;

        const ariaLabel = extractAriaLabel(svgBlock);
        const alt = sanitizeAlt(ariaLabel || `${fileBase} diagram`);

        const htmlDir = dirname(filePath);
        const relPath = toRelativeWebPath(htmlDir, svgPath);

        const indentStart = raw.lastIndexOf('\\n', match.index);
        const indent = indentStart === -1 ? '' : raw.slice(indentStart + 1, match.index);

        const imgTag = `${indent}<img class="diagram-svg" src="${relPath}" alt="${alt}">`;

        replacements.push({
          start: match.index,
          end: match.index + svgBlock.length,
          replacement: imgTag
        });
      }

      if (replacements.length > 0) {
        let rebuilt = '';
        let cursor = 0;
        for (const rep of replacements) {
          rebuilt += updated.slice(cursor, rep.start);
          rebuilt += rep.replacement;
          cursor = rep.end;
        }
        rebuilt += updated.slice(cursor);

        await writeFile(filePath, rebuilt, 'utf8');
        updatedFiles.push(filePath);
      }
    }
  }

  console.log(`Extracted ${extractedCount} inline SVG(s) into ${SVG_DIR}.`);
  if (updatedFiles.length > 0) {
    console.log('Updated HTML files:');
    for (const file of updatedFiles) {
      console.log(`- ${file}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
