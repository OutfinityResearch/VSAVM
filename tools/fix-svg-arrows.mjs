#!/usr/bin/env node
/**
 * Normalize arrowheads in SVG diagrams by removing polygon arrowheads
 * and applying marker-end to connector lines/paths.
 *
 * Usage:
 *   node tools/fix-svg-arrows.mjs docs/assets/svg
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DEFAULT_DIR = join('docs', 'assets', 'svg');
const ARROW_MARKER_ID = 'arrowhead';
const ARROW_MAX_SIZE = 30;

function getAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i');
  const match = tag.match(re);
  return match ? match[1] : null;
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

function isArrowPolygon(tag) {
  const points = parsePoints(getAttr(tag, 'points'));
  if (points.length !== 3) return false;
  const bbox = bboxFromPoints(points);
  if (!bbox) return false;
  const maxDim = Math.max(bbox.width, bbox.height);
  if (maxDim > ARROW_MAX_SIZE) return false;
  const fill = (getAttr(tag, 'fill') || '').toLowerCase();
  if (fill && !['#16b879', '#0b6eff'].includes(fill)) {
    return false;
  }
  return true;
}

function ensureMarker(svg) {
  if (new RegExp(`<marker\\b[^>]*id=\"${ARROW_MARKER_ID}\"`, 'i').test(svg)) {
    return svg;
  }

  const marker = `\n    <marker id=\"${ARROW_MARKER_ID}\" markerWidth=\"8\" markerHeight=\"8\" refX=\"7\" refY=\"4\" orient=\"auto\" markerUnits=\"strokeWidth\">\n      <path d=\"M 0 0 L 8 4 L 0 8 Z\" fill=\"context-stroke\"/>\n    </marker>`;

  const defsMatch = svg.match(/<defs\b[^>]*>/i);
  if (defsMatch) {
    return svg.replace(/<defs\b[^>]*>/i, match => `${match}${marker}`);
  }

  return svg.replace(/<svg\b[^>]*>/i, match => `${match}\n  <defs>${marker}\n  </defs>`);
}

function normalizeTagEnd(tag) {
  return tag.replace(/\s*\/\s*>$/, '/>');
}

function appendAttr(tag, attr) {
  const normalized = normalizeTagEnd(tag);
  if (normalized.endsWith('/>')) {
    return normalized.replace(/\s*\/>$/, ` ${attr}/>`);
  }
  return normalized.replace(/>$/, ` ${attr}>`);
}

function normalizeMarkerAttributes(tag) {
  const markerEnd = getAttr(tag, 'marker-end');
  const markerStart = getAttr(tag, 'marker-start');
  let cleaned = tag.replace(/\smarker-(end|start)\s*=\s*\"[^\"]+\"/gi, '');
  cleaned = normalizeTagEnd(cleaned);
  if (markerStart) {
    cleaned = appendAttr(cleaned, `marker-start=\"${markerStart}\"`);
  }
  if (markerEnd) {
    cleaned = appendAttr(cleaned, `marker-end=\"${markerEnd}\"`);
  }
  return cleaned;
}

function addMarkerToConnectors(svg) {
  const lineRegex = /<line\b[^>]*>/gi;
  const pathRegex = /<path\b[^>]*>/gi;

  const addMarker = tag => {
    const normalized = normalizeMarkerAttributes(tag);
    if (/marker-end\s*=|marker-start\s*=/i.test(normalized)) {
      return normalized;
    }
    if (!/stroke\s*=/.test(normalized)) {
      return normalized;
    }
    return appendAttr(normalized, `marker-end=\"url(#${ARROW_MARKER_ID})\"`);
  };

  let updated = svg.replace(lineRegex, addMarker);
  updated = updated.replace(pathRegex, addMarker);
  return updated;
}

function removeArrowPolygons(svg) {
  const polyRegex = /<polygon\b[^>]*>/gi;
  return svg.replace(polyRegex, tag => (isArrowPolygon(tag) ? '' : tag));
}

function hasDirectionalArrows(svg) {
  if (/<marker\b[^>]*>/i.test(svg)) return true;
  const polys = svg.match(/<polygon\b[^>]*>/gi) || [];
  return polys.some(isArrowPolygon);
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
    if (!hasDirectionalArrows(original)) {
      continue;
    }

    let updated = ensureMarker(original);
    updated = addMarkerToConnectors(updated);
    updated = removeArrowPolygons(updated);

    if (updated !== original) {
      await writeFile(file, updated, 'utf8');
      updatedCount++;
    }
  }

  console.log(`Normalized arrowheads in ${updatedCount} SVG file(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
