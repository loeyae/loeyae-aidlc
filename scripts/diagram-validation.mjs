#!/usr/bin/env node

/**
 * 图表源级验证、风险评估和浏览器路由决策。
 *
 * 本模块只处理确定性源数据。它不启动浏览器、不执行 SVG 栅格化，
 * 也不把未执行的 Render/Browser 检查标记为 PASS。
 */

import { multilineTextBounds } from "./diagram-text-geometry.mjs"

export const VALIDATION_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  UNVERIFIED: "UNVERIFIED",
  MIGRATION_REQUIRED: "MIGRATION_REQUIRED",
  NEEDS_CAPABILITY: "NEEDS_CAPABILITY",
  SOURCE_READY: "SOURCE_READY",
})

export const ISSUE_CODES = Object.freeze({
  DUPLICATE_ID: "DUPLICATE_ID",
  INVALID_REFERENCE: "INVALID_REFERENCE",
  INVALID_PORT: "INVALID_PORT",
  INVALID_SHAPE: "INVALID_SHAPE",
  INVALID_EDGE_KIND: "INVALID_EDGE_KIND",
  INVALID_POINTS: "INVALID_POINTS",
  INVALID_FIELD: "INVALID_FIELD",
  LEGEND_INVALID: "LEGEND_INVALID",
  GROUP_CONTAINMENT: "GROUP_CONTAINMENT",
  NODE_OVERLAP: "NODE_OVERLAP",
  EDGE_NODE_COLLISION: "EDGE_NODE_COLLISION",
  EDGE_CROSSING: "EDGE_CROSSING",
  LABEL_COLLISION: "LABEL_COLLISION",
  PORT_MISMATCH: "PORT_MISMATCH",
  UNSUPPORTED_SHAPE_GEOMETRY: "UNSUPPORTED_SHAPE_GEOMETRY",
  SEQUENCE_LIFELINE_MISSING: "SEQUENCE_LIFELINE_MISSING",
  EDGE_ENDPOINT_MISMATCH: "EDGE_ENDPOINT_MISMATCH",
  CANVAS_CLIPPING: "CANVAS_CLIPPING",
  CANVAS_TOO_EMPTY: "CANVAS_TOO_EMPTY",
  INSUFFICIENT_GAP: "INSUFFICIENT_GAP",
  UNSUPPORTED_PORT_OFFSET: "UNSUPPORTED_PORT_OFFSET",
  LAYOUT_DIRECTION_INVALID: "LAYOUT_DIRECTION_INVALID",
  LAYOUT_LEVEL_MISMATCH: "LAYOUT_LEVEL_MISMATCH",
  LAYOUT_SYMMETRY_MISMATCH: "LAYOUT_SYMMETRY_MISMATCH",
  BRANCH_PORT_MISMATCH: "BRANCH_PORT_MISMATCH",
  BRANCH_PATH_DIRECTION: "BRANCH_PATH_DIRECTION",
  CONTENT_ORDER_INVALID: "CONTENT_ORDER_INVALID",
  ANNOTATION_ID_MISMATCH: "ANNOTATION_ID_MISMATCH",
  MIGRATION_REQUIRED: "MIGRATION_REQUIRED",
  RENDER_NOT_EXECUTED: "RENDER_NOT_EXECUTED",
  RENDER_EVIDENCE_INVALID: "RENDER_EVIDENCE_INVALID",
  BROWSER_NOT_EXECUTED: "BROWSER_NOT_EXECUTED",
})

export const DEFAULT_GEOMETRY_THRESHOLDS = Object.freeze({
  MIN_NODE_GAP: 24,
  MIN_EDGE_GAP: 12,
  MIN_LABEL_GAP: 8,
  MIN_GROUP_PADDING: 16,
  MIN_PARALLEL_EDGE_GAP: 24,
  CANVAS_MARGIN: 24,
  MIN_CONTENT_RATIO: 0.25,
  POINT_TOLERANCE: 1,
})

export const RISK_LEVELS = Object.freeze({ LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" })

const PORTS = new Set(["top", "right", "bottom", "left"])
const SHAPES = new Set(["round", "rect", "diamond", "ellipse", "database", "actor", "note"])
const EDGE_KINDS = new Set(["directed", "bidirectional", "undirected", "dashed"])
const GROUP_TYPES = new Set(["exclusive", "nested", "cross-cutting", "overlay"])
const DIAGRAM_TYPES = new Set([
  "architecture", "context", "container", "flowchart", "pipeline", "sequence", "state", "er", "deployment", "class", "component", "infrastructure",
])
const SEMANTIC_MODES = new Set(["static-boundary", "static-relation", "process-flow", "data-flow", "dependency-flow", "constraint"])
const VISUAL_CHANNELS = new Set(["edge-kind", "node-shape", "tone", "group-role", "icon"])
const VISUAL_ROLES = new Set(["semantic", "decorative"])
const LEGEND_KINDS = new Set(["node", "edge", "group"])
const LAYOUT_DIRECTIONS = new Set(["TD", "LR"])
const LAYOUT_EXCEPTION_TYPES = new Set(["cross-group", "explicit-wrap", "obstacle-avoidance"])
const CONTENT_ORDER = ["business", "legend", "annotations"]

function isFiniteNumber(value) {
  return Number.isFinite(value)
}

function makeIssue(code, message, details = {}, severity = "error") {
  return { code, severity, message, ...details }
}

function addIssue(issues, code, message, details = {}, severity = "error") {
  issues.push(makeIssue(code, message, details, severity))
}

function addMigration(issues, message, details = {}) {
  addIssue(issues, ISSUE_CODES.MIGRATION_REQUIRED, message, details, "migration")
}

function reportStatus(issues, migrationRequired = false) {
  if (issues.some(issue => issue.severity === "error")) return VALIDATION_STATUS.FAIL
  if (migrationRequired || issues.some(issue => issue.severity === "migration")) return VALIDATION_STATUS.MIGRATION_REQUIRED
  return VALIDATION_STATUS.PASS
}

function textLines(value) {
  if (typeof value === "string" && value.length > 0) return [value]
  if (Array.isArray(value) && value.length > 0 && value.every(line => typeof line === "string" && line.length > 0)) return value
  return []
}

function nodeBounds(node) {
  return {
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + node.height,
  }
}

function groupBounds(group) {
  return {
    left: group.x,
    top: group.y,
    right: group.x + group.width,
    bottom: group.y + group.height,
  }
}

function rectanglesOverlap(first, second, gap = 0) {
  return first.left < second.right + gap
    && first.right > second.left - gap
    && first.top < second.bottom + gap
    && first.bottom > second.top - gap
}

function rectanglesIntersect(first, second) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top
}

function rectangleContains(outer, inner, padding = 0) {
  return inner.left >= outer.left + padding
    && inner.right <= outer.right - padding
    && inner.top >= outer.top + padding
    && inner.bottom <= outer.bottom - padding
}

function pointInsideRectangle(point, rectangle) {
  return point[0] > rectangle.left && point[0] < rectangle.right
    && point[1] > rectangle.top && point[1] < rectangle.bottom
}

function pointDistance(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1])
}

function pointsEqual(first, second, tolerance) {
  return pointDistance(first, second) <= tolerance
}

function portPoint(node, port, offset = 0) {
  const bounds = nodeBounds(node)
  if (node.shape === "diamond" && offset !== 0) return null
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2
  switch (port) {
    case "top": return [centerX + offset, bounds.top]
    case "right": return [bounds.right, centerY + offset]
    case "bottom": return [centerX - offset, bounds.bottom]
    case "left": return [bounds.left, centerY - offset]
    default: return null
  }
}

function actualShapePortPoint(node, port, offset = 0) {
  const bounds = nodeBounds(node)
  if (node.shape === "database" || node.shape === "actor") return null
  if (node.shape === "diamond") {
    if (offset !== 0) return null
    if (port === "top") return [(bounds.left + bounds.right) / 2, bounds.top]
    if (port === "right") return [bounds.right, (bounds.top + bounds.bottom) / 2]
    if (port === "bottom") return [(bounds.left + bounds.right) / 2, bounds.bottom]
    if (port === "left") return [bounds.left, (bounds.top + bounds.bottom) / 2]
    return null
  }
  if (node.shape === "ellipse" && offset !== 0) {
    const centerX = (bounds.left + bounds.right) / 2
    const centerY = (bounds.top + bounds.bottom) / 2
    if (port === "top" || port === "bottom") {
      const x = centerX + (port === "top" ? offset : -offset)
      const normalized = (x - centerX) / (node.width / 2)
      if (Math.abs(normalized) > 1) return null
      const y = centerY + (port === "top" ? -1 : 1) * (node.height / 2) * Math.sqrt(1 - normalized ** 2)
      return [x, y]
    }
    const y = centerY + (port === "right" ? offset : -offset)
    const normalized = (y - centerY) / (node.height / 2)
    if (Math.abs(normalized) > 1) return null
    const x = centerX + (port === "right" ? 1 : -1) * (node.width / 2) * Math.sqrt(1 - normalized ** 2)
    return [x, y]
  }
  return portPoint(node, port, offset)
}

function segmentBounds(segment) {
  return {
    left: Math.min(segment.start[0], segment.end[0]),
    right: Math.max(segment.start[0], segment.end[0]),
    top: Math.min(segment.start[1], segment.end[1]),
    bottom: Math.max(segment.start[1], segment.end[1]),
  }
}

function orientation(first, second, third) {
  const value = (second[1] - first[1]) * (third[0] - second[0]) - (second[0] - first[0]) * (third[1] - second[1])
  if (Math.abs(value) < 1e-9) return 0
  return value > 0 ? 1 : 2
}

function pointOnSegment(first, candidate, second) {
  return candidate[0] >= Math.min(first[0], second[0]) - 1e-9
    && candidate[0] <= Math.max(first[0], second[0]) + 1e-9
    && candidate[1] >= Math.min(first[1], second[1]) - 1e-9
    && candidate[1] <= Math.max(first[1], second[1]) + 1e-9
}

function segmentIntersection(first, second) {
  const firstOrientation = orientation(first.start, first.end, second.start)
  const secondOrientation = orientation(first.start, first.end, second.end)
  const thirdOrientation = orientation(second.start, second.end, first.start)
  const fourthOrientation = orientation(second.start, second.end, first.end)

  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) {
    const denominator = (first.start[0] - first.end[0]) * (second.start[1] - second.end[1]) - (first.start[1] - first.end[1]) * (second.start[0] - second.end[0])
    if (Math.abs(denominator) < 1e-9) return { type: "point", point: first.start }
    const determinantFirst = first.start[0] * first.end[1] - first.start[1] * first.end[0]
    const determinantSecond = second.start[0] * second.end[1] - second.start[1] * second.end[0]
    const x = (determinantFirst * (second.start[0] - second.end[0]) - (first.start[0] - first.end[0]) * determinantSecond) / denominator
    const y = (determinantFirst * (second.start[1] - second.end[1]) - (first.start[1] - first.end[1]) * determinantSecond) / denominator
    return { type: "point", point: [x, y] }
  }

  const candidates = []
  if (firstOrientation === 0 && pointOnSegment(first.start, second.start, first.end)) candidates.push(second.start)
  if (secondOrientation === 0 && pointOnSegment(first.start, second.end, first.end)) candidates.push(second.end)
  if (thirdOrientation === 0 && pointOnSegment(second.start, first.start, second.end)) candidates.push(first.start)
  if (fourthOrientation === 0 && pointOnSegment(second.start, first.end, second.end)) candidates.push(first.end)
  if (candidates.length === 0) return null
  const distinct = candidates.filter((candidate, index) => candidates.findIndex(other => pointsEqual(candidate, other, 1e-9)) === index)
  return distinct.length > 1 ? { type: "overlap" } : { type: "point", point: distinct[0] }
}

function segmentIntersectsRectInterior(segment, rectangle) {
  const dx = segment.end[0] - segment.start[0]
  const dy = segment.end[1] - segment.start[1]
  let lower = 0
  let upper = 1
  const constraints = [
    [-dx, segment.start[0] - rectangle.left],
    [dx, rectangle.right - segment.start[0]],
    [-dy, segment.start[1] - rectangle.top],
    [dy, rectangle.bottom - segment.start[1]],
  ]
  for (const [coefficient, value] of constraints) {
    if (Math.abs(coefficient) < 1e-9) {
      if (value <= 0) return false
      continue
    }
    const ratio = value / coefficient
    if (coefficient < 0) lower = Math.max(lower, ratio)
    else upper = Math.min(upper, ratio)
    if (lower > upper) return false
  }
  const interiorLower = Math.max(lower, 1e-6)
  const interiorUpper = Math.min(upper, 1 - 1e-6)
  return interiorLower < interiorUpper
}

function lineParameterRoots(segment, centerX, centerY, radiusX, radiusY) {
  const startX = (segment.start[0] - centerX) / radiusX
  const startY = (segment.start[1] - centerY) / radiusY
  const deltaX = (segment.end[0] - segment.start[0]) / radiusX
  const deltaY = (segment.end[1] - segment.start[1]) / radiusY
  const a = deltaX * deltaX + deltaY * deltaY
  const b = 2 * (startX * deltaX + startY * deltaY)
  const c = startX * startX + startY * startY - 1
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return []
    return [-c / b]
  }
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
}

function segmentIntersectsEllipseInterior(segment, centerX, centerY, radiusX, radiusY) {
  const parameters = [0, 1, ...lineParameterRoots(segment, centerX, centerY, radiusX, radiusY).filter(value => value > 0 && value < 1)].sort((first, second) => first - second)
  for (let index = 1; index < parameters.length; index += 1) {
    const parameter = (parameters[index - 1] + parameters[index]) / 2
    const x = segment.start[0] + (segment.end[0] - segment.start[0]) * parameter
    const y = segment.start[1] + (segment.end[1] - segment.start[1]) * parameter
    if (((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 < 1 - 1e-9) return true
  }
  return false
}

function segmentIntersectsRoundedRectInterior(segment, rectangle, radius) {
  const actualRadius = Math.min(radius, (rectangle.right - rectangle.left) / 2, (rectangle.bottom - rectangle.top) / 2)
  if (actualRadius <= 0) return segmentIntersectsRectInterior(segment, rectangle)
  const parameters = [0, 1]
  const addLinearRoot = (start, delta, value) => {
    if (Math.abs(delta) < 1e-9) return
    const parameter = (value - start) / delta
    if (parameter > 0 && parameter < 1) parameters.push(parameter)
  }
  const deltaX = segment.end[0] - segment.start[0]
  const deltaY = segment.end[1] - segment.start[1]
  for (const x of [rectangle.left, rectangle.left + actualRadius, rectangle.right - actualRadius, rectangle.right]) addLinearRoot(segment.start[0], deltaX, x)
  for (const y of [rectangle.top, rectangle.top + actualRadius, rectangle.bottom - actualRadius, rectangle.bottom]) addLinearRoot(segment.start[1], deltaY, y)
  const innerLeft = rectangle.left + actualRadius
  const innerRight = rectangle.right - actualRadius
  const innerTop = rectangle.top + actualRadius
  const innerBottom = rectangle.bottom - actualRadius
  for (const [centerX, centerY] of [[innerLeft, innerTop], [innerRight, innerTop], [innerRight, innerBottom], [innerLeft, innerBottom]]) {
    parameters.push(...lineParameterRoots(segment, centerX, centerY, actualRadius, actualRadius).filter(value => value > 0 && value < 1))
  }
  parameters.sort((first, second) => first - second)
  for (let index = 1; index < parameters.length; index += 1) {
    const parameter = (parameters[index - 1] + parameters[index]) / 2
    const x = segment.start[0] + deltaX * parameter
    const y = segment.start[1] + deltaY * parameter
    if (!(x > rectangle.left && x < rectangle.right && y > rectangle.top && y < rectangle.bottom)) continue
    if ((x >= innerLeft && x <= innerRight) || (y >= innerTop && y <= innerBottom)) return true
    const centerX = x < innerLeft ? innerLeft : innerRight
    const centerY = y < innerTop ? innerTop : innerBottom
    if ((x - centerX) ** 2 + (y - centerY) ** 2 < actualRadius ** 2 - 1e-9) return true
  }
  return false
}

function polygonArea(polygon) {
  return polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return area + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2
}

function segmentIntersectsConvexPolygonInterior(segment, polygon) {
  const points = polygonArea(polygon) >= 0 ? polygon : [...polygon].reverse()
  let lower = 0
  let upper = 1
  const delta = [segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]]
  for (let index = 0; index < points.length; index += 1) {
    const first = points[index]
    const second = points[(index + 1) % points.length]
    const edge = [second[0] - first[0], second[1] - first[1]]
    const startVector = [segment.start[0] - first[0], segment.start[1] - first[1]]
    const value = edge[0] * startVector[1] - edge[1] * startVector[0]
    const change = edge[0] * delta[1] - edge[1] * delta[0]
    if (Math.abs(change) < 1e-9) {
      if (value <= 0) return false
      continue
    }
    const boundary = -value / change
    if (change > 0) lower = Math.max(lower, boundary)
    else upper = Math.min(upper, boundary)
    if (lower >= upper) return false
  }
  return Math.max(lower, 1e-6) < Math.min(upper, 1 - 1e-6)
}

function segmentIntersectsShapeInterior(segment, node) {
  const bounds = nodeBounds(node)
  switch (node.shape) {
    case "rect": return segmentIntersectsRectInterior(segment, bounds)
    case "round": return segmentIntersectsRoundedRectInterior(segment, bounds, 24)
    case "diamond": return segmentIntersectsConvexPolygonInterior(segment, [[(bounds.left + bounds.right) / 2, bounds.top], [bounds.right, (bounds.top + bounds.bottom) / 2], [(bounds.left + bounds.right) / 2, bounds.bottom], [bounds.left, (bounds.top + bounds.bottom) / 2]])
    case "ellipse": return segmentIntersectsEllipseInterior(segment, (bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2, node.width / 2, node.height / 2)
    case "note": {
      const fold = Math.min(20, node.width / 5, node.height / 4)
      return segmentIntersectsConvexPolygonInterior(segment, [[bounds.left, bounds.top], [bounds.right - fold, bounds.top], [bounds.right, bounds.top + fold], [bounds.right, bounds.bottom], [bounds.left, bounds.bottom]])
    }
    case "actor": {
      const headY = bounds.top + Math.min(18, node.height / 4)
      const headRadius = Math.min(14, node.width / 7)
      const bodyTop = bounds.top + Math.min(36, node.height / 2)
      return segmentIntersectsEllipseInterior(segment, (bounds.left + bounds.right) / 2, headY, headRadius, headRadius)
        || segmentIntersectsRoundedRectInterior(segment, { left: bounds.left, top: bodyTop, right: bounds.right, bottom: bounds.bottom }, 8)
    }
    case "database":
    default: return null
  }
}

function linesAndSegments(edge) {
  if (!Array.isArray(edge.points) || edge.points.length < 2) return []
  const segments = []
  for (let index = 1; index < edge.points.length; index += 1) {
    segments.push({
      edge,
      index: index - 1,
      start: edge.points[index - 1],
      end: edge.points[index],
    })
  }
  return segments
}

function labelBox(label, fontSize = 12) {
  const lines = textLines(label.text)
  const longest = Math.max(...lines.map(line => [...line].length), 1)
  return {
    left: label.x - Math.max(38, longest * fontSize * 0.6 + 16) / 2,
    right: label.x + Math.max(38, longest * fontSize * 0.6 + 16) / 2,
    top: label.y - (lines.length * (fontSize + 4) + 8) / 2,
    bottom: label.y + (lines.length * (fontSize + 4) + 8) / 2,
  }
}

function annotationBox(annotation) {
  return {
    ...multilineTextBounds({
      lines: textLines(annotation.text),
      x: annotation.x,
      y: annotation.y,
      fontSize: annotation.fontSize ?? 13,
      anchor: annotation.anchor ?? "middle",
      lineHeight: annotation.lineHeight ?? 17,
    }),
    annotationId: annotation.id,
  }
}

function annotationBoxes(diagram) {
  return (diagram.annotations ?? []).map(annotation => ({ ...annotationBox(annotation), annotationId: annotation.id }))
}

function estimateLegendBounds(diagram, annotations = annotationBoxes(diagram)) {
  if (!diagram.legend?.items?.length || !diagram.canvas) return null
  const availableWidth = Math.max(0, diagram.canvas.width - 48)
  const rows = [{ width: 0, height: 28 }]
  for (const item of diagram.legend.items) {
    const text = `${item.label ?? ""}：${item.meaning ?? ""}`
    const estimatedTextWidth = Math.max(120, Math.min(280, [...text].length * 8))
    const width = Math.min(availableWidth, 52 + estimatedTextWidth)
    const maxChars = Math.max(12, Math.floor((width - 52) / 8))
    const lines = Math.max(1, Math.ceil([...text].length / maxChars))
    const height = Math.max(28, lines * 16 + 8)
    const row = rows.at(-1)
    if (row.width > 0 && row.width + 16 + width > availableWidth) rows.push({ width: 0, height: 28 })
    const targetRow = rows.at(-1)
    targetRow.width += targetRow.width === 0 ? width : 16 + width
    targetRow.height = Math.max(targetRow.height, height)
  }
  const contentHeight = 24 + rows.reduce((total, row) => total + row.height, 0) + 16
  const annotationTop = Math.min(...annotations.map(box => box.top), Number.POSITIVE_INFINITY)
  const bottom = Math.min(diagram.canvas.height - 24, Number.isFinite(annotationTop) ? annotationTop - 24 : diagram.canvas.height - 24)
  return { left: 24, top: bottom - contentHeight, right: diagram.canvas.width - 24, bottom }
}

function businessContentBounds(diagram, labels) {
  const boxes = [
    ...(diagram.nodes ?? []).map(nodeBounds),
    ...(diagram.groups ?? []).map(groupBounds),
    ...(diagram.edges ?? []).flatMap(edge => (edge.points ?? []).map(([x, y]) => ({ left: x, right: x, top: y, bottom: y }))),
    ...labels,
  ]
  if (boxes.length === 0) return null
  return {
    left: Math.min(...boxes.map(box => box.left)),
    top: Math.min(...boxes.map(box => box.top)),
    right: Math.max(...boxes.map(box => box.right)),
    bottom: Math.max(...boxes.map(box => box.bottom)),
  }
}

function contentBounds(diagram, labels, extraBoxes = []) {
  const boxes = [businessContentBounds(diagram, labels), ...annotationBoxes(diagram), ...extraBoxes].filter(Boolean)
  if (boxes.length === 0) return null
  return {
    left: Math.min(...boxes.map(box => box.left)),
    top: Math.min(...boxes.map(box => box.top)),
    right: Math.max(...boxes.map(box => box.right)),
    bottom: Math.max(...boxes.map(box => box.bottom)),
  }
}

function completeGeometry(diagram) {
  return (diagram.edges ?? []).every(edge => Array.isArray(edge.points) && edge.points.length >= 2)
}

function migrationReasons(diagram) {
  const reasons = []
  if (diagram.diagramType === undefined || diagram.designNotes === undefined) reasons.push("缺少 diagramType 或 designNotes")
  if ((diagram.edges ?? []).some(edge => edge.points === undefined)) reasons.push("存在缺少完整 points 的连线")
  const typedGroups = (diagram.groups ?? []).some(group => group.semanticType !== undefined)
  if ((diagram.groups ?? []).length > 0 && !typedGroups) reasons.push("分组缺少 semanticType/members 结构化语义")
  return reasons
}

function isLegacyDiagram(diagram) {
  return diagram.diagramType === undefined
    && diagram.designNotes === undefined
    && diagram.legend === undefined
    && !(diagram.groups ?? []).some(group => group.semanticType !== undefined)
}

function isStructuredDiagram(diagram) {
  return diagram.diagramType !== undefined
    || diagram.designNotes !== undefined
    || diagram.legend !== undefined
    || (diagram.groups ?? []).some(group => group.semanticType !== undefined)
}

function collectMaps(diagram) {
  return {
    nodes: new Map((diagram.nodes ?? []).map(node => [node.id, node])),
    edges: new Map((diagram.edges ?? []).map(edge => [edge.id, edge])),
    groups: new Map((diagram.groups ?? []).map(group => [group.id, group])),
  }
}

function validateSequenceLifelines(diagram, nodes, issues) {
  if (diagram.diagramType !== "sequence") return
  if (!Array.isArray(diagram.lifelines)) {
    addIssue(issues, ISSUE_CODES.SEQUENCE_LIFELINE_MISSING, `Sequence 图 ${diagram.id} 缺少 lifelines 映射`, { field: "lifelines" })
    return
  }
  const seen = new Set()
  for (const lifeline of diagram.lifelines) {
    if (!lifeline || typeof lifeline.participant !== "string" || !isFiniteNumber(lifeline.x)) {
      addIssue(issues, ISSUE_CODES.SEQUENCE_LIFELINE_MISSING, `Sequence 图 ${diagram.id} 的生命线必须包含 participant 和有限 x`, { field: "lifelines" })
      continue
    }
    if (seen.has(lifeline.participant)) addIssue(issues, ISSUE_CODES.SEQUENCE_LIFELINE_MISSING, `Sequence 图 ${diagram.id} 重复声明参与者生命线 ${lifeline.participant}`, { participant: lifeline.participant })
    seen.add(lifeline.participant)
    if (!nodes.has(lifeline.participant)) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `生命线引用了不存在的参与者 ${lifeline.participant}`, { participant: lifeline.participant })
  }
  for (const nodeId of nodes.keys()) if (!seen.has(nodeId)) addIssue(issues, ISSUE_CODES.SEQUENCE_LIFELINE_MISSING, `Sequence 图 ${diagram.id} 缺少参与者 ${nodeId} 的生命线`, { participant: nodeId })
}

function getSequenceLifelines(diagram) {
  return new Map((diagram.lifelines ?? []).map(lifeline => [lifeline.participant, lifeline]))
}

function validateLayoutSemantic(diagram, notes, maps, issues) {
  const layout = notes.layout
  if (layout === undefined) {
    addMigration(issues, `图 ${diagram.id} 缺少 designNotes.layout，布局语义需迁移`, { field: "designNotes.layout" })
    return true
  }
  if (!layout || typeof layout !== "object") {
    addIssue(issues, ISSUE_CODES.LAYOUT_DIRECTION_INVALID, `图 ${diagram.id} 的 designNotes.layout 必须为对象`, { field: "designNotes.layout" })
    return
  }
  const direction = layout.direction
  if (!LAYOUT_DIRECTIONS.has(direction)) addIssue(issues, ISSUE_CODES.LAYOUT_DIRECTION_INVALID, `图 ${diagram.id} 的布局方向必须为 TD 或 LR`, { field: "designNotes.layout.direction" })
  const expectedMainCoordinate = direction === "TD" ? "x" : "y"
  const mainAxis = layout.mainAxis
  if (!mainAxis || typeof mainAxis !== "object" || mainAxis.coordinate !== expectedMainCoordinate || !isFiniteNumber(mainAxis.value)) {
    addIssue(issues, ISSUE_CODES.LAYOUT_DIRECTION_INVALID, `图 ${diagram.id} 的 mainAxis 必须声明与 ${direction} 阅读方向正交的坐标和值`, { field: "designNotes.layout.mainAxis" })
  } else if (mainAxis.tolerance !== undefined && (!isFiniteNumber(mainAxis.tolerance) || mainAxis.tolerance <= 0)) {
    addIssue(issues, ISSUE_CODES.LAYOUT_DIRECTION_INVALID, `图 ${diagram.id} 的 mainAxis.tolerance 必须为正数`, { field: "designNotes.layout.mainAxis.tolerance" })
  }
  if (mainAxis?.symmetricNodePairs !== undefined) {
    if (!Array.isArray(mainAxis.symmetricNodePairs)) addIssue(issues, ISSUE_CODES.LAYOUT_SYMMETRY_MISMATCH, `图 ${diagram.id} 的 symmetricNodePairs 必须为数组`, { field: "designNotes.layout.mainAxis.symmetricNodePairs" })
    else for (const pair of mainAxis.symmetricNodePairs) {
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(nodeId => typeof nodeId !== "string" || !maps.nodes.has(nodeId))) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `图 ${diagram.id} 的对称节点对无效`, { field: "designNotes.layout.mainAxis.symmetricNodePairs", pair })
    }
  }
  const levelIds = new Set()
  if (layout.levels !== undefined) {
    if (!Array.isArray(layout.levels)) addIssue(issues, ISSUE_CODES.LAYOUT_LEVEL_MISMATCH, `图 ${diagram.id} 的 layout.levels 必须为数组`, { field: "designNotes.layout.levels" })
    else {
      const nodeLevelIds = new Set()
      for (const level of layout.levels) {
        if (!level || typeof level.id !== "string" || level.id.length === 0 || levelIds.has(level.id) || !isFiniteNumber(level.coordinate) || !Array.isArray(level.nodeIds) || level.nodeIds.length === 0) {
          addIssue(issues, ISSUE_CODES.LAYOUT_LEVEL_MISMATCH, `图 ${diagram.id} 的 layout level 无效`, { field: "designNotes.layout.levels", levelId: level?.id })
          continue
        }
        levelIds.add(level.id)
        for (const nodeId of level.nodeIds) {
          if (!maps.nodes.has(nodeId)) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `图 ${diagram.id} 的 level ${level.id} 引用了不存在的节点 ${nodeId}`, { levelId: level.id, nodeId })
          else if (nodeLevelIds.has(nodeId)) addIssue(issues, ISSUE_CODES.LAYOUT_LEVEL_MISMATCH, `图 ${diagram.id} 的节点 ${nodeId} 被多个 layout level 声明`, { nodeId })
          else nodeLevelIds.add(nodeId)
        }
      }
    }
  }
  if (layout.branchRules !== undefined) {
    if (!Array.isArray(layout.branchRules)) addIssue(issues, ISSUE_CODES.BRANCH_PORT_MISMATCH, `图 ${diagram.id} 的 layout.branchRules 必须为数组`, { field: "designNotes.layout.branchRules" })
    else for (const rule of layout.branchRules) {
      const validRule = rule && typeof rule.decisionNodeId === "string" && maps.nodes.has(rule.decisionNodeId)
        && Array.isArray(rule.edgeIds) && rule.edgeIds.length > 0 && Array.isArray(rule.targetNodeIds) && rule.targetNodeIds.length > 0
        && rule.edgeIds.every(edgeId => typeof edgeId === "string" && maps.edges.has(edgeId))
        && rule.targetNodeIds.every(nodeId => typeof nodeId === "string" && maps.nodes.has(nodeId))
        && PORTS.has(rule.targetPort)
      if (!validRule) {
        addIssue(issues, ISSUE_CODES.BRANCH_PORT_MISMATCH, `图 ${diagram.id} 的 branchRule 无效`, { field: "designNotes.layout.branchRules", decisionNodeId: rule?.decisionNodeId })
        continue
      }
      if (rule.levelId !== undefined && !levelIds.has(rule.levelId)) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `图 ${diagram.id} 的 branchRule 引用了不存在的 level ${rule.levelId}`, { decisionNodeId: rule.decisionNodeId, levelId: rule.levelId })
      const edgeTargets = new Set()
      for (const edgeId of rule.edgeIds) {
        const edge = maps.edges.get(edgeId)
        if (edge.from !== rule.decisionNodeId || !rule.targetNodeIds.includes(edge.to)) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `图 ${diagram.id} 的 branchRule ${edgeId} 与决策节点/目标节点不匹配`, { edgeId, decisionNodeId: rule.decisionNodeId })
        else edgeTargets.add(edge.to)
      }
      const declaredTargets = new Set(rule.targetNodeIds)
      if (edgeTargets.size !== declaredTargets.size || [...edgeTargets].some(nodeId => !declaredTargets.has(nodeId)) || [...declaredTargets].some(nodeId => !edgeTargets.has(nodeId))) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `图 ${diagram.id} 的 branchRule 目标节点集合与边集合不一致`, { decisionNodeId: rule.decisionNodeId, edgeIds: rule.edgeIds, targetNodeIds: rule.targetNodeIds })
      if (rule.exception !== undefined && (!rule.exception || !LAYOUT_EXCEPTION_TYPES.has(rule.exception.type) || typeof rule.exception.reason !== "string" || rule.exception.reason.length === 0)) addIssue(issues, ISSUE_CODES.BRANCH_PORT_MISMATCH, `图 ${diagram.id} 的 branchRule 例外必须包含受支持类型和 reason`, { decisionNodeId: rule.decisionNodeId })
    }
  }
  if (layout.contentOrder !== undefined && (!Array.isArray(layout.contentOrder) || layout.contentOrder.length !== CONTENT_ORDER.length || layout.contentOrder.some((item, index) => item !== CONTENT_ORDER[index]))) addIssue(issues, ISSUE_CODES.CONTENT_ORDER_INVALID, `图 ${diagram.id} 的 contentOrder 必须为 business → legend → annotations`, { field: "designNotes.layout.contentOrder" })
  return false
}

export function validateSemanticDiagram(diagram) {
  const issues = []
  let migrationRequired = false
  if (!diagram || typeof diagram !== "object") {
    return { status: VALIDATION_STATUS.FAIL, stage: "semantic", issues: [makeIssue(ISSUE_CODES.INVALID_FIELD, "图表规格必须是对象")] }
  }

  const requiredStringFields = ["id", "output", "title", "description"]
  for (const field of requiredStringFields) {
    if (typeof diagram[field] !== "string" || diagram[field].length === 0) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图表缺少有效 ${field}`, { field })
  }
  if (!diagram.canvas || !isFiniteNumber(diagram.canvas.width) || !isFiniteNumber(diagram.canvas.height) || diagram.canvas.width <= 0 || diagram.canvas.height <= 0) {
    addIssue(issues, ISSUE_CODES.INVALID_FIELD, "图表画布尺寸必须为正数", { field: "canvas" })
  }
  if (!Array.isArray(diagram.nodes) || diagram.nodes.length === 0) addIssue(issues, ISSUE_CODES.INVALID_FIELD, "图表至少需要一个节点", { field: "nodes" })
  if (diagram.edges !== undefined && !Array.isArray(diagram.edges)) addIssue(issues, ISSUE_CODES.INVALID_FIELD, "图表 edges 必须为数组", { field: "edges" })
  if (diagram.groups !== undefined && !Array.isArray(diagram.groups)) addIssue(issues, ISSUE_CODES.INVALID_FIELD, "图表 groups 必须为数组", { field: "groups" })

  const maps = collectMaps(diagram)
  const structured = isStructuredDiagram(diagram)
  const allIds = new Map()
  const registerId = (kind, object) => {
    if (typeof object.id !== "string" || object.id.length === 0) {
      addIssue(issues, ISSUE_CODES.INVALID_FIELD, `${kind} 缺少有效 ID`, { kind })
      return
    }
    if (allIds.has(object.id)) addIssue(issues, ISSUE_CODES.DUPLICATE_ID, `ID ${object.id} 在 ${allIds.get(object.id)} 与 ${kind} 中重复`, { id: object.id, kind })
    else allIds.set(object.id, kind)
  }

  for (const node of diagram.nodes ?? []) {
    registerId("node", node)
    const shape = node.shape ?? (structured ? undefined : "rect")
    if (shape === undefined) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `结构化节点 ${node.id} 必须显式声明 shape`, { nodeId: node.id, field: "shape" })
    else if (!SHAPES.has(shape)) addIssue(issues, ISSUE_CODES.INVALID_SHAPE, `节点 ${node.id} 的形状无效`, { nodeId: node.id })
    if (textLines(node.label).length === 0) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `节点 ${node.id} 的 label 不能为空`, { nodeId: node.id })
    for (const field of ["x", "y", "width", "height"]) {
      if (!isFiniteNumber(node[field]) || node[field] <= 0) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `节点 ${node.id} 的 ${field} 无效`, { nodeId: node.id, field })
    }
    if (diagram.canvas && isFiniteNumber(node.x) && isFiniteNumber(node.y) && isFiniteNumber(node.width) && isFiniteNumber(node.height)
      && (node.x < 0 || node.y < 0 || node.x + node.width > diagram.canvas.width || node.y + node.height > diagram.canvas.height)) {
      addIssue(issues, ISSUE_CODES.CANVAS_CLIPPING, `节点 ${node.id} 超出画布`, { nodeId: node.id })
    }
  }

  for (const edge of diagram.edges ?? []) {
    registerId("edge", edge)
    if (!maps.nodes.has(edge.from) || !maps.nodes.has(edge.to)) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `连线 ${edge.id} 引用了不存在的节点`, { edgeId: edge.id, from: edge.from, to: edge.to })
    const fromPort = edge.fromPort ?? (structured ? undefined : "right")
    const toPort = edge.toPort ?? (structured ? undefined : "left")
    const kind = edge.kind ?? (structured ? undefined : "directed")
    if (!PORTS.has(fromPort) || !PORTS.has(toPort)) addIssue(issues, ISSUE_CODES.INVALID_PORT, `连线 ${edge.id} 必须显式声明有效端口`, { edgeId: edge.id })
    if (!EDGE_KINDS.has(kind)) addIssue(issues, ISSUE_CODES.INVALID_EDGE_KIND, `连线 ${edge.id} 必须显式声明有效类型`, { edgeId: edge.id })
    for (const field of ["fromPortOffset", "toPortOffset"]) {
      if (edge[field] !== undefined && !isFiniteNumber(edge[field])) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `连线 ${edge.id} 的 ${field} 必须为有限数字`, { edgeId: edge.id, field })
    }
    if (edge.points !== undefined && (!Array.isArray(edge.points) || edge.points.length < 2 || edge.points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !isFiniteNumber(value))))) {
      addIssue(issues, ISSUE_CODES.INVALID_POINTS, `连线 ${edge.id} 的 points 格式无效`, { edgeId: edge.id })
    }
    if (edge.label !== undefined && (!edge.label || textLines(edge.label.text).length === 0 || !isFiniteNumber(edge.label.x) || !isFiniteNumber(edge.label.y))) {
      addIssue(issues, ISSUE_CODES.LABEL_COLLISION, `连线 ${edge.id} 的标签结构无效`, { edgeId: edge.id })
    }
  }

  for (const group of diagram.groups ?? []) {
    registerId("group", group)
    if (typeof group.label !== "string" || group.label.length === 0) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `分组 ${group.id} 缺少 label`, { groupId: group.id })
    for (const field of ["x", "y", "width", "height"]) {
      if (!isFiniteNumber(group[field]) || group[field] <= 0) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `分组 ${group.id} 的 ${field} 无效`, { groupId: group.id, field })
    }
    if (group.semanticType !== undefined && !GROUP_TYPES.has(group.semanticType)) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `分组 ${group.id} 的 semanticType 无效`, { groupId: group.id })
    if (group.semanticType !== undefined && !Array.isArray(group.members)) addMigration(issues, `分组 ${group.id} 缺少 members，需迁移`, { groupId: group.id })
    if (group.semanticType === "nested" && (typeof group.parent !== "string" || !maps.groups.has(group.parent))) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `nested 分组 ${group.id} 的 parent 无效`, { groupId: group.id, parent: group.parent })
    if ((group.semanticType === "cross-cutting" || group.semanticType === "overlay") && Array.isArray(group.members) && group.members.length > 0) addIssue(issues, ISSUE_CODES.GROUP_CONTAINMENT, `${group.semanticType} 分组 ${group.id} 不得声明业务成员`, { groupId: group.id })
  }

  for (const group of diagram.groups ?? []) {
    if (!Array.isArray(group.members)) continue
    for (const memberId of group.members) {
      if (!maps.nodes.has(memberId)) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `分组 ${group.id} 引用了不存在的节点 ${memberId}`, { groupId: group.id, nodeId: memberId })
    }
  }

  if (diagram.annotations !== undefined && !Array.isArray(diagram.annotations)) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图 ${diagram.id} 的 annotations 必须为数组`, { field: "annotations" })
  for (const annotation of Array.isArray(diagram.annotations) ? diagram.annotations : []) {
    if (textLines(annotation?.text).length === 0 || !isFiniteNumber(annotation?.x) || !isFiniteNumber(annotation?.y)) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图 ${diagram.id} 的注释文本或坐标无效`, { annotationId: annotation?.id })
    if (structured && (typeof annotation?.id !== "string" || annotation.id.length === 0)) addIssue(issues, ISSUE_CODES.ANNOTATION_ID_MISMATCH, `结构化图 ${diagram.id} 的每条注释必须有稳定 ID`, { annotationId: annotation?.id })
    else if (typeof annotation?.id === "string" && annotation.id.length > 0) registerId("annotation", annotation)
  }

  if (diagram.legend !== undefined) {
    if (!Array.isArray(diagram.legend.items) || diagram.legend.items.length === 0) addIssue(issues, ISSUE_CODES.LEGEND_INVALID, "图例必须包含至少一个 item")
    const legendIds = new Set()
    for (const item of diagram.legend.items ?? []) {
      if (typeof item.id !== "string" || item.id.length === 0 || legendIds.has(item.id)) addIssue(issues, ISSUE_CODES.LEGEND_INVALID, `图例项 ID 无效或重复：${item.id}`, { legendId: item.id })
      legendIds.add(item.id)
      for (const target of [item.sample, ...(item.targets ?? [])]) {
        if (!target || !LEGEND_KINDS.has(target.kind)) {
          addIssue(issues, ISSUE_CODES.LEGEND_INVALID, `图例项 ${item.id} 的目标无效`, { legendId: item.id })
          continue
        }
        const map = maps[`${target.kind}s`]
        if (!map?.has(target.ref)) addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `图例项 ${item.id} 引用了不存在的 ${target.kind}:${target.ref}`, { legendId: item.id, ref: target.ref })
      }
    }
  }

  if (!structured || isLegacyDiagram(diagram)) {
    const reasons = migrationReasons(diagram)
    if (reasons.length > 0 || !structured) {
      migrationRequired = true
      for (const reason of reasons.length > 0 ? reasons : ["旧 V1 资产缺少新结构化字段"]) addMigration(issues, reason)
    }
  } else {
    if (!DIAGRAM_TYPES.has(diagram.diagramType)) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图 ${diagram.id} 的 diagramType 无效`, { field: "diagramType" })
    const notes = diagram.designNotes
    if (!notes || typeof notes !== "object") {
      migrationRequired = true
      addMigration(issues, `图 ${diagram.id} 缺少 designNotes，需迁移`)
    } else {
      if (typeof notes.intent !== "string" || notes.intent.length === 0) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图 ${diagram.id} 的 designNotes.intent 无效`, { field: "designNotes.intent" })
      if (!Array.isArray(notes.semanticModes) || notes.semanticModes.length === 0 || notes.semanticModes.some(mode => !SEMANTIC_MODES.has(mode))) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图 ${diagram.id} 的 semanticModes 无效`, { field: "designNotes.semanticModes" })
      if (!Array.isArray(notes.visualSemantics)) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图 ${diagram.id} 的 visualSemantics 必须为数组`, { field: "designNotes.visualSemantics" })
      else for (const declaration of notes.visualSemantics) {
        if (!declaration || !VISUAL_CHANNELS.has(declaration.channel) || !VISUAL_ROLES.has(declaration.role) || typeof declaration.reason !== "string" || declaration.reason.length === 0) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图 ${diagram.id} 的 visualSemantics 声明无效`, { field: "designNotes.visualSemantics" })
      }
      if (!notes.legendDecision || !["required", "exempt", "not-needed"].includes(notes.legendDecision.status)) addIssue(issues, ISSUE_CODES.LEGEND_INVALID, `图 ${diagram.id} 缺少有效 legendDecision`)
      if (!notes.splitDecision || !["not-needed", "split", "kept-single"].includes(notes.splitDecision.status)) addIssue(issues, ISSUE_CODES.INVALID_FIELD, `图 ${diagram.id} 缺少有效 splitDecision`)
      if (validateLayoutSemantic(diagram, notes, maps, issues)) migrationRequired = true
    }
  }

  if (structured && diagram.diagramType === "sequence") validateSequenceLifelines(diagram, maps.nodes, issues)

  for (const edge of diagram.edges ?? []) {
    if (edge.points === undefined) {
      migrationRequired = true
      addMigration(issues, `连线 ${edge.id} 缺少完整 points，几何证据需迁移`, { edgeId: edge.id })
    }
  }

  return {
    status: reportStatus(issues, migrationRequired),
    stage: "semantic",
    issues,
    maps,
    migrationRequired,
  }
}

function validateNodeCollisions(diagram, issues, thresholds) {
  const nodes = diagram.nodes ?? []
  for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
      const first = nodes[firstIndex]
      const second = nodes[secondIndex]
      const firstBounds = nodeBounds(first)
      const secondBounds = nodeBounds(second)
      if (rectanglesIntersect(firstBounds, secondBounds)) addIssue(issues, ISSUE_CODES.NODE_OVERLAP, `节点 ${first.id} 与 ${second.id} 重叠`, { nodeId: first.id, relatedNodeId: second.id })
      else if (rectanglesOverlap(firstBounds, secondBounds, thresholds.MIN_NODE_GAP)) addIssue(issues, ISSUE_CODES.INSUFFICIENT_GAP, `节点 ${first.id} 与 ${second.id} 的安全间距小于 ${thresholds.MIN_NODE_GAP}`, { nodeId: first.id, relatedNodeId: second.id, minimum: thresholds.MIN_NODE_GAP })
    }
  }
}

function validateGroupContainment(diagram, issues, thresholds) {
  const nodesById = new Map((diagram.nodes ?? []).map(node => [node.id, node]))
  const groupsById = new Map((diagram.groups ?? []).map(group => [group.id, group]))
  for (const group of diagram.groups ?? []) {
    if (!Array.isArray(group.members)) continue
    const bounds = groupBounds(group)
    for (const memberId of group.members) {
      const member = nodesById.get(memberId)
      if (!member || !rectangleContains(bounds, nodeBounds(member), thresholds.MIN_GROUP_PADDING)) addIssue(issues, ISSUE_CODES.GROUP_CONTAINMENT, `分组 ${group.id} 未以最小内边距包围成员 ${memberId}`, { groupId: group.id, nodeId: memberId, minimum: thresholds.MIN_GROUP_PADDING })
    }
    if (group.parent !== undefined) {
      const parent = groupsById.get(group.parent)
      if (parent && !rectangleContains(groupBounds(parent), bounds, thresholds.MIN_GROUP_PADDING)) addIssue(issues, ISSUE_CODES.GROUP_CONTAINMENT, `nested 分组 ${group.id} 超出父分组 ${group.parent}`, { groupId: group.id, parent: group.parent })
    }
  }
}

function attachmentDescriptor(edge, role) {
  const isFrom = role === "from"
  return {
    nodeId: edge[role],
    port: edge[`${role}Port`] ?? (isFrom ? "right" : "left"),
    direction: isFrom ? "outgoing" : "incoming",
  }
}

function sharedAttachmentCandidates(firstEdge, secondEdge) {
  const candidates = []
  if (firstEdge.from === secondEdge.from && (firstEdge.fromPort ?? "right") === (secondEdge.fromPort ?? "right")) candidates.push(attachmentDescriptor(firstEdge, "from"))
  if (firstEdge.to === secondEdge.to && (firstEdge.toPort ?? "left") === (secondEdge.toPort ?? "left")) candidates.push(attachmentDescriptor(firstEdge, "to"))
  return candidates
}

function hasSharedConvergenceDeclaration(diagram, attachment, edgeIds) {
  const expectedEdgeIds = [...new Set(edgeIds)].sort().join("|")
  return (diagram.designNotes?.sharedConvergences ?? []).some(declaration => {
    if (!declaration || declaration.nodeId !== attachment.nodeId || declaration.port !== attachment.port || declaration.direction !== attachment.direction || !Array.isArray(declaration.edgeIds)) return false
    return [...new Set(declaration.edgeIds)].sort().join("|") === expectedEdgeIds
  })
}

function validateEdgeGeometry(diagram, issues, thresholds) {
  let geometryUnverified = false
  const unsupportedShapeIds = new Set()
  for (const node of diagram.nodes ?? []) {
    if (node.shape === "database") {
      geometryUnverified = true
      unsupportedShapeIds.add(node.id)
      addIssue(issues, ISSUE_CODES.UNSUPPORTED_SHAPE_GEOMETRY, `节点 ${node.id} 的 database 边界暂不能由通用验证器精确验证`, { nodeId: node.id }, "info")
    }
  }
  const nodesById = new Map((diagram.nodes ?? []).map(node => [node.id, node]))
  const sequenceLifelines = diagram.diagramType === "sequence" ? getSequenceLifelines(diagram) : null
  const routes = []
  for (const edge of diagram.edges ?? []) {
    if (!Array.isArray(edge.points) || edge.points.length < 2) continue
    const source = nodesById.get(edge.from)
    const target = nodesById.get(edge.to)
    if (!source || !target) continue
    const fromOffset = edge.fromPortOffset ?? 0
    const toOffset = edge.toPortOffset ?? 0
    let sourcePort
    let targetPort
    if (diagram.diagramType === "sequence") {
      const sourceLifeline = sequenceLifelines.get(edge.from)
      const targetLifeline = sequenceLifelines.get(edge.to)
      if (!sourceLifeline || !targetLifeline) {
        addIssue(issues, ISSUE_CODES.SEQUENCE_LIFELINE_MISSING, `连线 ${edge.id} 缺少源或目标生命线`, { edgeId: edge.id })
        continue
      }
      sourcePort = [sourceLifeline.x, edge.points[0][1]]
      targetPort = [targetLifeline.x, edge.points.at(-1)[1]]
    } else {
      sourcePort = actualShapePortPoint(source, edge.fromPort, fromOffset)
      targetPort = actualShapePortPoint(target, edge.toPort, toOffset)
    }
    if (!sourcePort || !targetPort) {
      geometryUnverified = true
      addIssue(issues, ISSUE_CODES.UNSUPPORTED_SHAPE_GEOMETRY, `连线 ${edge.id} 的端点形状或偏移无法可靠计算`, { edgeId: edge.id }, "info")
    } else {
      if (!pointsEqual(edge.points[0], sourcePort, thresholds.POINT_TOLERANCE)) addIssue(issues, ISSUE_CODES.EDGE_ENDPOINT_MISMATCH, `连线 ${edge.id} 的首点与源端口不一致`, { edgeId: edge.id, expected: sourcePort, actual: edge.points[0] })
      if (!pointsEqual(edge.points.at(-1), targetPort, thresholds.POINT_TOLERANCE)) addIssue(issues, ISSUE_CODES.EDGE_ENDPOINT_MISMATCH, `连线 ${edge.id} 的末点与目标端口不一致`, { edgeId: edge.id, expected: targetPort, actual: edge.points.at(-1) })
    }
    if (diagram.diagramType === "sequence") {
      if (pointInsideRectangle(edge.points[0], nodeBounds(source))) addIssue(issues, ISSUE_CODES.EDGE_NODE_COLLISION, `Sequence 连线 ${edge.id} 的源端点落在参与者标题区域`, { edgeId: edge.id, nodeId: source.id })
      if (pointInsideRectangle(edge.points.at(-1), nodeBounds(target))) addIssue(issues, ISSUE_CODES.EDGE_NODE_COLLISION, `Sequence 连线 ${edge.id} 的目标端点落在参与者标题区域`, { edgeId: edge.id, nodeId: target.id })
    }
    const segments = linesAndSegments(edge)
    routes.push({ edge, segments })
    for (const segment of segments) {
      for (const node of diagram.nodes ?? []) {
        if (node.id === edge.from || node.id === edge.to) continue
        const collision = segmentIntersectsShapeInterior(segment, node)
        if (collision === null) {
          geometryUnverified = true
          if (!unsupportedShapeIds.has(node.id)) {
            unsupportedShapeIds.add(node.id)
            addIssue(issues, ISSUE_CODES.UNSUPPORTED_SHAPE_GEOMETRY, `节点 ${node.id} 的 ${node.shape} 边界暂不能由通用验证器精确验证`, { nodeId: node.id }, "info")
          }
        } else if (collision) addIssue(issues, ISSUE_CODES.EDGE_NODE_COLLISION, `连线 ${edge.id} 穿过无关节点 ${node.id}`, { edgeId: edge.id, nodeId: node.id, segment: segment.index })
      }
    }
  }

  for (let firstIndex = 0; firstIndex < routes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < routes.length; secondIndex += 1) {
      const first = routes[firstIndex]
      const second = routes[secondIndex]
      for (const firstSegment of first.segments) {
        for (const secondSegment of second.segments) {
          const intersection = segmentIntersection(firstSegment, secondSegment)
          if (!intersection) continue
          if (intersection.type === "overlap") {
            addIssue(issues, ISSUE_CODES.EDGE_CROSSING, `连线 ${first.edge.id} 与 ${second.edge.id} 存在重叠路径`, { edgeId: first.edge.id, relatedEdgeId: second.edge.id, kind: "overlap" })
            continue
          }
          const point = intersection.point
          const firstEndpoint = pointsEqual(point, firstSegment.start, thresholds.POINT_TOLERANCE) || pointsEqual(point, firstSegment.end, thresholds.POINT_TOLERANCE)
          const secondEndpoint = pointsEqual(point, secondSegment.start, thresholds.POINT_TOLERANCE) || pointsEqual(point, secondSegment.end, thresholds.POINT_TOLERANCE)
          const sharedAttachments = sharedAttachmentCandidates(first.edge, second.edge)
          const sharedEndpointDeclared = sharedAttachments.some(attachment => hasSharedConvergenceDeclaration(diagram, attachment, [first.edge.id, second.edge.id]))
          if (!(firstEndpoint && secondEndpoint && sharedEndpointDeclared)) addIssue(issues, ISSUE_CODES.EDGE_CROSSING, `连线 ${first.edge.id} 与 ${second.edge.id} 在非声明共享端点处相交`, { edgeId: first.edge.id, relatedEdgeId: second.edge.id, point })
        }
      }
    }
  }

  for (let firstIndex = 0; firstIndex < routes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < routes.length; secondIndex += 1) {
      const first = routes[firstIndex]
      const second = routes[secondIndex]
      for (const firstSegment of first.segments) {
        for (const secondSegment of second.segments) {
          const firstBounds = segmentBounds(firstSegment)
          const secondBounds = segmentBounds(secondSegment)
          const firstHorizontal = firstSegment.start[1] === firstSegment.end[1]
          const secondHorizontal = secondSegment.start[1] === secondSegment.end[1]
          if (firstHorizontal && secondHorizontal && Math.max(firstBounds.left, secondBounds.left) < Math.min(firstBounds.right, secondBounds.right) && Math.abs(firstSegment.start[1] - secondSegment.start[1]) < thresholds.MIN_PARALLEL_EDGE_GAP) {
            addIssue(issues, ISSUE_CODES.INSUFFICIENT_GAP, `平行连线 ${first.edge.id} 与 ${second.edge.id} 间距小于 ${thresholds.MIN_PARALLEL_EDGE_GAP}`, { edgeId: first.edge.id, relatedEdgeId: second.edge.id, minimum: thresholds.MIN_PARALLEL_EDGE_GAP })
          }
          const firstVertical = firstSegment.start[0] === firstSegment.end[0]
          const secondVertical = secondSegment.start[0] === secondSegment.end[0]
          if (firstVertical && secondVertical && Math.max(firstBounds.top, secondBounds.top) < Math.min(firstBounds.bottom, secondBounds.bottom) && Math.abs(firstSegment.start[0] - secondSegment.start[0]) < thresholds.MIN_PARALLEL_EDGE_GAP) {
            addIssue(issues, ISSUE_CODES.INSUFFICIENT_GAP, `平行连线 ${first.edge.id} 与 ${second.edge.id} 间距小于 ${thresholds.MIN_PARALLEL_EDGE_GAP}`, { edgeId: first.edge.id, relatedEdgeId: second.edge.id, minimum: thresholds.MIN_PARALLEL_EDGE_GAP })
          }
        }
      }
    }
  }
  validatePortSpacing(diagram, issues, thresholds)
  return geometryUnverified
}

function validatePortSpacing(diagram, issues, thresholds) {
  const attachments = new Map()
  for (const edge of diagram.edges ?? []) {
    if (!Array.isArray(edge.points) || edge.points.length < 2) continue
    for (const role of ["from", "to"]) {
      const attachment = attachmentDescriptor(edge, role)
      const key = `${attachment.direction}:${attachment.nodeId}:${attachment.port}`
      const point = role === "from" ? edge.points[0] : edge.points.at(-1)
      const entries = attachments.get(key) ?? []
      entries.push({ edge, attachment, point })
      attachments.set(key, entries)
    }
  }
  for (const entries of attachments.values()) {
    for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
        const first = entries[firstIndex]
        const second = entries[secondIndex]
        if (hasSharedConvergenceDeclaration(diagram, first.attachment, [first.edge.id, second.edge.id])) continue
        const distance = pointDistance(first.point, second.point)
        if (distance < thresholds.MIN_PARALLEL_EDGE_GAP) addIssue(issues, ISSUE_CODES.INSUFFICIENT_GAP, `节点 ${first.attachment.nodeId} 的 ${first.attachment.direction} ${first.attachment.port} 端点间距小于 ${thresholds.MIN_PARALLEL_EDGE_GAP}`, { nodeId: first.attachment.nodeId, port: first.attachment.port, edgeId: first.edge.id, relatedEdgeId: second.edge.id, actual: distance, minimum: thresholds.MIN_PARALLEL_EDGE_GAP })
      }
    }
  }
}

function validateLabels(diagram, issues, thresholds) {
  const labels = []
  for (const edge of diagram.edges ?? []) {
    if (!edge.label) continue
    const box = labelBox(edge.label)
    labels.push({ id: `${edge.id}#label`, edgeId: edge.id, box })
    for (const node of diagram.nodes ?? []) if (rectanglesOverlap(box, nodeBounds(node), thresholds.MIN_LABEL_GAP)) addIssue(issues, ISSUE_CODES.LABEL_COLLISION, `连线标签 ${edge.id}#label 与节点 ${node.id} 重叠或间距不足`, { edgeId: edge.id, nodeId: node.id })
  }
  for (let index = 0; index < labels.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < labels.length; otherIndex += 1) {
      if (rectanglesOverlap(labels[index].box, labels[otherIndex].box, thresholds.MIN_LABEL_GAP)) addIssue(issues, ISSUE_CODES.LABEL_COLLISION, `标签 ${labels[index].id} 与 ${labels[otherIndex].id} 重叠或间距不足`, { labelId: labels[index].id, relatedLabelId: labels[otherIndex].id })
    }
  }
  for (const label of labels) {
    for (const edge of diagram.edges ?? []) {
      for (const segment of linesAndSegments(edge)) {
        if (segmentIntersectsRectInterior(segment, label.box)) addIssue(issues, ISSUE_CODES.LABEL_COLLISION, `标签 ${label.id} 覆盖连线 ${edge.id}`, { labelId: label.id, edgeId: edge.id })
      }
    }
  }
  return labels.map(label => label.box)
}

function validateLayoutGeometry(diagram, issues, thresholds) {
  const layout = diagram.designNotes?.layout
  if (!layout || !LAYOUT_DIRECTIONS.has(layout.direction)) return
  const direction = layout.direction
  const readingCoordinate = direction === "TD" ? "y" : "x"
  const expectedMainCoordinate = direction === "TD" ? "x" : "y"
  const tolerance = layout.mainAxis?.tolerance ?? thresholds.POINT_TOLERANCE
  const nodesById = new Map((diagram.nodes ?? []).map(node => [node.id, node]))
  const center = (node, coordinate) => coordinate === "x" ? node.x + node.width / 2 : node.y + node.height / 2
  if (layout.mainAxis?.coordinate !== expectedMainCoordinate) addIssue(issues, ISSUE_CODES.LAYOUT_DIRECTION_INVALID, `图 ${diagram.id} 的 mainAxis 与 ${direction} 方向不正交`, { expected: expectedMainCoordinate, actual: layout.mainAxis?.coordinate })
  for (const pair of layout.mainAxis?.symmetricNodePairs ?? []) {
    const first = nodesById.get(pair[0])
    const second = nodesById.get(pair[1])
    if (!first || !second || !isFiniteNumber(layout.mainAxis?.value)) continue
    const firstDistance = Math.abs(center(first, expectedMainCoordinate) - layout.mainAxis.value)
    const secondDistance = Math.abs(center(second, expectedMainCoordinate) - layout.mainAxis.value)
    if (Math.abs(firstDistance - secondDistance) > tolerance) addIssue(issues, ISSUE_CODES.LAYOUT_SYMMETRY_MISMATCH, `图 ${diagram.id} 的节点 ${first.id}、${second.id} 未关于主轴对称`, { nodeId: first.id, relatedNodeId: second.id, axis: layout.mainAxis.value, distances: [firstDistance, secondDistance], tolerance })
  }
  const levels = new Map((layout.levels ?? []).map(level => [level.id, level]))
  for (const level of layout.levels ?? []) {
    for (const nodeId of level.nodeIds ?? []) {
      const node = nodesById.get(nodeId)
      if (node && Math.abs(center(node, readingCoordinate) - level.coordinate) > tolerance) addIssue(issues, ISSUE_CODES.LAYOUT_LEVEL_MISMATCH, `图 ${diagram.id} 的节点 ${nodeId} 未落在 level ${level.id} 的 ${readingCoordinate} 层`, { nodeId, levelId: level.id, expected: level.coordinate, actual: center(node, readingCoordinate), tolerance })
    }
  }
  const edgesById = new Map((diagram.edges ?? []).map(edge => [edge.id, edge]))
  const expectedTargetPort = direction === "TD" ? "top" : "left"
  for (const rule of layout.branchRules ?? []) {
    const targetNodes = (rule.targetNodeIds ?? []).map(nodeId => nodesById.get(nodeId)).filter(Boolean)
    const targetCoordinates = targetNodes.map(node => center(node, readingCoordinate))
    const declaredLevel = rule.levelId === undefined ? undefined : levels.get(rule.levelId)
    if (rule.levelId !== undefined && !declaredLevel) {
      addIssue(issues, ISSUE_CODES.INVALID_REFERENCE, `图 ${diagram.id} 的 branchRule 引用了不存在的 level ${rule.levelId}`, { decisionNodeId: rule.decisionNodeId, levelId: rule.levelId })
      continue
    }
    const expectedCoordinate = declaredLevel?.coordinate ?? targetCoordinates[0]
    if (expectedCoordinate !== undefined && targetCoordinates.some(coordinate => Math.abs(coordinate - expectedCoordinate) > tolerance)) addIssue(issues, ISSUE_CODES.LAYOUT_LEVEL_MISMATCH, `图 ${diagram.id} 的分支目标未处于同一 ${readingCoordinate} 层`, { decisionNodeId: rule.decisionNodeId, targetNodeIds: rule.targetNodeIds, expected: expectedCoordinate, actual: targetCoordinates, tolerance })
    if (rule.targetPort !== expectedTargetPort && rule.exception === undefined) addIssue(issues, ISSUE_CODES.BRANCH_PORT_MISMATCH, `图 ${diagram.id} 的 ${direction} 分支目标应优先从 ${expectedTargetPort} 端口进入`, { decisionNodeId: rule.decisionNodeId, expected: expectedTargetPort, actual: rule.targetPort })
    for (const edgeId of rule.edgeIds ?? []) {
      const edge = edgesById.get(edgeId)
      if (!edge) continue
      if (edge.toPort !== rule.targetPort && rule.exception === undefined) addIssue(issues, ISSUE_CODES.BRANCH_PORT_MISMATCH, `图 ${diagram.id} 的分支边 ${edge.id} 未使用声明的目标端口`, { edgeId: edge.id, expected: rule.targetPort, actual: edge.toPort })
      if (rule.exception !== undefined || rule.targetPort !== expectedTargetPort || !Array.isArray(edge.points) || edge.points.length < 2) continue
      const previous = edge.points.at(-2)
      const last = edge.points.at(-1)
      const followsReadingDirection = direction === "TD"
        ? Math.abs(previous[0] - last[0]) <= tolerance && previous[1] < last[1] - tolerance
        : Math.abs(previous[1] - last[1]) <= tolerance && previous[0] < last[0] - tolerance
      if (!followsReadingDirection) addIssue(issues, ISSUE_CODES.BRANCH_PATH_DIRECTION, `图 ${diagram.id} 的分支边 ${edge.id} 末段未沿 ${direction} 主阅读方向进入目标`, { edgeId: edge.id, direction, previous, last })
    }
  }
}

function validateContentOrder(diagram, issues, thresholds, labels) {
  const annotations = annotationBoxes(diagram)
  const legendBounds = estimateLegendBounds(diagram, annotations)
  const businessBounds = businessContentBounds(diagram, labels)
  if (legendBounds && businessBounds && legendBounds.top < businessBounds.bottom + thresholds.CANVAS_MARGIN) addIssue(issues, ISSUE_CODES.CONTENT_ORDER_INVALID, `图 ${diagram.id} 的图例未位于业务主体下方并保留间距`, { businessBBox: businessBounds, legendBBox: legendBounds, minimum: thresholds.CANVAS_MARGIN })
  if (legendBounds) for (const annotation of annotations) if (annotation.top < legendBounds.bottom + thresholds.CANVAS_MARGIN) addIssue(issues, ISSUE_CODES.CONTENT_ORDER_INVALID, `图 ${diagram.id} 的注释 ${annotation.annotationId ?? "<missing>"} 未位于图例下方`, { annotationId: annotation.annotationId, legendBBox: legendBounds, annotationBBox: annotation, minimum: thresholds.CANVAS_MARGIN })
  return { legendBounds, businessBounds, annotationBoxes: annotations }
}

function validateCanvas(diagram, issues, thresholds, labels, extraBoxes = []) {
  if (!diagram.canvas) return null
  const canvas = { left: 0, top: 0, right: diagram.canvas.width, bottom: diagram.canvas.height }
  const content = contentBounds(diagram, labels, extraBoxes)
  if (!content) return null
  if (content.left < 0 || content.top < 0 || content.right > canvas.right || content.bottom > canvas.bottom) addIssue(issues, ISSUE_CODES.CANVAS_CLIPPING, "可见内容超出画布或 viewBox", { contentBBox: content, canvasBBox: canvas })
  const contentWidth = Math.max(0, content.right - content.left)
  const contentHeight = Math.max(0, content.bottom - content.top)
  if (contentWidth / canvas.right < thresholds.MIN_CONTENT_RATIO || contentHeight / canvas.bottom < thresholds.MIN_CONTENT_RATIO) addIssue(issues, ISSUE_CODES.CANVAS_TOO_EMPTY, "可见内容相对画布过小，存在明显空白", { contentBBox: content, canvasBBox: canvas, contentWidth, contentHeight })
  for (const [side, margin] of [["left", content.left], ["top", content.top], ["right", canvas.right - content.right], ["bottom", canvas.bottom - content.bottom]]) {
    if (margin < 0) continue
    if (margin < thresholds.CANVAS_MARGIN) addIssue(issues, ISSUE_CODES.INSUFFICIENT_GAP, `画布 ${side} 留白小于 ${thresholds.CANVAS_MARGIN}`, { side, actual: margin, minimum: thresholds.CANVAS_MARGIN })
  }
  return { contentBBox: content, canvasBBox: canvas }
}

export function validateGeometryDiagram(diagram, options = {}) {
  const thresholds = { ...DEFAULT_GEOMETRY_THRESHOLDS, ...(options.thresholds ?? {}) }
  const semantic = options.semanticReport ?? validateSemanticDiagram(diagram)
  if (semantic.status === VALIDATION_STATUS.FAIL) return { status: VALIDATION_STATUS.UNVERIFIED, stage: "geometry", issues: [makeIssue(ISSUE_CODES.INVALID_FIELD, "语义验证失败，几何验证未执行")], skipped: true }
  if (semantic.migrationRequired) return { status: VALIDATION_STATUS.MIGRATION_REQUIRED, stage: "geometry", issues: [makeIssue(ISSUE_CODES.MIGRATION_REQUIRED, "旧资产缺少新结构化字段，几何证据需要迁移", {}, "migration")], skipped: true }
  if (!completeGeometry(diagram)) return { status: VALIDATION_STATUS.MIGRATION_REQUIRED, stage: "geometry", issues: [makeIssue(ISSUE_CODES.MIGRATION_REQUIRED, "缺少完整 points，旧资产几何证据需要迁移", {}, "migration")], skipped: true }

  const issues = []
  validateNodeCollisions(diagram, issues, thresholds)
  validateGroupContainment(diagram, issues, thresholds)
  const edgeGeometryUnverified = validateEdgeGeometry(diagram, issues, thresholds)
  const labels = validateLabels(diagram, issues, thresholds)
  validateLayoutGeometry(diagram, issues, thresholds)
  const contentOrder = validateContentOrder(diagram, issues, thresholds, labels)
  const bounds = validateCanvas(diagram, issues, thresholds, labels, contentOrder.legendBounds ? [contentOrder.legendBounds] : [])
  const status = reportStatus(issues)
  return { status: status === VALIDATION_STATUS.PASS && edgeGeometryUnverified ? VALIDATION_STATUS.UNVERIFIED : status, stage: "geometry", issues, contentBBox: bounds?.contentBBox ?? null, canvasBBox: bounds?.canvasBBox ?? null, legendBBox: contentOrder.legendBounds }
}

export function validateSvgTraceability(diagram, svg) {
  if (typeof svg !== "string") return { status: VALIDATION_STATUS.UNVERIFIED, stage: "svg", issues: [makeIssue(ISSUE_CODES.ANNOTATION_ID_MISMATCH, "未提供 SVG，注释 ID 映射未执行", {}, "info")] }
  const annotations = diagram.annotations ?? []
  if (!isStructuredDiagram(diagram) && annotations.some(annotation => typeof annotation.id !== "string" || annotation.id.length === 0)) return { status: VALIDATION_STATUS.MIGRATION_REQUIRED, stage: "svg", issues: [makeIssue(ISSUE_CODES.MIGRATION_REQUIRED, "旧资产注释缺少稳定 ID，SVG 注释映射需迁移", {}, "migration")] }
  const expectedIds = annotations.map(annotation => annotation.id).filter(id => typeof id === "string" && id.length > 0)
  const actualIds = [...svg.matchAll(/\bdata-note="([^"]+)"/g)].map(match => decodeXmlAttribute(match[1]))
  const issues = []
  const expectedSet = new Set(expectedIds)
  const actualSet = new Set(actualIds)
  if (actualIds.length !== expectedIds.length || actualSet.size !== actualIds.length || expectedSet.size !== expectedIds.length || actualIds.some(id => !expectedSet.has(id))) addIssue(issues, ISSUE_CODES.ANNOTATION_ID_MISMATCH, `图 ${diagram.id} 的 JSON/SVG 注释 ID 集合不一致`, { expectedIds, actualIds })
  const nodeIndex = svg.indexOf('id="nodes"')
  const legendIndex = svg.indexOf('id="legend"')
  const annotationIndex = svg.indexOf('id="annotations"')
  if (nodeIndex < 0 || annotationIndex < 0 || (legendIndex >= 0 && legendIndex < nodeIndex) || (legendIndex >= 0 && annotationIndex < legendIndex) || (legendIndex < 0 && annotationIndex < nodeIndex)) addIssue(issues, ISSUE_CODES.CONTENT_ORDER_INVALID, `图 ${diagram.id} 的 SVG 绘制顺序不是业务主体 → 图例 → 注释`, { nodeIndex, legendIndex, annotationIndex })
  return { status: reportStatus(issues), stage: "svg", issues, expectedIds, actualIds }
}

function decodeXmlAttribute(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&")
}

function riskReason(code, points, message) {
  return { code, points, message }
}

function targetEnvironmentIsBrowser(environment) {
  if (typeof environment === "string") return environment.toLowerCase().includes("browser")
  if (!environment || typeof environment !== "object") return false
  return String(environment.kind ?? environment.type ?? environment.name ?? "").toLowerCase().includes("browser")
}

export function calculateDiagramRisk(diagram, options = {}) {
  const reasons = []
  let score = 0
  const add = (code, points, message) => {
    score += points
    reasons.push(riskReason(code, points, message))
  }
  const nodes = diagram?.nodes ?? []
  const edges = diagram?.edges ?? []
  const groups = diagram?.groups ?? []
  if (nodes.length > 20) add("NODE_COUNT", 1, `节点数 ${nodes.length} > 20`)
  if (edges.length > 30) add("EDGE_COUNT", 1, `连线数 ${edges.length} > 30`)
  if (edges.some(edge => (edge.points?.length ?? 0) > 3 || (edge.points ?? []).some((point, index, points) => index > 0 && point[0] !== points[index - 1][0] && point[1] !== points[index - 1][1]))) add("COMPLEX_ROUTING", 2, "存在多拐点或非正交路径")
  const sidePorts = new Map()
  for (const edge of edges) {
    for (const attachment of ["from", "to"]) {
      const key = `${attachment}:${edge[attachment]}:${edge[`${attachment}Port`] ?? (attachment === "from" ? "right" : "left")}`
      sidePorts.set(key, (sidePorts.get(key) ?? 0) + 1)
    }
  }
  if ([...sidePorts.values()].some(count => count > 1)) add("SHARED_SIDE_PORT", 2, "存在多条连线共用同一节点同侧端口")
  if (diagram?.diagramType === "sequence") add("SEQUENCE", 1, "Sequence 图需要生命线和消息布局验证")
  if (["flowchart", "pipeline"].includes(diagram?.diagramType) && (nodes.length > 8 || edges.length > 12)) add("COMPLEX_FLOW", 2, "流程图规模超过单图舒适阈值")
  const nestedDepth = groups.reduce((maximum, group) => Math.max(maximum, group.parent ? 2 : 1), 0)
  if (nestedDepth > 1) add("NESTED_GROUP", 2, "存在多层分组")
  if ((diagram?.legend?.items?.length ?? 0) > 2) add("COMPLEX_LEGEND", 1, "图例包含多个语义编码")
  const fontSizes = new Set(nodes.map(node => node.fontSize).filter(value => value !== undefined))
  if (fontSizes.size > 1 || Array.isArray(options.fonts) && options.fonts.length > 1) add("MULTIPLE_FONTS", 2, "存在多个字体尺寸或字体族")
  if (nodes.some(node => textLines(node.label).length > 1 || textLines(node.details).length > 1) || edges.some(edge => textLines(edge.label?.text).length > 1)) add("COMPLEX_TEXT", 2, "存在多行节点、详情或边标签")
  const svg = options.svg ?? ""
  if (/<\s*foreignObject\b/i.test(svg)) add("FOREIGN_OBJECT", 3, "SVG 使用 foreignObject")
  if (/\btransform\s*=/.test(svg)) add("TRANSFORM", 1, "SVG 使用 transform")
  if (/\bmarker-(?:start|end)\s*=/.test(svg)) add("MARKER", 1, "SVG 使用 marker")
  if (options.historyVisualFailure === true) add("HISTORICAL_FAILURE", 3, "存在历史视觉失败记录")
  if (targetEnvironmentIsBrowser(options.targetReadingEnvironment)) add("BROWSER_ENVIRONMENT", 3, "目标阅读环境为浏览器")
  if (options.userRequestedBrowserVerification === true) add("EXPLICIT_BROWSER_REQUEST", 3, "用户明确要求浏览器验证")
  const level = score >= 6 ? RISK_LEVELS.HIGH : score >= 3 ? RISK_LEVELS.MEDIUM : RISK_LEVELS.LOW
  return { score, level, reasons }
}

function operationsRequireTarget(operations) {
  return operations.some(operation => ["preview", "render", "export"].includes(operation))
}

export function routeBrowserVerification(options = {}) {
  const operations = Array.isArray(options.targetOperations) ? options.targetOperations : []
  const sourceOnly = operations.length === 0 || (operations.length === 1 && operations[0] === "source-only")
  const explicit = options.userRequestedBrowserVerification === true
  const browserEnvironment = targetEnvironmentIsBrowser(options.targetReadingEnvironment)
  const riskLevel = options.risk?.level ?? options.riskLevel ?? RISK_LEVELS.LOW
  const staticPass = options.semanticStatus === VALIDATION_STATUS.PASS
    && options.geometryStatus === VALIDATION_STATUS.PASS
    && (options.svgStatus === undefined || options.svgStatus === VALIDATION_STATUS.PASS)
  const targetRequested = operationsRequireTarget(operations)
  const reasons = []
  let required = false
  let shouldExecute = false

  if (explicit) {
    required = true
    reasons.push("用户明确要求浏览器验证")
  } else if (browserEnvironment) {
    required = true
    reasons.push("目标阅读环境为浏览器")
  } else if (sourceOnly) {
    reasons.push("仅要求源交付，不启动浏览器")
  } else if (riskLevel === RISK_LEVELS.HIGH) {
    required = true
    reasons.push("高风险图表进入浏览器验证")
  } else if (riskLevel === RISK_LEVELS.MEDIUM && targetRequested) {
    required = true
    reasons.push("中风险图表且目标操作需要 Provider")
  } else {
    reasons.push("低风险或未要求目标操作，默认不启动浏览器")
  }

  if (required && !staticPass) reasons.push("静态语义/几何门禁未通过，先修复源问题")
  if (required && staticPass) shouldExecute = true
  const chromeAvailable = options.chromeAvailable === true
  let status = VALIDATION_STATUS.UNVERIFIED
  if (required && !staticPass) status = VALIDATION_STATUS.UNVERIFIED
  else if (required && !chromeAvailable) status = VALIDATION_STATUS.NEEDS_CAPABILITY
  return {
    required,
    shouldExecute,
    executed: false,
    status,
    provider: shouldExecute ? "chrome-devtools" : null,
    reasons,
    readingStates: ["normal", "fit", "zoom"],
  }
}

function hasFiniteBox(box) {
  return box && ["left", "top", "right", "bottom"].every(key => isFiniteNumber(box[key]))
}

function renderEvidenceMissingFields(result) {
  const missing = []
  if (result.executed !== true) missing.push("executed=true")
  if (typeof result.provider !== "string" || result.provider.length === 0) missing.push("provider")
  if (typeof result.input !== "string" || result.input.length === 0) missing.push("input")
  if (!result.surface || !isFiniteNumber(result.surface.width) || !isFiniteNumber(result.surface.height) || result.surface.width <= 0 || result.surface.height <= 0) missing.push("surface.width/height")
  if (!result.geometry || !hasFiniteBox(result.geometry.contentBBox) || !hasFiniteBox(result.geometry.canvasBBox) || result.geometry.clipped !== false) missing.push("geometry.contentBBox/canvasBBox/clipped=false")
  if (!((typeof result.evidence === "string" && result.evidence.length > 0) || (Array.isArray(result.screenshots) && result.screenshots.length > 0))) missing.push("evidence 或 screenshots")
  return missing
}

export function createRenderQaReport(options = {}) {
  if (options.providerResult === undefined) {
    return {
      status: VALIDATION_STATUS.UNVERIFIED,
      stage: "render",
      issues: [makeIssue(ISSUE_CODES.RENDER_NOT_EXECUTED, "未执行静态渲染表面检查；SVG源包络检查不能替代Render QA", {}, "info")],
      provider: options.provider ?? null,
    }
  }
  const result = options.providerResult
  const validStatuses = new Set([VALIDATION_STATUS.PASS, VALIDATION_STATUS.FAIL, VALIDATION_STATUS.UNVERIFIED, VALIDATION_STATUS.MIGRATION_REQUIRED, VALIDATION_STATUS.NEEDS_CAPABILITY])
  if (!result || typeof result !== "object" || !validStatuses.has(result.status)) return {
    status: VALIDATION_STATUS.FAIL,
    stage: "render",
    issues: [makeIssue(ISSUE_CODES.RENDER_EVIDENCE_INVALID, "Render Provider 返回了无效状态", {}, "error")],
  }
  if (result.status === VALIDATION_STATUS.PASS) {
    const missing = renderEvidenceMissingFields(result)
    if (missing.length > 0) return {
      status: VALIDATION_STATUS.FAIL,
      stage: "render",
      issues: [makeIssue(ISSUE_CODES.RENDER_EVIDENCE_INVALID, `Render PASS 缺少可复查证据：${missing.join("、")}`, { missing }, "error")],
      provider: result.provider ?? null,
    }
  }
  return { ...result, stage: "render", issues: Array.isArray(result.issues) ? result.issues : [] }
}

export function validateDiagramPipeline(diagram, options = {}) {
  const semanticReport = validateSemanticDiagram(diagram)
  const { maps: _maps, ...semantic } = semanticReport
  const geometry = validateGeometryDiagram(diagram, { ...options, semanticReport })
  const render = createRenderQaReport(options)
  const svg = validateSvgTraceability(diagram, options.svg)
  const risk = calculateDiagramRisk(diagram, options)
  const browser = routeBrowserVerification({
    ...options,
    risk,
    semanticStatus: semantic.status,
    geometryStatus: geometry.status,
    svgStatus: svg.status,
  })
  const hasFailure = semantic.status === VALIDATION_STATUS.FAIL || geometry.status === VALIDATION_STATUS.FAIL || render.status === VALIDATION_STATUS.FAIL || svg.status === VALIDATION_STATUS.FAIL
  const migration = semantic.status === VALIDATION_STATUS.MIGRATION_REQUIRED || geometry.status === VALIDATION_STATUS.MIGRATION_REQUIRED || render.status === VALIDATION_STATUS.MIGRATION_REQUIRED || svg.status === VALIDATION_STATUS.MIGRATION_REQUIRED
  let deliveryStatus = VALIDATION_STATUS.SOURCE_READY
  if (hasFailure) deliveryStatus = VALIDATION_STATUS.FAIL
  else if (migration) deliveryStatus = VALIDATION_STATUS.MIGRATION_REQUIRED
  else if (browser.status === VALIDATION_STATUS.NEEDS_CAPABILITY) deliveryStatus = VALIDATION_STATUS.NEEDS_CAPABILITY
  else if (operationsRequireTarget(Array.isArray(options.targetOperations) ? options.targetOperations : [])) deliveryStatus = VALIDATION_STATUS.UNVERIFIED
  return { semantic, geometry, render, svg, risk, browser, delivery: { status: deliveryStatus } }
}

export function hasMigrationRequired(report) {
  return [report?.semantic?.status, report?.geometry?.status, report?.render?.status, report?.svg?.status, report?.delivery?.status].includes(VALIDATION_STATUS.MIGRATION_REQUIRED)
}

export function formatValidationIssues(report) {
  return report.issues.map(issue => `[${issue.code}] ${issue.message}`).join("；")
}
