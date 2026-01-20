#!/usr/bin/env node
/**
 * Expand SVG viewBox to fully contain drawn elements.
 *
 * Usage:
 *   node tools/fit-svg-viewbox.mjs docs/assets/svg
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DEFAULT_DIR = join('docs', 'assets', 'svg');
const PADDING = 6;

function getAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i');
  const match = tag.match(re);
  return match ? match[1] : null;
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseViewBox(svg) {
  const match = svg.match(/<svg\b[^>]*viewBox="([^"]+)"/i);
  if (!match) return null;
  const parts = match[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isFinite(p))) return null;
  return { raw: match[0], values: parts };
}

function updateViewBox(svg, values) {
  const viewBox = values.map(v => Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '')).join(' ');
  return svg.replace(/viewBox="[^"]+"/i, `viewBox="${viewBox}"`);
}

function stripDefs(svg) {
  return svg.replace(/<defs[\s\S]*?<\/defs>/gi, '');
}

function collectTags(svg, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return svg.match(re) || [];
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
  return { minX, minY, maxX, maxY };
}

function parsePathEndpoints(d) {
  if (!d) return null;
  const startMatch = d.match(/[Mm]\s*([-\d.]+)[,\s]+([-\d.]+)/);
  const nums = d.match(/[-\d.]+/g)?.map(Number).filter(n => Number.isFinite(n));
  if (!startMatch || !nums || nums.length < 2) return null;
  return {
    start: { x: Number(startMatch[1]), y: Number(startMatch[2]) },
    end: { x: nums[nums.length - 2], y: nums[nums.length - 1] }
  };
}

function expandBounds(bounds, minX, minY, maxX, maxY) {
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return bounds;
  return {
    minX: Math.min(bounds.minX, minX),
    minY: Math.min(bounds.minY, minY),
    maxX: Math.max(bounds.maxX, maxX),
    maxY: Math.max(bounds.maxY, maxY)
  };
}

function computeBounds(svg) {
  const content = stripDefs(svg);
  let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  for (const tag of collectTags(content, 'rect')) {
    const x = parseNumber(getAttr(tag, 'x')) ?? 0;
    const y = parseNumber(getAttr(tag, 'y')) ?? 0;
    const width = parseNumber(getAttr(tag, 'width')) ?? 0;
    const height = parseNumber(getAttr(tag, 'height')) ?? 0;
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width')) ?? 0;
    const pad = strokeWidth / 2;
    bounds = expandBounds(bounds, x - pad, y - pad, x + width + pad, y + height + pad);
  }

  for (const tag of collectTags(content, 'ellipse')) {
    const cx = parseNumber(getAttr(tag, 'cx')) ?? 0;
    const cy = parseNumber(getAttr(tag, 'cy')) ?? 0;
    const rx = parseNumber(getAttr(tag, 'rx')) ?? 0;
    const ry = parseNumber(getAttr(tag, 'ry')) ?? 0;
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width')) ?? 0;
    const pad = strokeWidth / 2;
    bounds = expandBounds(bounds, cx - rx - pad, cy - ry - pad, cx + rx + pad, cy + ry + pad);
  }

  for (const tag of collectTags(content, 'circle')) {
    const cx = parseNumber(getAttr(tag, 'cx')) ?? 0;
    const cy = parseNumber(getAttr(tag, 'cy')) ?? 0;
    const r = parseNumber(getAttr(tag, 'r')) ?? 0;
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width')) ?? 0;
    const pad = strokeWidth / 2;
    bounds = expandBounds(bounds, cx - r - pad, cy - r - pad, cx + r + pad, cy + r + pad);
  }

  for (const tag of collectTags(content, 'line')) {
    const x1 = parseNumber(getAttr(tag, 'x1')) ?? 0;
    const y1 = parseNumber(getAttr(tag, 'y1')) ?? 0;
    const x2 = parseNumber(getAttr(tag, 'x2')) ?? 0;
    const y2 = parseNumber(getAttr(tag, 'y2')) ?? 0;
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width')) ?? 0;
    const pad = strokeWidth / 2;
    bounds = expandBounds(bounds, Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.max(x1, x2) + pad, Math.max(y1, y2) + pad);
  }

  for (const tag of collectTags(content, 'polygon')) {
    const points = parsePoints(getAttr(tag, 'points'));
    const bbox = bboxFromPoints(points);
    if (!bbox) continue;
    bounds = expandBounds(bounds, bbox.minX, bbox.minY, bbox.maxX, bbox.maxY);
  }

  for (const tag of collectTags(content, 'path')) {
    if (!/stroke\s*=/.test(tag)) continue;
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width')) ?? 0;
    const pad = strokeWidth / 2;
    const endpoints = parsePathEndpoints(getAttr(tag, 'd'));
    if (!endpoints) continue;
    bounds = expandBounds(
      bounds,
      Math.min(endpoints.start.x, endpoints.end.x) - pad,
      Math.min(endpoints.start.y, endpoints.end.y) - pad,
      Math.max(endpoints.start.x, endpoints.end.x) + pad,
      Math.max(endpoints.start.y, endpoints.end.y) + pad
    );
  }

  return bounds;
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
    const viewBox = parseViewBox(original);
    if (!viewBox) continue;

    const bounds = computeBounds(original);
    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) {
      continue;
    }

    const [vx, vy, vw, vh] = viewBox.values;
    const vMaxX = vx + vw;
    const vMaxY = vy + vh;

    const newMinX = Math.min(vx, bounds.minX - PADDING);
    const newMinY = Math.min(vy, bounds.minY - PADDING);
    const newMaxX = Math.max(vMaxX, bounds.maxX + PADDING);
    const newMaxY = Math.max(vMaxY, bounds.maxY + PADDING);

    const next = [newMinX, newMinY, newMaxX - newMinX, newMaxY - newMinY];

    if (next.some((v, idx) => Math.abs(v - viewBox.values[idx]) > 0.5)) {
      const updated = updateViewBox(original, next);
      await writeFile(file, updated, 'utf8');
      updatedCount++;
    }
  }

  console.log(`Adjusted viewBox for ${updatedCount} SVG file(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
