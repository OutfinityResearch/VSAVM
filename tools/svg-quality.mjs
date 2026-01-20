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

function stripDefs(svg) {
  return svg.replace(/<defs[\s\S]*?<\/defs>/gi, '');
}

function collectMarkerDefinitions(svg) {
  const markers = new Map();
  const re = /<marker\b[^>]*id="([^"]+)"[^>]*>[\s\S]*?<\/marker>/gi;
  let match;
  while ((match = re.exec(svg)) !== null) {
    markers.set(match[1], match[0]);
  }
  return markers;
}

function extractMarkerPaint(markerTag) {
  const pathMatch = markerTag.match(/<path\b[^>]*>/i);
  const tag = pathMatch ? pathMatch[0] : '';
  return {
    fill: getAttr(tag, 'fill'),
    stroke: getAttr(tag, 'stroke')
  };
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
    const fill = getAttr(openTag, 'fill');
    const content = node.replace(/<text\b[^>]*>/i, '').replace(/<\/text>/i, '').trim();

    texts.push({ x, y, fontSize, anchor, fill, content, raw: node });
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
    const fill = getAttr(tag, 'fill');
    rects.push({ x, y, width, height, strokeWidth, fill, raw: tag });
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

function findRectForText(text, rects) {
  if (!Number.isFinite(text.x) || !Number.isFinite(text.y)) return null;
  const inside = rects.filter(rect => isTextInsideRect(text, rect, 2));
  if (inside.length > 0) {
    inside.sort((a, b) => {
      const areaA = Number.isFinite(a.width) && Number.isFinite(a.height) ? a.width * a.height : Infinity;
      const areaB = Number.isFinite(b.width) && Number.isFinite(b.height) ? b.width * b.height : Infinity;
      if (areaA !== areaB) return areaA - areaB;
      const centerA = a.y + (a.height ?? 0) / 2;
      const centerB = b.y + (b.height ?? 0) / 2;
      return Math.abs(centerA - text.y) - Math.abs(centerB - text.y);
    });
    return inside[0] || null;
  }

  const fontSize = Number.isFinite(text.fontSize) ? text.fontSize : 12;
  const xMargin = 6;
  const yMargin = Math.max(12, fontSize * 1.2);
  let best = null;
  let bestDist = Infinity;

  for (const rect of rects) {
    const left = rect.x - xMargin;
    const right = rect.x + rect.width + xMargin;
    if (text.x < left || text.x > right) continue;

    const top = rect.y - yMargin;
    const bottom = rect.y + rect.height + yMargin;
    if (text.y < top || text.y > bottom) continue;

    const centerY = rect.y + rect.height / 2;
    const dist = Math.abs(centerY - text.y);
    if (dist < bestDist) {
      best = rect;
      bestDist = dist;
    }
  }

  return best;
}

function analyzeSvg(svg, fileName) {
  const warnings = [];
  let score = 100;

  const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0] || '';
  const viewBox = parseViewBox(svgTag);
  const contentSvg = stripDefs(svg);

  if (!viewBox) {
    warnings.push('Missing viewBox (responsive scaling may be off).');
    score -= 12;
  }

  const rects = extractRects(contentSvg);
  const ellipses = extractEllipses(contentSvg);
  const circles = extractCircles(contentSvg);
  const texts = extractTextNodes(contentSvg);
  const lines = extractLines(contentSvg);
  const polygons = extractPolygons(contentSvg);
  const paths = extractPaths(contentSvg);
  const markers = collectMarkerDefinitions(svg);

  if (texts.length === 0) {
    warnings.push('No text elements detected (diagram may be too abstract).');
    score -= 10;
  }

  if (rects.length === 0 && paths.length === 0 && lines.length === 0) {
    warnings.push('No basic shapes detected (rect/line/path).');
    score -= 15;
  }

  if (viewBox) {
    const viewMinX = viewBox.x;
    const viewMinY = viewBox.y;
    const viewMaxX = viewBox.x + viewBox.width;
    const viewMaxY = viewBox.y + viewBox.height;
    const margin = 1;
    let outOfBounds = 0;

    const checkBounds = (minX, minY, maxX, maxY) => {
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return;
      }
      if (minX < viewMinX - margin || minY < viewMinY - margin || maxX > viewMaxX + margin || maxY > viewMaxY + margin) {
        outOfBounds += 1;
      }
    };

    for (const rect of rects) {
      const pad = (rect.strokeWidth ?? 0) / 2;
      checkBounds(rect.x - pad, rect.y - pad, rect.x + rect.width + pad, rect.y + rect.height + pad);
    }

    for (const ellipse of ellipses) {
      const pad = (ellipse.strokeWidth ?? 0) / 2;
      checkBounds(ellipse.cx - ellipse.rx - pad, ellipse.cy - ellipse.ry - pad, ellipse.cx + ellipse.rx + pad, ellipse.cy + ellipse.ry + pad);
    }

    for (const circle of circles) {
      const pad = (circle.strokeWidth ?? 0) / 2;
      checkBounds(circle.cx - circle.r - pad, circle.cy - circle.r - pad, circle.cx + circle.r + pad, circle.cy + circle.r + pad);
    }

    for (const line of lines) {
      const pad = (line.strokeWidth ?? 0) / 2;
      const minX = Math.min(line.x1, line.x2) - pad;
      const minY = Math.min(line.y1, line.y2) - pad;
      const maxX = Math.max(line.x1, line.x2) + pad;
      const maxY = Math.max(line.y1, line.y2) + pad;
      checkBounds(minX, minY, maxX, maxY);
    }

    for (const poly of polygons) {
      if (!poly.bbox) continue;
      checkBounds(poly.bbox.minX, poly.bbox.minY, poly.bbox.maxX, poly.bbox.maxY);
    }

    for (const path of paths) {
      if (!path.endpoints) continue;
      const pad = (path.strokeWidth ?? 0) / 2;
      const minX = Math.min(path.endpoints.start.x, path.endpoints.end.x) - pad;
      const minY = Math.min(path.endpoints.start.y, path.endpoints.end.y) - pad;
      const maxX = Math.max(path.endpoints.start.x, path.endpoints.end.x) + pad;
      const maxY = Math.max(path.endpoints.start.y, path.endpoints.end.y) + pad;
      checkBounds(minX, minY, maxX, maxY);
    }

    if (outOfBounds > 0) {
      warnings.push(`Elements exceed viewBox bounds (${outOfBounds}).`);
      score -= 6;
    }
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

  if (rects.length > 1) {
    const minVerticalGap = 10;
    const tooClose = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (!Number.isFinite(a.width) || !Number.isFinite(b.width)) continue;
        const ax2 = a.x + a.width;
        const bx2 = b.x + b.width;
        const overlapX = Math.min(ax2, bx2) - Math.max(a.x, b.x);
        if (overlapX <= 0) continue;
        const aBottom = a.y + a.height;
        const bBottom = b.y + b.height;
        const gap = aBottom <= b.y ? b.y - aBottom : bBottom <= a.y ? a.y - bBottom : -1;
        if (gap >= 0 && gap < minVerticalGap) {
          tooClose.push({ gap });
        }
      }
    }
    if (tooClose.length > 0) {
      warnings.push(`Boxes are vertically crowded (gap < ${minVerticalGap}px).`);
      score -= 4;
    }
  }

  // Text overflow estimation inside boxes
  if (rects.length > 0 && texts.length > 0) {
    const overflowed = [];
    let tightPaddingCount = 0;
    for (const text of texts) {
      const rect = findRectForText(text, rects);
      if (!rect) continue;
      if (!Number.isFinite(text.x) || !Number.isFinite(text.fontSize)) continue;

      const content = String(text.content || '').trim();
      if (!content) continue;

      const avgCharWidth = text.fontSize * 0.55;
      const estWidth = content.length * avgCharWidth;
      const padding = 8;
      const leftBound = rect.x + padding;
      const rightBound = rect.x + rect.width - padding;
      let left = text.x;
      let right = text.x + estWidth;

      if (text.anchor === 'middle') {
        left = text.x - estWidth / 2;
        right = text.x + estWidth / 2;
      } else if (text.anchor === 'end') {
        left = text.x - estWidth;
        right = text.x;
      }

      const overflowAmount = Math.max(0, leftBound - left, right - rightBound);
      const ascender = text.fontSize * 0.8;
      const descender = text.fontSize * 0.3;
      const top = text.y - ascender;
      const bottom = text.y + descender;
      const topBound = rect.y + padding;
      const bottomBound = rect.y + rect.height - padding;
      const verticalOverflow = Math.max(0, topBound - top, bottom - bottomBound);

      if (overflowAmount > 6 || verticalOverflow > 1) {
        overflowed.push({ content, estWidth, rectWidth: rect.width });
      } else {
        const leftMargin = left - rect.x;
        const rightMargin = rect.x + rect.width - right;
        const topMargin = top - rect.y;
        const bottomMargin = rect.y + rect.height - bottom;
        const minMargin = Math.min(leftMargin, rightMargin, topMargin, bottomMargin);
        if (minMargin < 6) {
          tightPaddingCount++;
        }
      }
    }

    if (overflowed.length > 0) {
      warnings.push(`Text likely overflows boxes (${overflowed.length}).`);
      score -= 6;
    }
    if (tightPaddingCount > 0) {
      warnings.push(`Text sits too close to box edges (${tightPaddingCount}).`);
      score -= 4;
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
        dashed: Boolean(line.dashArray),
        length: Number.isFinite(line.x1) && Number.isFinite(line.y1) && Number.isFinite(line.x2) && Number.isFinite(line.y2)
          ? distance({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 })
          : null
      })),
      ...paths.map(path => ({
        hasMarker: Boolean(path.markerEnd || path.markerStart),
        dashed: Boolean(path.dashArray),
        length: path.endpoints ? distance(path.endpoints.start, path.endpoints.end) : null
      }))
    ];
    const eligible = connectors.filter(conn => !conn.dashed && (conn.length === null || conn.length >= 18));
    if (eligible.length > 0) {
      const missing = eligible.filter(conn => !conn.hasMarker).length;
      const ratio = missing / eligible.length;
      if (ratio > 0.2) {
        warnings.push(`Markers missing on some connectors (${missing}/${eligible.length}).`);
        score -= 6;
      }
    }

    const shortMarked = connectors.filter(conn => conn.hasMarker && conn.length !== null && conn.length < 18 && !conn.dashed);
    if (shortMarked.length > 0) {
      warnings.push(`Arrowheads on very short connectors (${shortMarked.length}).`);
      score -= 4;
    }
  }

  if (hasMarkers) {
    const connectors = [
      ...lines.map(line => ({
        stroke: getAttr(line.raw, 'stroke'),
        markerEnd: line.markerEnd
      })),
      ...paths.map(path => ({
        stroke: getAttr(path.raw, 'stroke'),
        markerEnd: path.markerEnd
      }))
    ].filter(conn => conn.markerEnd && conn.stroke);

    let mismatched = 0;
    for (const conn of connectors) {
      const markerRef = conn.markerEnd.match(/url\\(#([^)]+)\\)/i);
      if (!markerRef) continue;
      const markerTag = markers.get(markerRef[1]);
      if (!markerTag) continue;
      const paint = extractMarkerPaint(markerTag);

      const paintValues = [paint.fill, paint.stroke].filter(Boolean).map(v => v.toLowerCase());
      const strokeValue = conn.stroke.toLowerCase();

      const inherits = paintValues.some(v => v === 'context-stroke' || v === 'currentcolor');
      const matches = paintValues.includes(strokeValue);

      if (!inherits && !matches) {
        mismatched++;
      }
    }

    if (mismatched > 0) {
      warnings.push(`Arrowheads do not inherit connector color (${mismatched}).`);
      score -= 4;
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
      const length = distance(conn.start, conn.end);
      if (length < 18) continue;
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
