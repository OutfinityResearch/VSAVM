#!/usr/bin/env node
/**
 * Reduce text font-size if estimated width exceeds containing box.
 *
 * Usage:
 *   node tools/fit-svg-text.mjs docs/assets/svg
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DEFAULT_DIR = join('docs', 'assets', 'svg');
const MIN_FONT_SIZE = 11;
const PADDING = 8;
const CHAR_WIDTH_RATIO = 0.55;

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

function stripDefs(svg) {
  return svg.replace(/<defs[\s\S]*?<\/defs>/gi, '');
}

function collectTags(svg, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return svg.match(re) || [];
}

function extractRects(svg) {
  const rects = [];
  for (const tag of collectTags(svg, 'rect')) {
    const x = parseNumber(getAttr(tag, 'x')) ?? 0;
    const y = parseNumber(getAttr(tag, 'y')) ?? 0;
    const width = parseNumber(getAttr(tag, 'width')) ?? 0;
    const height = parseNumber(getAttr(tag, 'height')) ?? 0;
    rects.push({ x, y, width, height });
  }
  return rects;
}

function isTextInsideRect(text, rect, padding = 0) {
  const x = text.x;
  const y = text.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= rect.x + padding &&
    x <= rect.x + rect.width - padding &&
    y >= rect.y + padding &&
    y <= rect.y + rect.height - padding;
}

function findRectForText(text, rects) {
  const candidates = rects.filter(rect => isTextInsideRect(text, rect, 2));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaA !== areaB) return areaA - areaB;
    const centerA = a.y + a.height / 2;
    const centerB = b.y + b.height / 2;
    return Math.abs(centerA - text.y) - Math.abs(centerB - text.y);
  });
  return candidates[0] || null;
}

function estimateWidth(text, fontSize) {
  return text.length * fontSize * CHAR_WIDTH_RATIO;
}

function adjustTextTag(tag, rect) {
  const x = parseNumber(getAttr(tag, 'x'));
  const fontSize = parseNumber(getAttr(tag, 'font-size'));
  if (!Number.isFinite(x) || !Number.isFinite(fontSize)) return tag;

  const anchor = (getAttr(tag, 'text-anchor') || 'start').toLowerCase();
  const content = tag.replace(/<text\b[^>]*>/i, '').replace(/<\/text>/i, '').trim();
  if (!content) return tag;

  const available = rect.width - PADDING * 2;
  let current = estimateWidth(content, fontSize);
  if (current <= available) return tag;

  const neededScale = available / current;
  const nextSize = Math.max(MIN_FONT_SIZE, fontSize * neededScale);
  if (nextSize >= fontSize) return tag;

  return setAttr(tag, 'font-size', formatNumber(nextSize));
}

function fitText(svg) {
  const content = stripDefs(svg);
  const rects = extractRects(content);
  if (rects.length === 0) return svg;

  const textRegex = /<text\b[^>]*>[\s\S]*?<\/text>/gi;
  return svg.replace(textRegex, tag => {
    const x = parseNumber(getAttr(tag, 'x'));
    const y = parseNumber(getAttr(tag, 'y'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return tag;
    const rect = findRectForText({ x, y }, rects);
    if (!rect) return tag;
    return adjustTextTag(tag, rect);
  });
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
    const updated = fitText(original);
    if (updated !== original) {
      await writeFile(file, updated, 'utf8');
      updatedCount++;
    }
  }

  console.log(`Adjusted text sizing in ${updatedCount} SVG file(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
