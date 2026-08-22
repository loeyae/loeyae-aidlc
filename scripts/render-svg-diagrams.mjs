#!/usr/bin/env node

/**
 * 将通用图表场景规格渲染为静态、安全的 SVG 资产。
 *
 * 用法：
 * node scripts/render-svg-diagrams.mjs <input.diagram.json> <output-directory>
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PORTS = new Set(["top", "right", "bottom", "left"])
const SHAPES = new Set(["round", "rect", "diamond", "ellipse", "database", "actor", "note"])
const EDGE_KINDS = new Set(["directed", "bidirectional", "undirected", "dashed"])
const TEXT_ANCHORS = new Set(["start", "middle", "end"])
const FONT_WEIGHTS = new Set(["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold"])
const TONES = {
  neutral: { fill: "#f8fafc", stroke: "#334155", text: "#0f172a" },
  accent: { fill: "#e0f2fe", stroke: "#0369a1", text: "#0c4a6e" },
  muted: { fill: "#f1f5f9", stroke: "#64748b", text: "#334155" },
  success: { fill: "#dcfce7", stroke: "#15803d", text: "#14532d" },
  warning: { fill: "#fef3c7", stroke: "#b45309", text: "#78350f" },
  danger: { fill: "#fee2e2", stroke: "#b91c1c", text: "#7f1d1d" },
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function toLines(value) {
  if (Array.isArray(value)) {
    assert(value.length > 0 && value.every(line => typeof line === "string" && line.length > 0), "多行文本不能为空")
    return value
  }
  assert(typeof value === "string" && value.length > 0, "文本不能为空")
  return [value]
}

function toneFor(value) {
  return TONES[value ?? "neutral"] ?? TONES.neutral
}

function validateOptionalPositiveNumber(value, message) {
  assert(value === undefined || (Number.isFinite(value) && value > 0), message)
}

function nodeBounds(node) {
  return {
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + node.height,
    centerX: node.x + node.width / 2,
    centerY: node.y + node.height / 2,
  }
}

function portPoint(node, port) {
  const bounds = nodeBounds(node)
  switch (port) {
    case "top": return [bounds.centerX, bounds.top]
    case "right": return [bounds.right, bounds.centerY]
    case "bottom": return [bounds.centerX, bounds.bottom]
    case "left": return [bounds.left, bounds.centerY]
    default: throw new Error(`未知端口：${port}`)
  }
}

function validatePoint(value, message) {
  assert(Array.isArray(value) && value.length === 2 && value.every(Number.isFinite), message)
}

function validateNode(node, diagram) {
  assert(typeof node.id === "string" && node.id.length > 0, `图 ${diagram.id} 存在无效节点 ID`)
  assert(SHAPES.has(node.shape ?? "rect"), `图 ${diagram.id} 的节点 ${node.id} 使用了不支持的形状`)
  toLines(node.label)
  for (const property of ["x", "y", "width", "height"]) {
    assert(Number.isFinite(node[property]) && node[property] > 0, `图 ${diagram.id} 的节点 ${node.id} 缺少有效 ${property}`)
  }
  const bounds = nodeBounds(node)
  assert(bounds.right <= diagram.canvas.width && bounds.bottom <= diagram.canvas.height, `图 ${diagram.id} 的节点 ${node.id} 超出画布`)
  if (node.details !== undefined) toLines(node.details)
  validateOptionalPositiveNumber(node.fontSize, `图 ${diagram.id} 的节点 ${node.id} 使用了无效字体大小`)
  if (node.tone !== undefined) assert(TONES[node.tone], `图 ${diagram.id} 的节点 ${node.id} 使用了未知颜色语义`)
}

function validateDiagram(diagram, documentPath) {
  assert(diagram && typeof diagram === "object", `${documentPath} 包含无效图表对象`)
  assert(typeof diagram.id === "string" && /^[a-z0-9-]+$/.test(diagram.id), `${documentPath} 中图表 ID 必须为小写 kebab-case`)
  assert(typeof diagram.output === "string" && /^[a-z0-9-]+\.svg$/.test(diagram.output), `图 ${diagram.id} 的输出文件名无效`)
  assert(typeof diagram.title === "string" && diagram.title.length > 0, `图 ${diagram.id} 缺少标题`)
  assert(typeof diagram.description === "string" && diagram.description.length > 0, `图 ${diagram.id} 缺少描述`)
  assert(diagram.canvas && Number.isFinite(diagram.canvas.width) && Number.isFinite(diagram.canvas.height), `图 ${diagram.id} 缺少画布尺寸`)
  assert(diagram.canvas.width > 0 && diagram.canvas.height > 0, `图 ${diagram.id} 的画布尺寸无效`)
  assert(Array.isArray(diagram.nodes) && diagram.nodes.length > 0, `图 ${diagram.id} 至少需要一个节点`)
  assert(diagram.edges === undefined || Array.isArray(diagram.edges), `图 ${diagram.id} 的连线必须为数组`)
  assert(Array.isArray(diagram.groups ?? []), `图 ${diagram.id} 的分组必须为数组`)
  assert(Array.isArray(diagram.annotations ?? []), `图 ${diagram.id} 的注释必须为数组`)

  const nodeIds = new Set()
  const nodesById = new Map()
  for (const node of diagram.nodes) {
    validateNode(node, diagram)
    assert(!nodeIds.has(node.id), `图 ${diagram.id} 的节点 ID 重复：${node.id}`)
    nodeIds.add(node.id)
    nodesById.set(node.id, node)
  }

  const edgeIds = new Set()
  for (const edge of diagram.edges ?? []) {
    assert(typeof edge.id === "string" && edge.id.length > 0, `图 ${diagram.id} 存在无效连线 ID`)
    assert(!edgeIds.has(edge.id), `图 ${diagram.id} 的连线 ID 重复：${edge.id}`)
    edgeIds.add(edge.id)
    assert(nodesById.has(edge.from) && nodesById.has(edge.to), `图 ${diagram.id} 的连线 ${edge.id} 引用了不存在的节点`)
    assert(PORTS.has(edge.fromPort ?? "right") && PORTS.has(edge.toPort ?? "left"), `图 ${diagram.id} 的连线 ${edge.id} 使用了无效端口`)
    assert(EDGE_KINDS.has(edge.kind ?? "directed"), `图 ${diagram.id} 的连线 ${edge.id} 使用了无效类型`)
    if (edge.points !== undefined) {
      assert(Array.isArray(edge.points) && edge.points.length >= 2, `图 ${diagram.id} 的连线 ${edge.id} 路径无效`)
      edge.points.forEach((point, index) => validatePoint(point, `图 ${diagram.id} 的连线 ${edge.id} 的第 ${index + 1} 个路径点无效`))
    }
    if (edge.label !== undefined) {
      assert(edge.label && typeof edge.label === "object", `图 ${diagram.id} 的连线 ${edge.id} 标签无效`)
      toLines(edge.label.text)
      assert(Number.isFinite(edge.label.x) && Number.isFinite(edge.label.y), `图 ${diagram.id} 的连线 ${edge.id} 标签坐标无效`)
    }
  }

  for (const group of diagram.groups ?? []) {
    assert(typeof group.id === "string" && group.id.length > 0, `图 ${diagram.id} 存在无效分组 ID`)
    assert(typeof group.label === "string" && group.label.length > 0, `图 ${diagram.id} 的分组 ${group.id} 缺少标签`)
    for (const property of ["x", "y", "width", "height"]) {
      assert(Number.isFinite(group[property]) && group[property] > 0, `图 ${diagram.id} 的分组 ${group.id} 缺少有效 ${property}`)
    }
    assert(group.x + group.width <= diagram.canvas.width && group.y + group.height <= diagram.canvas.height, `图 ${diagram.id} 的分组 ${group.id} 超出画布`)
    if (group.tone !== undefined) assert(TONES[group.tone], `图 ${diagram.id} 的分组 ${group.id} 使用了未知颜色语义`)
  }

  for (const annotation of diagram.annotations ?? []) {
    toLines(annotation.text)
    assert(Number.isFinite(annotation.x) && Number.isFinite(annotation.y), `图 ${diagram.id} 存在无效注释坐标`)
    validateOptionalPositiveNumber(annotation.fontSize, `图 ${diagram.id} 存在无效注释字体大小`)
    validateOptionalPositiveNumber(annotation.lineHeight, `图 ${diagram.id} 存在无效注释行高`)
    if (annotation.anchor !== undefined) assert(TEXT_ANCHORS.has(annotation.anchor), `图 ${diagram.id} 存在无效注释对齐方式`)
    if (annotation.weight !== undefined) assert(FONT_WEIGHTS.has(String(annotation.weight)), `图 ${diagram.id} 存在无效注释字重`)
    if (annotation.tone !== undefined) assert(TONES[annotation.tone], `图 ${diagram.id} 存在未知注释颜色语义`)
  }
}

function renderMultilineText({ lines, x, y, fontSize = 16, fill = "#0f172a", anchor = "middle", weight = "500", lineHeight = 20, className = "" }) {
  const top = y - ((lines.length - 1) * lineHeight) / 2
  const tspans = lines.map((line, index) => `<tspan x="${x}" y="${top + index * lineHeight}">${escapeXml(line)}</tspan>`).join("")
  return `<text${className ? ` class="${className}"` : ""} text-anchor="${anchor}" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${tspans}</text>`
}

function renderGroup(group) {
  const tone = toneFor(group.tone ?? "muted")
  return [
    `<g id="group-${escapeXml(group.id)}">`,
    `<rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="12" fill="${tone.fill}" fill-opacity="0.52" stroke="${tone.stroke}" stroke-width="1.5" stroke-dasharray="6 4"/>`,
    `<text x="${group.x + 16}" y="${group.y + 24}" text-anchor="start" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="15" font-weight="700" fill="${tone.text}">${escapeXml(group.label)}</text>`,
    `</g>`,
  ].join("\n")
}

function renderNode(node) {
  const tone = toneFor(node.tone)
  const shape = node.shape ?? "rect"
  const bounds = nodeBounds(node)
  const shared = `data-node="${escapeXml(node.id)}" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="2"`
  let element

  if (shape === "round") {
    element = `<rect ${shared} x="${bounds.left}" y="${bounds.top}" width="${node.width}" height="${node.height}" rx="24"/>`
  } else if (shape === "rect") {
    element = `<rect ${shared} x="${bounds.left}" y="${bounds.top}" width="${node.width}" height="${node.height}" rx="6"/>`
  } else if (shape === "note") {
    const fold = Math.min(20, node.width / 5, node.height / 4)
    element = `<path ${shared} d="M ${bounds.left} ${bounds.top} H ${bounds.right - fold} L ${bounds.right} ${bounds.top + fold} V ${bounds.bottom} H ${bounds.left} Z M ${bounds.right - fold} ${bounds.top} V ${bounds.top + fold} H ${bounds.right}"/>`
  } else if (shape === "diamond") {
    element = `<polygon ${shared} points="${bounds.centerX},${bounds.top} ${bounds.right},${bounds.centerY} ${bounds.centerX},${bounds.bottom} ${bounds.left},${bounds.centerY}"/>`
  } else if (shape === "ellipse") {
    element = `<ellipse ${shared} cx="${bounds.centerX}" cy="${bounds.centerY}" rx="${node.width / 2}" ry="${node.height / 2}"/>`
  } else if (shape === "database") {
    const radiusY = Math.min(16, node.height / 5)
    element = `<path ${shared} d="M ${bounds.left} ${bounds.top + radiusY} C ${bounds.left} ${bounds.top - radiusY / 2}, ${bounds.right} ${bounds.top - radiusY / 2}, ${bounds.right} ${bounds.top + radiusY} V ${bounds.bottom - radiusY} C ${bounds.right} ${bounds.bottom + radiusY / 2}, ${bounds.left} ${bounds.bottom + radiusY / 2}, ${bounds.left} ${bounds.bottom - radiusY} Z M ${bounds.left} ${bounds.top + radiusY} C ${bounds.left} ${bounds.top + radiusY * 2.5}, ${bounds.right} ${bounds.top + radiusY * 2.5}, ${bounds.right} ${bounds.top + radiusY}"/>`
  } else {
    const headY = bounds.top + Math.min(18, node.height / 4)
    const bodyTop = bounds.top + Math.min(36, node.height / 2)
    element = `<g ${shared}><circle cx="${bounds.centerX}" cy="${headY}" r="${Math.min(14, node.width / 7)}"/><rect x="${bounds.left}" y="${bodyTop}" width="${node.width}" height="${Math.max(24, bounds.bottom - bodyTop)}" rx="8"/></g>`
  }

  const lines = toLines(node.label)
  const details = node.details === undefined ? [] : toLines(node.details)
  const labelY = details.length === 0 ? bounds.centerY + 5 : bounds.top + 26
  const detailStartY = labelY + 26
  return [
    `<g id="node-${escapeXml(node.id)}">`,
    element,
    renderMultilineText({ lines, x: bounds.centerX, y: labelY, fontSize: node.fontSize ?? 16, fill: tone.text, weight: "700", lineHeight: 19 }),
    details.length === 0 ? "" : renderMultilineText({ lines: details, x: bounds.centerX, y: detailStartY + ((details.length - 1) * 16) / 2, fontSize: 12, fill: tone.text, weight: "400", lineHeight: 16 }),
    `</g>`,
  ].filter(Boolean).join("\n")
}

function renderEdge(edge, nodesById) {
  const source = nodesById.get(edge.from)
  const target = nodesById.get(edge.to)
  const fromPort = edge.fromPort ?? "right"
  const toPort = edge.toPort ?? "left"
  const points = edge.points ?? [portPoint(source, fromPort), portPoint(target, toPort)]
  const kind = edge.kind ?? "directed"
  const markerStart = kind === "bidirectional" ? " marker-start=\"url(#arrow)\"" : ""
  const markerEnd = kind === "directed" || kind === "bidirectional" || kind === "dashed" ? " marker-end=\"url(#arrow)\"" : ""
  const dash = kind === "dashed" ? " stroke-dasharray=\"6 4\"" : ""
  const pointsAttribute = points.map(point => `${point[0]},${point[1]}`).join(" ")
  return `<polyline data-edge="${escapeXml(edge.id)}" data-from="${escapeXml(edge.from)}" data-from-port="${fromPort}" data-to="${escapeXml(edge.to)}" data-to-port="${toPort}" data-kind="${kind}" points="${pointsAttribute}" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"${dash}${markerStart}${markerEnd}/>`
}

function renderEdgeLabel(edge) {
  if (!edge.label) return ""
  const lines = toLines(edge.label.text)
  const longest = Math.max(...lines.map(line => [...line].length))
  const width = Math.max(38, longest * 12 + 16)
  const height = lines.length * 16 + 8
  const x = edge.label.x - width / 2
  const y = edge.label.y - height / 2
  return [
    `<g data-edge-label="${escapeXml(edge.id)}">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="3" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>`,
    renderMultilineText({ lines, x: edge.label.x, y: edge.label.y + 5, fontSize: 12, fill: "#334155", weight: "500", lineHeight: 16 }),
    `</g>`,
  ].join("\n")
}

function renderAnnotation(annotation) {
  return renderMultilineText({
    lines: toLines(annotation.text),
    x: annotation.x,
    y: annotation.y,
    fontSize: annotation.fontSize ?? 13,
    fill: toneFor(annotation.tone ?? "muted").text,
    anchor: annotation.anchor ?? "middle",
    weight: annotation.weight ?? "400",
    lineHeight: annotation.lineHeight ?? 17,
  })
}

export function renderDiagram(diagram) {
  validateDiagram(diagram, "图表规格")
  const nodesById = new Map(diagram.nodes.map(node => [node.id, node]))
  const { width, height } = diagram.canvas
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${escapeXml(diagram.id)}-title ${escapeXml(diagram.id)}-desc">`,
    `<title id="${escapeXml(diagram.id)}-title">${escapeXml(diagram.title)}</title>`,
    `<desc id="${escapeXml(diagram.id)}-desc">${escapeXml(diagram.description)}</desc>`,
    `<defs>`,
    `<marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">`,
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/>`,
    `</marker>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${width / 2}" y="28" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(diagram.title)}</text>`,
    `<g id="groups">`,
    ...(diagram.groups ?? []).map(renderGroup),
    `</g>`,
    `<g id="connectors">`,
    ...(diagram.edges ?? []).map(edge => renderEdge(edge, nodesById)),
    `</g>`,
    `<g id="edge-labels">`,
    ...(diagram.edges ?? []).map(renderEdgeLabel).filter(Boolean),
    `</g>`,
    `<g id="nodes">`,
    ...diagram.nodes.map(renderNode),
    `</g>`,
    `<g id="annotations">`,
    ...(diagram.annotations ?? []).map(renderAnnotation),
    `</g>`,
    `</svg>`,
    "",
  ].join("\n")
}

function assertStaticSvg(svg, outputPath) {
  assert(/<svg\b/.test(svg), `${outputPath} 未生成 SVG 根元素`)
  assert(/<title\b/.test(svg) && /<desc\b/.test(svg), `${outputPath} 缺少可访问性标题或描述`)
  assert(/<\s*(?:script|foreignObject|image|style)\b|<[^>]*\b(?:href|on[a-zA-Z]+|style)\s*=|<[^>]*url\s*\(\s*(?!#)[^)]*\)/i.test(svg) === false, `${outputPath} 包含不允许的可执行或外部嵌入内容`)
}

export function renderManifest(inputPath, outputDirectory) {
  const resolvedInputPath = resolve(inputPath)
  const resolvedOutputDirectory = resolve(outputDirectory)
  const manifest = JSON.parse(readFileSync(resolvedInputPath, "utf8"))
  assert(manifest && manifest.version === 1, `${resolvedInputPath} 必须使用版本 1 图表规格`)
  assert(typeof manifest.document === "string" && manifest.document.length > 0, `${resolvedInputPath} 缺少关联文档路径`)
  assert(Array.isArray(manifest.diagrams) && manifest.diagrams.length > 0, `${resolvedInputPath} 至少需要一个图表`)

  const diagramIds = new Set()
  const outputNames = new Set()
  for (const diagram of manifest.diagrams) {
    validateDiagram(diagram, resolvedInputPath)
    assert(!diagramIds.has(diagram.id), `${resolvedInputPath} 中图表 ID 重复：${diagram.id}`)
    assert(!outputNames.has(diagram.output), `${resolvedInputPath} 中输出文件名重复：${diagram.output}`)
    diagramIds.add(diagram.id)
    outputNames.add(diagram.output)
  }

  mkdirSync(resolvedOutputDirectory, { recursive: true })
  const outputs = []
  for (const diagram of manifest.diagrams) {
    const outputPath = resolve(resolvedOutputDirectory, diagram.output)
    assert(dirname(outputPath) === resolvedOutputDirectory, `图 ${diagram.id} 的输出不得离开 assets 目录`)
    const svg = renderDiagram(diagram)
    assertStaticSvg(svg, outputPath)
    writeFileSync(outputPath, svg, "utf8")
    outputs.push(outputPath)
  }

  return { inputPath: resolvedInputPath, outputs, count: outputs.length }
}

function main() {
  const [, , inputPath, outputDirectory] = process.argv
  assert(inputPath && outputDirectory, "用法：node scripts/render-svg-diagrams.mjs <input.diagram.json> <output-directory>")
  const result = renderManifest(inputPath, outputDirectory)
  console.log(`SVG 场景渲染和结构验证通过：${result.inputPath}`)
  console.log(`输出：${result.count} 个 SVG 文件`) 
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(`SVG 场景渲染失败：${error.message}`)
    process.exitCode = 1
  }
}
