#!/usr/bin/env node
/**
 * Increase vertical spacing between main content and legend blocks.
 *
 * Usage:
 *   node tools/space-svg-legend.mjs docs/assets/svg
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DEFAULT_DIR = join('docs', 'assets', 'svg');
const TARGET_GAP = 14;
const DESCENDER_RATIO = 0.3;

function getAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i');
  const match = tag.match(re);
  return match ? match[1] : null;
}

function setAttr(tag, name, value) {
  if (new RegExp(`${name}\\s*=`, 'i').test(tag)) {
    return tag.replace(new RegExp(`${name}\\s*=\\s*"[^"]+"`, 'i'), `${name}="${value}"`);
  }
  return tag.replace(/<\w+/, match => `${match} ${name}="${value}"`);
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function parseViewBox(svg) {
  const match = svg.match(/<svg\b[^>]*viewBox="([^"]+)"/i);
  if (!match) return null;
  const parts = match[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isFinite(p))) return null;
  return { raw: match[0], values: parts };
}

function updateViewBox(svg, delta) {
  const viewBox = parseViewBox(svg);
  if (!viewBox) return svg;
  const [x, y, w, h] = viewBox.values;
  const next = [x, y, w, h + delta].map(formatNumber).join(' ');
  return svg.replace(/viewBox="[^"]+"/i, `viewBox="${next}"`);
}

function collectRectTags(svg) {
  const tags = svg.match(/<rect\b[^>]*>/gi) || [];
  return tags.map(tag => {
    const y = parseNumber(getAttr(tag, 'y')) ?? 0;
    const height = parseNumber(getAttr(tag, 'height')) ?? 0;
    const fill = (getAttr(tag, 'fill') || '').toLowerCase();
    const x = parseNumber(getAttr(tag, 'x')) ?? 0;
    const width = parseNumber(getAttr(tag, 'width')) ?? 0;
    return { tag, y, height, fill, x, width };
  });
}

function collectTextTags(svg) {
  const tags = svg.match(/<text\b[^>]*>[\s\S]*?<\/text>/gi) || [];
  return tags.map(tag => {
    const x = parseNumber(getAttr(tag, 'x')) ?? 0;
    const y = parseNumber(getAttr(tag, 'y')) ?? 0;
    const fontSize = parseNumber(getAttr(tag, 'font-size')) ?? 12;
    const content = tag.replace(/<text\b[^>]*>/i, '').replace(/<\/text>/i, '').trim();
    return { tag, x, y, fontSize, content };
  });
}

function isSameRect(tag, rect) {
  const x = parseNumber(getAttr(tag, 'x')) ?? 0;
  const y = parseNumber(getAttr(tag, 'y')) ?? 0;
  const width = parseNumber(getAttr(tag, 'width')) ?? 0;
  const height = parseNumber(getAttr(tag, 'height')) ?? 0;
  return Math.abs(x - rect.x) < 0.5 &&
    Math.abs(y - rect.y) < 0.5 &&
    Math.abs(width - rect.width) < 0.5 &&
    Math.abs(height - rect.height) < 0.5;
}

function shiftY(tag, delta) {
  const y = parseNumber(getAttr(tag, 'y'));
  if (!Number.isFinite(y)) return tag;
  return setAttr(tag, 'y', formatNumber(y + delta));
}

function shiftLineY(tag, delta) {
  const y1 = parseNumber(getAttr(tag, 'y1'));
  const y2 = parseNumber(getAttr(tag, 'y2'));
  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return tag;
  let updated = setAttr(tag, 'y1', formatNumber(y1 + delta));
  updated = setAttr(updated, 'y2', formatNumber(y2 + delta));
  return updated;
}

function shiftText(tag, delta) {
  return shiftY(tag, delta);
}

function adjustLegend(svg) {
  let rects = collectRectTags(svg);
  let legendCandidates = rects.filter(r => r.fill === 'none');
  let legendRect = legendCandidates.sort((a, b) => b.y - a.y)[0];
  if (!legendRect) return { svg, delta: 0 };

  const above = rects
    .filter(r => r.y + r.height <= legendRect.y)
    .map(r => r.y + r.height);
  const maxBottom = above.length > 0 ? Math.max(...above) : null;

  const gap = maxBottom === null ? null : legendRect.y - maxBottom;
  const delta = gap === null || gap >= TARGET_GAP ? 0 : TARGET_GAP - gap;

  let updated = svg;
  if (delta > 0) {
    updated = updated.replace(/<rect\b[^>]*>/gi, tag => {
      if (isSameRect(tag, legendRect)) {
        return shiftY(tag, delta);
      }
      return tag;
    });

    updated = updated.replace(/<text\b[^>]*>/gi, tag => {
      const y = parseNumber(getAttr(tag, 'y'));
      if (!Number.isFinite(y)) return tag;
      if (y >= legendRect.y - 1) {
        return shiftText(tag, delta);
      }
      return tag;
    });

    updated = updated.replace(/<line\b[^>]*>/gi, tag => {
      const y1 = parseNumber(getAttr(tag, 'y1'));
      const y2 = parseNumber(getAttr(tag, 'y2'));
      if (!Number.isFinite(y1) || !Number.isFinite(y2)) return tag;
      if (y1 >= legendRect.y - 1 && y2 >= legendRect.y - 1) {
        return shiftLineY(tag, delta);
      }
      return tag;
    });

    updated = updateViewBox(updated, delta);
  }

  rects = collectRectTags(updated);
  legendCandidates = rects.filter(r => r.fill === 'none');
  legendRect = legendCandidates.sort((a, b) => b.y - a.y)[0];
  if (!legendRect) return { svg: updated, delta };

  const texts = collectTextTags(updated);
  const legendTexts = texts.filter(t => t.y >= legendRect.y - 1 && t.x >= legendRect.x - 4 && t.x <= legendRect.x + legendRect.width + 4);
  if (legendTexts.length > 0) {
    const maxBottom = Math.max(...legendTexts.map(t => t.y + t.fontSize * DESCENDER_RATIO));
    const neededHeight = maxBottom + 8 - legendRect.y;
    if (neededHeight > legendRect.height + 0.5) {
      updated = updated.replace(/<rect\b[^>]*>/gi, tag => {
        if (!isSameRect(tag, legendRect)) return tag;
        return setAttr(tag, 'height', formatNumber(neededHeight));
      });

      const viewBox = parseViewBox(updated);
      if (viewBox) {
        const [, vy, , vh] = viewBox.values;
        const viewBottom = vy + vh;
        const legendBottom = legendRect.y + neededHeight;
        if (legendBottom + 2 > viewBottom) {
          updated = updateViewBox(updated, legendBottom + 2 - viewBottom);
        }
      }
    }
  }

  return { svg: updated, delta };
}

async function collectSvgFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSvgFiles(full));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.svg') {
      files.push(full);
    }
  }

  return files;
}

async function main() {
  const targetDir = process.argv[2] || DEFAULT_DIR;
  const exists = await stat(targetDir).then(() => true).catch(() => false);
  if (!exists) {
    console.error(`SVG directory not found: ${targetDir}`);
    process.exit(1);
  }

  const svgFiles = await collectSvgFiles(targetDir);
  let updatedCount = 0;

  for (const file of svgFiles) {
    const original = await readFile(file, 'utf8');
    const result = adjustLegend(original);
    if (result.svg !== original) {
      await writeFile(file, result.svg, 'utf8');
      updatedCount++;
    }
  }

  console.log(`Adjusted legend spacing in ${updatedCount} SVG file(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
