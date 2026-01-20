#!/usr/bin/env node
/**
 * Refine SVG styling to reduce heavy borders and oversized arrowheads.
 *
 * Usage:
 *   node tools/refine-svg-style.mjs docs/assets/svg
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DEFAULT_DIR = join('docs', 'assets', 'svg');

const STYLE_LIMITS = {
  borderMax: 1.6,
  connectorMax: 2.4,
  minBorder: 1.2,
  minConnector: 1.6,
  arrowScale: 0.8,
  arrowMaxSize: 16
};

function formatNumber(num, decimals = 1) {
  const fixed = Number(num).toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d)0+$/, '$1');
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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

function parsePoints(pointsStr) {
  if (!pointsStr) return [];
  return pointsStr
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(',').map(Number))
    .filter(pair => pair.length === 2 && pair.every(n => Number.isFinite(n)));
}

function bboxFromPoints(points) {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function scalePoints(points, factor) {
  const bbox = bboxFromPoints(points);
  if (!bbox) return points;
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  return points.map(([x, y]) => [
    cx + (x - cx) * factor,
    cy + (y - cy) * factor
  ]);
}

function formatPoints(points) {
  return points.map(([x, y]) => `${formatNumber(x)},${formatNumber(y)}`).join(' ');
}

function adjustStrokeWidth(tag, type) {
  const strokeWidth = parseNumber(getAttr(tag, 'stroke-width'));
  if (!strokeWidth) return tag;

  let max = STYLE_LIMITS.connectorMax;
  let min = STYLE_LIMITS.minConnector;
  if (type === 'rect' || type === 'ellipse' || type === 'circle') {
    max = STYLE_LIMITS.borderMax;
    min = STYLE_LIMITS.minBorder;
  }

  let next = strokeWidth;
  if (strokeWidth > max) {
    next = max;
  } else if (strokeWidth > min) {
    next = Math.max(min, strokeWidth * 0.75);
  }

  if (Math.abs(next - strokeWidth) < 0.05) return tag;
  return setAttr(tag, 'stroke-width', formatNumber(next));
}

function adjustPolygon(tag) {
  const pointsStr = getAttr(tag, 'points');
  const points = parsePoints(pointsStr);
  if (points.length < 3) return tag;

  const bbox = bboxFromPoints(points);
  if (!bbox) return tag;

  const maxDim = Math.max(bbox.width, bbox.height);
  if (maxDim > 30) {
    return tag;
  }

  const target = STYLE_LIMITS.arrowMaxSize;
  const scale = Math.min(STYLE_LIMITS.arrowScale, target / maxDim);
  if (!Number.isFinite(scale) || scale >= 1) {
    return tag;
  }

  const scaled = scalePoints(points, scale);
  return setAttr(tag, 'points', formatPoints(scaled));
}

function refineSvg(content) {
  const tagRegex = /<(rect|ellipse|circle|line|path|polygon)\b[^>]*>/gi;
  return content.replace(tagRegex, (tag, type) => {
    let updated = tag;
    updated = adjustStrokeWidth(updated, type.toLowerCase());
    if (type.toLowerCase() === 'polygon') {
      updated = adjustPolygon(updated);
    }
    return updated;
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
    const refined = refineSvg(original);
    if (refined !== original) {
      await writeFile(file, refined, 'utf8');
      updatedCount++;
    }
  }

  console.log(`Refined ${updatedCount} SVG file(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
