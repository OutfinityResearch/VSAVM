#!/usr/bin/env node
/**
 * SVG Quality Heuristic Tool (aesthetic checks only, not semantic).
 *
 * Usage:
 *   node tools/svg-quality.mjs docs/assets/svg
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const DEFAULT_DIR = join('docs', 'assets', 'svg');

/**
 * Parse attribute value from a tag snippet.
 */
function getAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i');
  const match = tag.match(re);
  return match ? match[1] : null;
}

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function parseViewBox(tag) {
  const vb = getAttr(tag, 'viewBox');
  if (!vb) return null;
  const parts = vb.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isFinite(p))) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function collectTags(svg, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return svg.match(re) || [];
}

function collectPairedTags(svg, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');
  return svg.match(re) || [];
}

function extractTextNodes(svg) {
  const texts = [];
  const nodes = collectPairedTags(svg, 'text');

  for (const node of nodes) {
    const tagMatch = node.match(/<text\b[^>]*>/i);
    const openTag = tagMatch ? tagMatch[0] : '';
    const x = parseNumber(getAttr(openTag, 'x'));
    const y = parseNumber(getAttr(openTag, 'y'));
    const fontSize = parseNumber(getAttr(openTag, 'font-size'));
    const anchor = getAttr(openTag, 'text-anchor') || 'start';
    const content = node.replace(/<text\b[^>]*>/i, '').replace(/<\/text>/i, '').trim();

    texts.push({ x, y, fontSize, anchor, content, raw: node });
  }

  return texts;
}

function extractRects(svg) {
  const rects = [];
  const tags = collectTags(svg, 'rect');

  for (const tag of tags) {
    const x = parseNumber(getAttr(tag, 'x'), 0);
    const y = parseNumber(getAttr(tag, 'y'), 0);
    const width = parseNumber(getAttr(tag, 'width'));
    const height = parseNumber(getAttr(tag, 'height'));
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width'));
    rects.push({ x, y, width, height, strokeWidth, raw: tag });
  }

  return rects;
}

function extractEllipses(svg) {
  const ellipses = [];
  const tags = collectTags(svg, 'ellipse');
  for (const tag of tags) {
    const cx = parseNumber(getAttr(tag, 'cx'));
    const cy = parseNumber(getAttr(tag, 'cy'));
    const rx = parseNumber(getAttr(tag, 'rx'));
    const ry = parseNumber(getAttr(tag, 'ry'));
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width'));
    ellipses.push({ cx, cy, rx, ry, strokeWidth, raw: tag });
  }
  return ellipses;
}

function extractCircles(svg) {
  const circles = [];
  const tags = collectTags(svg, 'circle');
  for (const tag of tags) {
    const cx = parseNumber(getAttr(tag, 'cx'));
    const cy = parseNumber(getAttr(tag, 'cy'));
    const r = parseNumber(getAttr(tag, 'r'));
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width'));
    circles.push({ cx, cy, r, strokeWidth, raw: tag });
  }
  return circles;
}

function extractLines(svg) {
  const lines = [];
  const tags = collectTags(svg, 'line');
  for (const tag of tags) {
    const x1 = parseNumber(getAttr(tag, 'x1'));
    const y1 = parseNumber(getAttr(tag, 'y1'));
    const x2 = parseNumber(getAttr(tag, 'x2'));
    const y2 = parseNumber(getAttr(tag, 'y2'));
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width'));
    const markerEnd = getAttr(tag, 'marker-end');
    const markerStart = getAttr(tag, 'marker-start');
    const dashArray = getAttr(tag, 'stroke-dasharray');
    lines.push({ x1, y1, x2, y2, strokeWidth, markerEnd, markerStart, dashArray, raw: tag });
  }
  return lines;
}

function extractPolygons(svg) {
  const polys = [];
  const tags = collectTags(svg, 'polygon');
  for (const tag of tags) {
    const points = parsePoints(getAttr(tag, 'points'));
    const bbox = bboxFromPoints(points);
    polys.push({ points, bbox, raw: tag });
  }
  return polys;
}

function extractPaths(svg) {
  const paths = [];
  const tags = collectTags(svg, 'path');
  for (const tag of tags) {
    if (!/stroke\\s*=/.test(tag)) {
      continue;
    }
    const strokeWidth = parseNumber(getAttr(tag, 'stroke-width'));
    const markerEnd = getAttr(tag, 'marker-end');
    const markerStart = getAttr(tag, 'marker-start');
    const dashArray = getAttr(tag, 'stroke-dasharray');
    const d = getAttr(tag, 'd');
    const endpoints = parsePathEndpoints(d);
    paths.push({ strokeWidth, markerEnd, markerStart, dashArray, d, endpoints, raw: tag });
  }
  return paths;
}

function parsePathEndpoints(d) {
  if (!d) return null;
  const startMatch = d.match(/[Mm]\s*([-\d.]+)[,\s]+([-\d.]+)/);
  const nums = d.match(/[-\d.]+/g)?.map(Number).filter(n => Number.isFinite(n));
  if (!startMatch || !nums || nums.length < 2) return null;
  const start = {
    x: parseNumber(startMatch[1]),
    y: parseNumber(startMatch[2])
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

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(point, start);
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
  if (t <= 0) return distance(point, start);
  if (t >= 1) return distance(point, end);
  const proj = { x: start.x + t * dx, y: start.y + t * dy };
  return distance(point, proj);
}

function isTextInsideRect(text, rect, padding = 4) {
  if (text.x === null || text.y === null) return false;
  if (rect.width === null || rect.height === null) return false;

  const left = rect.x + padding;
  const right = rect.x + rect.width - padding;
  const top = rect.y + padding;
  const bottom = rect.y + rect.height - padding;

  return text.x >= left && text.x <= right && text.y >= top && text.y <= bottom;
}

function analyzeSvg(svg, fileName) {
  const warnings = [];
  let score = 100;

  const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0] || '';
  const viewBox = parseViewBox(svgTag);

  if (!viewBox) {
    warnings.push('Missing viewBox (responsive scaling may be off).');
    score -= 12;
  }

  const rects = extractRects(svg);
  const ellipses = extractEllipses(svg);
  const circles = extractCircles(svg);
  const texts = extractTextNodes(svg);
  const lines = extractLines(svg);
  const polygons = extractPolygons(svg);
  const paths = extractPaths(svg);

  if (texts.length === 0) {
    warnings.push('No text elements detected (diagram may be too abstract).');
    score -= 10;
  }

  if (rects.length === 0 && paths.length === 0 && lines.length === 0) {
    warnings.push('No basic shapes detected (rect/line/path).');
    score -= 15;
  }

  // Font-size consistency
  const fontSizes = texts.map(t => t.fontSize).filter(v => v !== null);
  if (fontSizes.length > 0) {
    const maxSize = Math.max(...fontSizes);
    const minSize = Math.min(...fontSizes);
    if (maxSize - minSize > 6) {
      warnings.push('Large font-size variance (text hierarchy may be inconsistent).');
      score -= 6;
    }
    if (minSize < 10) {
      warnings.push('Very small text detected (may be unreadable).');
      score -= 6;
    }
  } else if (texts.length > 0) {
    warnings.push('Text without font-size attributes (style may be inconsistent).');
    score -= 5;
  }

  // Stroke-weight refinement checks
  const borderStrokeWidths = [
    ...rects.map(r => r.strokeWidth),
    ...ellipses.map(e => e.strokeWidth),
    ...circles.map(c => c.strokeWidth)
  ].filter(v => Number.isFinite(v));
  const connectorStrokeWidths = [
    ...lines.map(l => l.strokeWidth),
    ...paths.map(p => p.strokeWidth)
  ].filter(v => Number.isFinite(v));

  if (borderStrokeWidths.length > 0) {
    const maxBorder = Math.max(...borderStrokeWidths);
    if (maxBorder > 1.6) {
      warnings.push('Borders are heavy (target stroke-width <= 1.6).');
      score -= 5;
    }
  }

  if (connectorStrokeWidths.length > 0) {
    const maxConnector = Math.max(...connectorStrokeWidths);
    if (maxConnector > 2.4) {
      warnings.push('Connectors are heavy (target stroke-width <= 2.4).');
      score -= 5;
    }
  }

  // Text placement relative to rects
  const textOutsideBoxes = rects.length > 0
    ? texts.filter(t => !rects.some(r => isTextInsideRect(t, r)))
    : texts.slice();

  if (rects.length > 0 && texts.length > 0) {
    const outsideRatio = textOutsideBoxes.length / texts.length;
    if (outsideRatio > 0.6) {
      warnings.push('Most text appears outside boxes (possible overflow).');
      score -= 10;
    }
  }

  // Arrowhead heuristic
  const hasMarkers = /marker-end\s*=|marker-start\s*=/i.test(svg);
  const smallPolys = polygons.filter(p => p.bbox && p.bbox.width <= 24 && p.bbox.height <= 24);
  const hasArrowheads = hasMarkers || smallPolys.length > 0;
  const hasConnectors = lines.length > 0 || paths.length > 0;

  if (hasArrowheads && hasConnectors && !hasMarkers) {
    const connectorCount = lines.length + paths.length;
    if (connectorCount > 0) {
      const arrowRatio = smallPolys.length / connectorCount;
      if (arrowRatio < 0.5) {
        warnings.push('Arrowheads appear on only some connectors (direction cues inconsistent).');
        score -= 6;
      }
    }
  }

  if (hasMarkers && hasConnectors) {
    const connectors = [
      ...lines.map(line => ({
        hasMarker: Boolean(line.markerEnd || line.markerStart),
        dashed: Boolean(line.dashArray)
      })),
      ...paths.map(path => ({
        hasMarker: Boolean(path.markerEnd || path.markerStart),
        dashed: Boolean(path.dashArray)
      }))
    ];
    const eligible = connectors.filter(conn => !conn.dashed);
    if (eligible.length > 0) {
      const missing = eligible.filter(conn => !conn.hasMarker).length;
      const ratio = missing / eligible.length;
      if (ratio > 0.2) {
        warnings.push(`Markers missing on some connectors (${missing}/${eligible.length}).`);
        score -= 6;
      }
    }
  }

  if (smallPolys.length > 0) {
    const maxArrowSize = Math.max(...smallPolys.map(p => Math.max(p.bbox.width, p.bbox.height)));
    if (maxArrowSize > 18) {
      warnings.push('Arrowheads look oversized (target <= 18px bbox).');
      score -= 4;
    }
  }

  if (!hasMarkers && smallPolys.length > 0 && hasConnectors) {
    const arrowCenters = smallPolys.map(p => ({
      x: (p.bbox.minX + p.bbox.maxX) / 2,
      y: (p.bbox.minY + p.bbox.maxY) / 2
    }));

    const connectors = [
      ...lines.map(line => ({
        start: { x: line.x1, y: line.y1 },
        end: { x: line.x2, y: line.y2 },
        hasMarker: Boolean(line.markerEnd || line.markerStart),
        dashed: Boolean(line.dashArray)
      })),
      ...paths
        .filter(p => p.endpoints)
        .map(path => ({
          start: path.endpoints.start,
          end: path.endpoints.end,
          hasMarker: Boolean(path.markerEnd || path.markerStart),
          dashed: Boolean(path.dashArray)
        }))
    ].filter(conn => Number.isFinite(conn.start.x) && Number.isFinite(conn.start.y) && Number.isFinite(conn.end.x) && Number.isFinite(conn.end.y));

    const endpointThreshold = 12;
    const lineDistanceThreshold = 8;

    let missingArrowCount = 0;
    for (const conn of connectors) {
      if (conn.dashed) continue;
      if (conn.hasMarker) {
        continue;
      }
      const nearStart = arrowCenters.some(center => distance(center, conn.start) <= endpointThreshold);
      const nearEnd = arrowCenters.some(center => distance(center, conn.end) <= endpointThreshold);
      if (!nearStart && !nearEnd) {
        missingArrowCount++;
      }
    }

    if (missingArrowCount > 0) {
      const ratio = missingArrowCount / connectors.length;
      if (ratio > 0.2) {
        warnings.push(`Connectors missing arrowheads near endpoints (${missingArrowCount}/${connectors.length}).`);
        score -= 6;
      }
    }

    let midlineCount = 0;
    let floatingCount = 0;
    for (const center of arrowCenters) {
      let closest = null;
      let closestConn = null;
      for (const conn of connectors) {
        const d = pointToSegmentDistance(center, conn.start, conn.end);
        if (closest === null || d < closest) {
          closest = d;
          closestConn = conn;
        }
      }

      if (closest === null) continue;
      if (closest > lineDistanceThreshold) {
        floatingCount++;
        continue;
      }

      const distStart = distance(center, closestConn.start);
      const distEnd = distance(center, closestConn.end);
      if (distStart > endpointThreshold && distEnd > endpointThreshold) {
        midlineCount++;
      }
    }

    if (midlineCount > 0) {
      warnings.push(`Arrowheads appear mid-connector (${midlineCount}).`);
      score -= 6;
    }

    if (floatingCount > 0) {
      warnings.push(`Arrowheads not aligned with any connector (${floatingCount}).`);
      score -= 4;
    }
  }

  if (score < 0) score = 0;

  return { fileName, score, warnings, stats: { rects: rects.length, texts: texts.length, lines: lines.length, polygons: polygons.length, paths: paths.length } };
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
  if (svgFiles.length === 0) {
    console.log('No SVG files found.');
    return;
  }

  const results = [];
  for (const file of svgFiles) {
    const content = await readFile(file, 'utf8');
    results.push(analyzeSvg(content, basename(file)));
  }

  results.sort((a, b) => a.score - b.score);

  console.log(`SVG Quality Report (${svgFiles.length} file(s))`);
  console.log('='.repeat(64));
  for (const result of results) {
    console.log(`- ${result.fileName}: ${result.score}/100`);
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(`  - ${warning}`);
      }
    } else {
      console.log('  - No warnings');
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
