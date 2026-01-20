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
const MIN_CONNECTOR_LENGTH = 20;

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

function buildMarkerDefinition(markerId, paint) {
  return `\n    <marker id=\"${markerId}\" markerWidth=\"8\" markerHeight=\"8\" refX=\"7\" refY=\"4\" orient=\"auto\" markerUnits=\"strokeWidth\">\n      <path d=\"M 0 0 L 8 4 L 0 8 Z\" fill=\"${paint}\" stroke=\"${paint}\" stroke-width=\"0\"/>\n    </marker>`;
}

function ensureMarkers(svg, markerDefs) {
  if (markerDefs.length === 0) return svg;

  const defsMatch = svg.match(/<defs\b[^>]*>/i);
  if (defsMatch) {
    return svg.replace(/<\/defs>/i, match => `${markerDefs}\n  ${match}`);
  }

  return svg.replace(/<svg\b[^>]*>/i, match => `${match}\n  <defs>${markerDefs}\n  </defs>`);
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

function stripMarkerAttributes(tag) {
  let cleaned = tag.replace(/\smarker-(end|start)\s*=\s*\"[^\"]+\"/gi, '');
  return normalizeTagEnd(cleaned);
}

function parsePathEndpoints(d) {
  if (!d) return null;
  const startMatch = d.match(/[Mm]\s*([-\d.]+)[,\s]+([-\d.]+)/);
  const nums = d.match(/[-\d.]+/g)?.map(Number).filter(n => Number.isFinite(n));
  if (!startMatch || !nums || nums.length < 2) return null;
  const start = {
    x: Number(startMatch[1]),
    y: Number(startMatch[2])
  };
  const end = {
    x: nums[nums.length - 2],
    y: nums[nums.length - 1]
  };
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) {
    return null;
  }
  return { start, end };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function markerIdForStroke(stroke) {
  if (!stroke) return ARROW_MARKER_ID;
  const urlMatch = stroke.match(/^url\(#([^)]+)\)$/i);
  if (urlMatch) return `arrowhead-${urlMatch[1]}`;
  const clean = stroke.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return clean ? `arrowhead-${clean}` : ARROW_MARKER_ID;
}

function addMarkerToConnectors(svg) {
  const lineRegex = /<line\b[^>]*>/gi;
  const pathRegex = /<path\b[^>]*>/gi;

  const addMarker = tag => {
    const normalized = stripMarkerAttributes(tag);
    if (!/stroke\s*=/.test(normalized)) {
      return normalized;
    }
    if (/stroke-dasharray\s*=/.test(normalized)) {
      return normalized;
    }
    const stroke = getAttr(normalized, 'stroke');
    if (!stroke || stroke.toLowerCase() === 'none') {
      return normalized;
    }
    let length = null;
    if (/^<line/i.test(normalized)) {
      const x1 = Number(getAttr(normalized, 'x1'));
      const y1 = Number(getAttr(normalized, 'y1'));
      const x2 = Number(getAttr(normalized, 'x2'));
      const y2 = Number(getAttr(normalized, 'y2'));
      if ([x1, y1, x2, y2].every(n => Number.isFinite(n))) {
        length = distance({ x: x1, y: y1 }, { x: x2, y: y2 });
      }
    } else if (/^<path/i.test(normalized)) {
      const d = getAttr(normalized, 'd');
      const endpoints = parsePathEndpoints(d);
      if (endpoints) {
        length = distance(endpoints.start, endpoints.end);
      }
    }

    if (length !== null && length < MIN_CONNECTOR_LENGTH) {
      return normalized;
    }

    const markerId = markerIdForStroke(stroke);
    return appendAttr(normalized, `marker-end=\"url(#${markerId})\"`);
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

function collectConnectorStrokes(svg) {
  const strokes = new Set();
  const lineRegex = /<line\b[^>]*>/gi;
  const pathRegex = /<path\b[^>]*>/gi;

  const addStroke = tag => {
    if (/stroke-dasharray\s*=/.test(tag)) return;
    const stroke = getAttr(tag, 'stroke');
    if (!stroke || stroke.toLowerCase() === 'none') return;
    strokes.add(stroke);
  };

  (svg.match(lineRegex) || []).forEach(addStroke);
  (svg.match(pathRegex) || []).forEach(addStroke);

  return strokes;
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

    const strokes = collectConnectorStrokes(original);
    const markerDefs = [];
    for (const stroke of strokes) {
      const markerId = markerIdForStroke(stroke);
      if (new RegExp(`<marker\\b[^>]*id=\"${markerId}\"`, 'i').test(original)) {
        continue;
      }
      markerDefs.push(buildMarkerDefinition(markerId, stroke));
    }

    let updated = ensureMarkers(original, markerDefs.join(''));
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
