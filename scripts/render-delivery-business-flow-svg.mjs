#!/usr/bin/env node

/**
 * 将交付型业务流程图规格渲染为可验证的静态 SVG。
 *
 * 用法：
 * node scripts/render-delivery-business-flow-svg.mjs <input.diagram.json> <output.svg>
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const EPSILON = 0.001
const DECISION_ADJACENT_PORTS = {
  top: ["left", "right"],
  right: ["top", "bottom"],
  bottom: ["left", "right"],
  left: ["top", "bottom"],
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function sameNumber(left, right) {
  return Math.abs(left - right) < EPSILON
}

function samePoint(left, right) {
  return sameNumber(left.x, right.x) && sameNumber(left.y, right.y)
}

function point(x, y) {
  return { x, y }
}

function rangeOverlapsInterior(firstStart, firstEnd, secondStart, secondEnd) {
  return Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd))
    < Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd)) - EPSILON
}

function pointInRange(value, start, end) {
  return value >= Math.min(start, end) - EPSILON && value <= Math.max(start, end) + EPSILON
}

function nodeBounds(node) {
  return {
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + node.height,
  }
}

function getPort(node, port) {
  const bounds = nodeBounds(node)
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2
  const ports = node.kind === "decision"
    ? {
        top: point(centerX, bounds.top),
        right: point(bounds.right, centerY),
        bottom: point(centerX, bounds.bottom),
        left: point(bounds.left, centerY),
      }
    : {
        top: point(centerX, bounds.top),
        right: point(bounds.right, centerY),
        bottom: point(centerX, bounds.bottom),
        left: point(bounds.left, centerY),
      }

  assert(ports[port], `节点 ${node.id} 不支持端口 ${port}`)
  return ports[port]
}

function labelLines(label) {
  if (Array.isArray(label.lines)) {
    assert(label.lines.length > 0 && label.lines.every(line => typeof line === "string" && line.length > 0), "多行标签不能为空")
    return label.lines
  }
  assert(typeof label.text === "string" && label.text.length > 0, "标签不能为空")
  return [label.text]
}

function labelBox(label) {
  const lines = labelLines(label)
  if (lines.length === 1 && !Array.isArray(label.lines)) {
    const width = Math.max(28, [...lines[0]].length * 12 + 20)
    return {
      left: label.x - width / 2,
      right: label.x + width / 2,
      top: label.y - 16,
      bottom: label.y + 4,
      width,
      height: 20,
    }
  }

  const width = Math.max(52, Math.max(...lines.map(line => [...line].length)) * 12 + 20)
  const height = lines.length * 16 + 8
  return {
    left: label.x - width / 2,
    right: label.x + width / 2,
    top: label.y - height / 2,
    bottom: label.y + height / 2,
    width,
    height,
  }
}

function boxesOverlap(first, second) {
  return first.left < second.right - EPSILON
    && first.right > second.left + EPSILON
    && first.top < second.bottom - EPSILON
    && first.bottom > second.top + EPSILON
}

function segmentIntersectsBoxInterior(segment, box) {
  if (sameNumber(segment.start.x, segment.end.x)) {
    return segment.start.x > box.left + EPSILON
      && segment.start.x < box.right - EPSILON
      && rangeOverlapsInterior(segment.start.y, segment.end.y, box.top, box.bottom)
  }

  return segment.start.y > box.top + EPSILON
    && segment.start.y < box.bottom - EPSILON
    && rangeOverlapsInterior(segment.start.x, segment.end.x, box.left, box.right)
}

function segmentIntersection(first, second) {
  const firstVertical = sameNumber(first.start.x, first.end.x)
  const secondVertical = sameNumber(second.start.x, second.end.x)

  if (firstVertical && secondVertical) {
    if (!sameNumber(first.start.x, second.start.x)) return null
    const start = Math.max(Math.min(first.start.y, first.end.y), Math.min(second.start.y, second.end.y))
    const end = Math.min(Math.max(first.start.y, first.end.y), Math.max(second.start.y, second.end.y))
    if (start > end + EPSILON) return null
    if (end > start + EPSILON) return { type: "overlap" }
    return { type: "point", point: point(first.start.x, start) }
  }

  if (!firstVertical && !secondVertical) {
    if (!sameNumber(first.start.y, second.start.y)) return null
    const start = Math.max(Math.min(first.start.x, first.end.x), Math.min(second.start.x, second.end.x))
    const end = Math.min(Math.max(first.start.x, first.end.x), Math.max(second.start.x, second.end.x))
    if (start > end + EPSILON) return null
    if (end > start + EPSILON) return { type: "overlap" }
    return { type: "point", point: point(start, first.start.y) }
  }

  const vertical = firstVertical ? first : second
  const horizontal = firstVertical ? second : first
  if (!pointInRange(vertical.start.x, horizontal.start.x, horizontal.end.x)
    || !pointInRange(horizontal.start.y, vertical.start.y, vertical.end.y)) {
    return null
  }

  return { type: "point", point: point(vertical.start.x, horizontal.start.y) }
}

function segmentHasEndpoint(segment, candidate) {
  return samePoint(segment.start, candidate) || samePoint(segment.end, candidate)
}

function isAllowedSharedPort(first, second, candidate, nodesById) {
  const attachments = [
    ["from", "fromPort"],
    ["to", "toPort"],
  ]

  return attachments.some(([nodeField, portField]) => {
    if (first[nodeField] !== second[nodeField] || first[portField] !== second[portField]) {
      return false
    }
    const port = getPort(nodesById.get(first[nodeField]), first[portField])
    return samePoint(port, candidate)
  })
}

function validateSpec(spec) {
  assert(spec && typeof spec === "object", "图表规格必须是 JSON 对象")
  assert(spec.direction === "TD" || spec.direction === "LR", "图表方向必须为 TD 或 LR")
  assert(spec.canvas && Number.isFinite(spec.canvas.width) && Number.isFinite(spec.canvas.height), "画布尺寸无效")
  assert(spec.profile && typeof spec.profile === "object", "严格流程必须声明扩展 profile")
  assert(spec.profile.name === "delivery-business-flow-strict", "严格流程 profile 名称无效")
  assert(spec.profile.version === "1.0.0", "严格流程 profile 版本无效")
  assert(spec.profile.baseContract === "common-svg-diagram-standards.md", "严格流程 profile 未声明通用契约")
  assert(spec.profile.validator === "scripts/render-delivery-business-flow-svg.mjs", "严格流程 profile 未声明验证器")
  for (const field of ["nodes[].kind", "nodes[].mainInputPort", "edges[].kind", "edges[].label.lines"]) {
    assert(typeof spec.profile.fieldMappings?.[field] === "string" && spec.profile.fieldMappings[field].length > 0, `严格流程 profile 缺少字段映射：${field}`)
  }
  assert(Array.isArray(spec.nodes) && spec.nodes.length > 0, "必须至少定义一个节点")
  assert(Array.isArray(spec.edges) && spec.edges.length > 0, "必须至少定义一条连线")

  const nodesById = new Map()
  for (const node of spec.nodes) {
    assert(!nodesById.has(node.id), `节点 ID 重复：${node.id}`)
    assert(["terminal", "step", "decision"].includes(node.kind), `节点 ${node.id} 的形状无效`)
    assert(typeof node.label === "string" && node.label.length > 0, `节点 ${node.id} 缺少标签`)
    for (const property of ["x", "y", "width", "height"]) {
      assert(Number.isFinite(node[property]) && node[property] > 0, `节点 ${node.id} 的 ${property} 无效`)
    }
    if (node.kind === "decision") {
      assert(node.mainInputPort && DECISION_ADJACENT_PORTS[node.mainInputPort], `判断节点 ${node.id} 缺少有效主流程入端口`)
    }
    nodesById.set(node.id, node)
  }

  const routesByEdgeId = new Map()
  const edgeIds = new Set()
  for (const edge of spec.edges) {
    assert(!edgeIds.has(edge.id), `连线 ID 重复：${edge.id}`)
    edgeIds.add(edge.id)
    assert(nodesById.has(edge.from) && nodesById.has(edge.to), `连线 ${edge.id} 引用了不存在的节点`)
    assert(edge.kind === "directed", `连线 ${edge.id} 的类型无效：delivery-business-flow 只允许单向连接`)
    assert(Array.isArray(edge.points) && edge.points.length >= 2, `连线 ${edge.id} 至少需要两个路径点`)

    const source = nodesById.get(edge.from)
    const target = nodesById.get(edge.to)
    const sourcePort = getPort(source, edge.fromPort)
    const targetPort = getPort(target, edge.toPort)
    const points = edge.points.map((value, index) => {
      assert(Array.isArray(value) && value.length === 2 && value.every(Number.isFinite), `连线 ${edge.id} 的第 ${index + 1} 个路径点无效`)
      return point(value[0], value[1])
    })

    assert(samePoint(points[0], sourcePort), `连线 ${edge.id} 未从 ${edge.from}.${edge.fromPort} 出发`)
    assert(samePoint(points.at(-1), targetPort), `连线 ${edge.id} 未进入 ${edge.to}.${edge.toPort}`)

    const segments = []
    for (let index = 1; index < points.length; index += 1) {
      const segment = { edge, start: points[index - 1], end: points[index] }
      assert(!samePoint(segment.start, segment.end), `连线 ${edge.id} 存在零长度路径段`)
      assert(sameNumber(segment.start.x, segment.end.x) || sameNumber(segment.start.y, segment.end.y), `连线 ${edge.id} 包含非正交路径段`)
      segments.push(segment)
    }

    if (target.kind === "decision") {
      assert(edge.toPort === target.mainInputPort, `连线 ${edge.id} 必须进入判断节点 ${target.id} 的主流程入顶点 ${target.mainInputPort}`)
    }
    if (source.kind === "decision") {
      assert(DECISION_ADJACENT_PORTS[source.mainInputPort].includes(edge.fromPort), `连线 ${edge.id} 必须从判断节点 ${source.id} 主流程入顶点相邻的端点出发`)
    }

    routesByEdgeId.set(edge.id, { edge, points, segments })
  }

  for (const node of spec.nodes.filter(node => node.kind === "decision")) {
    const outgoing = spec.edges.filter(edge => edge.from === node.id)
    assert(outgoing.length === 2, `判断节点 ${node.id} 必须恰好有两条分支出线`)
  }

  const portGroups = new Map()
  for (const edge of spec.edges) {
    for (const attachment of ["from", "to"]) {
      const key = `${attachment}:${edge[attachment]}:${edge[`${attachment}Port`]}`
      const group = portGroups.get(key) ?? []
      group.push(edge)
      portGroups.set(key, group)
    }
  }
  for (const [key, group] of portGroups) {
    if (group.length < 2) continue
    const [attachment, nodeId, portName] = key.split(":")
    const expected = getPort(nodesById.get(nodeId), portName)
    for (const edge of group) {
      const route = routesByEdgeId.get(edge.id)
      const actual = attachment === "from" ? route.points[0] : route.points.at(-1)
      assert(samePoint(actual, expected), `连线 ${edge.id} 未与 ${key} 的共享端点重合`)
    }
  }

  const routes = [...routesByEdgeId.values()]
  for (const route of routes) {
    for (const segment of route.segments) {
      for (const node of spec.nodes) {
        if (node.id === route.edge.from || node.id === route.edge.to) continue
        assert(!segmentIntersectsBoxInterior(segment, nodeBounds(node)), `连线 ${route.edge.id} 穿越非端点节点 ${node.id}`)
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
          assert(intersection.type !== "overlap", `连线 ${first.edge.id} 与 ${second.edge.id} 存在重叠路径段`)
          const bothEndpoints = segmentHasEndpoint(firstSegment, intersection.point) && segmentHasEndpoint(secondSegment, intersection.point)
          assert(bothEndpoints && isAllowedSharedPort(first.edge, second.edge, intersection.point, nodesById), `连线 ${first.edge.id} 与 ${second.edge.id} 在非共享端点处相交`)
        }
      }
    }
  }

  for (const route of routes) {
    if (!route.edge.label) continue
    const label = route.edge.label
    labelLines(label)
    assert(Number.isFinite(label.x) && Number.isFinite(label.y), `连线 ${route.edge.id} 的标签坐标无效`)
    const box = labelBox(label)
    for (const node of spec.nodes) {
      assert(!boxesOverlap(box, nodeBounds(node)), `连线 ${route.edge.id} 的标签覆盖节点 ${node.id}`)
    }
    for (const otherRoute of routes) {
      for (const segment of otherRoute.segments) {
        assert(!segmentIntersectsBoxInterior(segment, box), `连线 ${route.edge.id} 的标签覆盖连线 ${otherRoute.edge.id}`)
      }
    }
  }

  return { nodesById, routesByEdgeId }
}

function renderNode(node) {
  const bounds = nodeBounds(node)
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2
  const shared = `data-node="${escapeXml(node.id)}" fill="#f8fafc" stroke="#1f2937" stroke-width="2"`
  let shape

  if (node.kind === "terminal") {
    shape = `<rect ${shared} x="${bounds.left}" y="${bounds.top}" width="${node.width}" height="${node.height}" rx="24"/>`
  } else if (node.kind === "step") {
    shape = `<rect ${shared} x="${bounds.left}" y="${bounds.top}" width="${node.width}" height="${node.height}" rx="4"/>`
  } else {
    shape = `<polygon ${shared} points="${centerX},${bounds.top} ${bounds.right},${centerY} ${centerX},${bounds.bottom} ${bounds.left},${centerY}"/>`
  }

  return [
    `<g id="node-${escapeXml(node.id)}">`,
    shape,
    `<text x="${centerX}" y="${centerY + 6}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="18" font-weight="600" fill="#111827">${escapeXml(node.label)}</text>`,
    `</g>`,
  ].join("\n")
}

function renderEdge(route) {
  const { edge, points } = route
  const pointsAttribute = points.map(candidate => `${candidate.x},${candidate.y}`).join(" ")
  return `<polyline data-edge="${escapeXml(edge.id)}" data-from="${escapeXml(edge.from)}" data-from-port="${escapeXml(edge.fromPort)}" data-to="${escapeXml(edge.to)}" data-to-port="${escapeXml(edge.toPort)}" data-kind="${escapeXml(edge.kind)}" points="${pointsAttribute}" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" marker-end="url(#arrow)"/>`
}

function renderLabel(route) {
  const { edge } = route
  if (!edge.label) return ""
  const box = labelBox(edge.label)
  const lines = labelLines(edge.label)
  const text = lines.length === 1 && !Array.isArray(edge.label.lines)
    ? `<text x="${edge.label.x}" y="${edge.label.y}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="14" fill="#334155">${escapeXml(lines[0])}</text>`
    : `<text text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="14" fill="#334155">${lines.map((line, index) => `<tspan x="${edge.label.x}" y="${box.top + 15 + index * 16}">${escapeXml(line)}</tspan>`).join("")}</text>`
  return [
    `<g data-edge-label="${escapeXml(edge.id)}">`,
    `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" rx="2" fill="#ffffff"/>`,
    text,
    `</g>`,
  ].join("\n")
}

function renderSvg(spec, validation) {
  const { width, height } = spec.canvas
  const routes = spec.edges.map(edge => validation.routesByEdgeId.get(edge.id))
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${escapeXml(spec.id)}-title ${escapeXml(spec.id)}-desc">`,
    `<title id="${escapeXml(spec.id)}-title">${escapeXml(spec.title)}</title>`,
    `<desc id="${escapeXml(spec.id)}-desc">${escapeXml(spec.description)}</desc>`,
    `<defs>`,
    `<marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">`,
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"/>`,
    `</marker>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="${width / 2}" y="28" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="20" font-weight="700" fill="#111827">${escapeXml(spec.title)}</text>`,
    `<g id="connectors">`,
    ...routes.map(renderEdge),
    `</g>`,
    `<g id="edge-labels">`,
    ...routes.map(renderLabel).filter(Boolean),
    `</g>`,
    `<g id="nodes">`,
    ...spec.nodes.map(renderNode),
    `</g>`,
    `</svg>`,
    "",
  ].join("\n")
}

export function renderDeliveryBusinessFlowSvg(spec) {
  return renderSvg(spec, validateSpec(spec))
}

function main() {
  const [, , inputPath, outputPath] = process.argv
  assert(inputPath && outputPath, "用法：node scripts/render-delivery-business-flow-svg.mjs <input.diagram.json> <output.svg>")

  const resolvedInputPath = resolve(inputPath)
  const resolvedOutputPath = resolve(outputPath)
  const spec = JSON.parse(readFileSync(resolvedInputPath, "utf8"))
  writeFileSync(resolvedOutputPath, renderDeliveryBusinessFlowSvg(spec), "utf8")
  console.log(`SVG 渲染和结构验证通过：${resolvedOutputPath}`)
  console.log(`节点：${spec.nodes.length}；连线：${spec.edges.length}；判断：${spec.nodes.filter(node => node.kind === "decision").length}`)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(`SVG 渲染失败：${error.message}`)
    process.exitCode = 1
  }
}
