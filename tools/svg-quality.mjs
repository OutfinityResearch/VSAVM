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
    rects.push({ x, y, width, height, raw: tag });
  }

  return rects;
}

function extractLines(svg) {
  const lines = [];
  const tags = collectTags(svg, 'line');
  for (const tag of tags) {
    const x1 = parseNumber(getAttr(tag, 'x1'));
    const y1 = parseNumber(getAttr(tag, 'y1'));
    const x2 = parseNumber(getAttr(tag, 'x2'));
    const y2 = parseNumber(getAttr(tag, 'y2'));
    lines.push({ x1, y1, x2, y2, raw: tag });
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
  const texts = extractTextNodes(svg);
  const lines = extractLines(svg);
  const polygons = extractPolygons(svg);
  const paths = collectTags(svg, 'path');

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
