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

const DIAGRAM_TYPES = new Set([
  "architecture", "context", "container", "flowchart", "pipeline", "sequence", "state", "er", "deployment", "class", "component", "infrastructure",
])
const SEMANTIC_MODES = new Set(["static-boundary", "static-relation", "process-flow", "data-flow", "dependency-flow", "constraint"])
const VISUAL_CHANNELS = new Set(["edge-kind", "node-shape", "tone", "group-role", "icon"])
const VISUAL_ROLES = new Set(["semantic", "decorative"])
const GROUP_TYPES = new Set(["exclusive", "nested", "cross-cutting", "overlay"])
const LEGEND_TARGET_KINDS = new Set(["node", "edge", "group"])
const LEGEND_DECISION_STATUSES = new Set(["required", "exempt", "not-needed"])
const SPLIT_STATUSES = new Set(["not-needed", "split", "kept-single"])
const EVIDENCE_STATUSES = new Set(["PASS", "FAIL", "UNVERIFIED"])
const LEGEND_MARGIN = 24
const LEGEND_GAP = 24
const GROUP_BORDER_DASHES = {
  legacy: "6 4",
  exclusive: "6 4",
  nested: "3 3",
  "cross-cutting": "1 4",
  overlay: "10 4 2 4",
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

function effectiveEdgeKind(edge) {
  return edge.kind ?? "directed"
}

function effectiveNodeShape(node) {
  return node.shape ?? "rect"
}

function effectiveNodeTone(node) {
  return node.tone ?? "neutral"
}

function effectiveGroupTone(group) {
  return group.tone ?? "muted"
}

function groupVisualStyle(group) {
  const tone = toneFor(effectiveGroupTone(group))
  const dashArray = GROUP_BORDER_DASHES[group.semanticType ?? "legacy"] ?? GROUP_BORDER_DASHES.legacy
  return { tone, dashArray }
}

function rectangleForGroup(group) {
  return {
    left: group.x,
    top: group.y,
    right: group.x + group.width,
    bottom: group.y + group.height,
  }
}

function rectanglesIntersect(first, second, gap = 0) {
  return first.left < second.right + gap && first.right + gap > second.left && first.top < second.bottom + gap && first.bottom + gap > second.top
}

function groupTitleBounds(group) {
  const labelWidth = Math.max(32, [...group.label].length * 8.5)
  return {
    left: group.x + 16,
    top: group.y + 8,
    right: group.x + 16 + labelWidth,
    bottom: group.y + 32,
  }
}

function isStructuredDiagram(diagram) {
  return diagram.diagramType !== undefined || diagram.designNotes !== undefined || diagram.legend !== undefined || (diagram.groups ?? []).some(group => group.semanticType !== undefined)
}

export function getDiagramMigrationWarnings(diagram) {
  if (isStructuredDiagram(diagram)) return []
  return [`${diagram.id}: MIGRATION_REQUIRED（旧 V1 资产缺少 diagramType/designNotes、图例决定或分组语义字段）`]
}

function observedVisualValues(diagram) {
  const values = new Map()
  const edges = diagram.edges ?? []
  const nodes = diagram.nodes ?? []
  const groups = diagram.groups ?? []
  if (edges.length > 0) values.set("edge-kind", [...new Set(edges.map(effectiveEdgeKind))])
  if (nodes.length > 0) values.set("node-shape", [...new Set(nodes.map(effectiveNodeShape))])
  if (nodes.length > 0 || groups.length > 0) values.set("tone", [...new Set([...nodes.map(effectiveNodeTone), ...groups.map(effectiveGroupTone)])])
  const typedGroups = groups.filter(group => group.semanticType !== undefined)
  if (typedGroups.length > 0) values.set("group-role", [...new Set(typedGroups.map(group => group.semanticType))])
  return values
}

function targetKey(target) {
  return `${target.kind}:${target.ref}`
}

function channelValue(channel, kind, object) {
  if (channel === "edge-kind" && kind === "edge") return effectiveEdgeKind(object)
  if (channel === "node-shape" && kind === "node") return effectiveNodeShape(object)
  if (channel === "tone" && kind === "node") return effectiveNodeTone(object)
  if (channel === "tone" && kind === "group") return effectiveGroupTone(object)
  if (channel === "group-role" && kind === "group") return object.semanticType
  return undefined
}

function targetsForChannel(diagram, channel) {
  if (channel === "edge-kind") return (diagram.edges ?? []).map(edge => ({ kind: "edge", ref: edge.id, object: edge }))
  if (channel === "node-shape") return (diagram.nodes ?? []).map(node => ({ kind: "node", ref: node.id, object: node }))
  if (channel === "tone") return [...(diagram.nodes ?? []).map(node => ({ kind: "node", ref: node.id, object: node })), ...(diagram.groups ?? []).map(group => ({ kind: "group", ref: group.id, object: group }))]
  if (channel === "group-role") return (diagram.groups ?? []).filter(group => group.semanticType !== undefined).map(group => ({ kind: "group", ref: group.id, object: group }))
  return []
}

function styleFingerprint(kind, object) {
  if (kind === "edge") return `edge:${effectiveEdgeKind(object)}`
  if (kind === "node") return `node:${effectiveNodeShape(object)}:${effectiveNodeTone(object)}`
  const { dashArray } = groupVisualStyle(object)
  return `group:${object.semanticType ?? "legacy"}:${effectiveGroupTone(object)}:${dashArray}`
}

function validateLegendTarget(target, maps, diagram) {
  assert(target && typeof target === "object", `图 ${diagram.id} 的图例目标无效`)
  assert(LEGEND_TARGET_KINDS.has(target.kind) && typeof target.ref === "string" && target.ref.length > 0, `图 ${diagram.id} 的图例目标必须使用 kind/ref`)
  const collection = target.kind === "node" ? maps.nodes : target.kind === "edge" ? maps.edges : maps.groups
  assert(collection.has(target.ref), `图 ${diagram.id} 的图例目标不存在：${target.kind}:${target.ref}`)
  return collection.get(target.ref)
}

function hasInlineSemanticText(kind, object) {
  if (kind === "edge") return object.label !== undefined
  return typeof object.label === "string" || Array.isArray(object.label) || kind === "group"
}

function validateGroupSemantics(diagram, maps) {
  const groups = diagram.groups ?? []
  const typed = groups.some(group => group.semanticType !== undefined)
  if (!typed) return { typed: false, specialGroups: [] }
  assert(groups.every(group => GROUP_TYPES.has(group.semanticType)), `图 ${diagram.id} 的所有新分组都必须声明有效 semanticType`)

  const depthOf = (groupId, path = []) => {
    const group = maps.groups.get(groupId)
    assert(group, `图 ${diagram.id} 的父分组不存在：${groupId}`)
    assert(!path.includes(groupId), `图 ${diagram.id} 的分组层级存在环：${[...path, groupId].join(" -> ")}`)
    return group.parent === undefined ? 1 : depthOf(group.parent, [...path, groupId]) + 1
  }

  for (const group of groups) {
    const semanticType = group.semanticType
    assert(Array.isArray(group.members), `图 ${diagram.id} 的分组 ${group.id} 缺少 members 声明`)
    const memberIds = new Set()
    for (const memberId of group.members) {
      assert(typeof memberId === "string" && maps.nodes.has(memberId), `图 ${diagram.id} 的分组 ${group.id} 引用了不存在的成员节点：${memberId}`)
      assert(!memberIds.has(memberId), `图 ${diagram.id} 的分组 ${group.id} 重复声明成员：${memberId}`)
      memberIds.add(memberId)
      const memberBounds = nodeBounds(maps.nodes.get(memberId))
      const interior = { left: group.x + 16, top: group.y + 40, right: group.x + group.width - 16, bottom: group.y + group.height - 16 }
      assert(memberBounds.left >= interior.left && memberBounds.right <= interior.right && memberBounds.top >= interior.top && memberBounds.bottom <= interior.bottom, `图 ${diagram.id} 的分组 ${group.id} 未完整包围成员节点 ${memberId} 或缺少标题间距`)
      assert(!rectanglesIntersect(memberBounds, groupTitleBounds(group)), `图 ${diagram.id} 的分组 ${group.id} 标题遮挡成员节点 ${memberId}`)
    }
    if (semanticType === "nested") {
      assert(typeof group.parent === "string" && maps.groups.has(group.parent), `图 ${diagram.id} 的 nested 分组 ${group.id} 必须引用有效 parent`)
      assert(depthOf(group.id) <= 2, `图 ${diagram.id} 的分组 ${group.id} 嵌套超过两层`)
    } else {
      assert(group.parent === undefined, `图 ${diagram.id} 的 ${semanticType} 分组 ${group.id} 不得声明 parent`)
    }
    if (semanticType === "cross-cutting" || semanticType === "overlay") {
      assert(group.members.length === 0, `图 ${diagram.id} 的 ${semanticType} 分组 ${group.id} 不得声明业务成员`)
    }
  }

  const isParentChild = (first, second) => first.parent === second.id || second.parent === first.id
  const specialGroups = groups.filter(group => group.semanticType === "cross-cutting" || group.semanticType === "overlay")
  for (let index = 0; index < groups.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < groups.length; otherIndex += 1) {
      const first = groups[index]
      const second = groups[otherIndex]
      const overlap = rectanglesIntersect(rectangleForGroup(first), rectangleForGroup(second))
      if (overlap) {
        const nestedOverlap = isParentChild(first, second) && (first.semanticType === "nested" || second.semanticType === "nested")
        const declaredAuxiliaryOverlap = first.semanticType === "overlay" || second.semanticType === "overlay" || first.semanticType === "cross-cutting" || second.semanticType === "cross-cutting"
        assert(nestedOverlap || declaredAuxiliaryOverlap, `图 ${diagram.id} 的分组 ${first.id} 与 ${second.id} 发生未声明交叠`)
      }
      const firstTitleCovered = rectanglesIntersect(groupTitleBounds(first), rectangleForGroup(second))
      const secondTitleCovered = rectanglesIntersect(groupTitleBounds(second), rectangleForGroup(first))
      assert(!firstTitleCovered || first.parent === second.id, `图 ${diagram.id} 的分组 ${first.id} 标题被 ${second.id} 的背景/边界覆盖`)
      assert(!secondTitleCovered || second.parent === first.id, `图 ${diagram.id} 的分组 ${second.id} 标题被 ${first.id} 的背景/边界覆盖`)
    }
  }

  const memberships = new Map()
  for (const group of groups.filter(item => item.semanticType === "exclusive" || item.semanticType === "nested")) {
    for (const memberId of group.members) {
      const existing = memberships.get(memberId) ?? []
      for (const otherGroup of existing) {
        assert(!(group.parent === otherGroup.id || otherGroup.parent === group.id), `图 ${diagram.id} 的嵌套父子分组重复直接声明节点成员：${memberId}`)
        throw new Error(`图 ${diagram.id} 的互斥/同层分组 ${otherGroup.id} 与 ${group.id} 共享节点成员：${memberId}`)
      }
      existing.push(group)
      memberships.set(memberId, existing)
    }
  }
  return { typed: true, specialGroups }
}

function isMixedDiagram(diagram) {
  const architectureTypes = new Set(["architecture", "context", "container", "deployment", "class", "component", "infrastructure", "er"])
  const processTypes = new Set(["flowchart", "pipeline", "sequence", "state"])
  const modes = new Set(diagram.designNotes?.semanticModes ?? [])
  const hasStaticMode = modes.has("static-boundary") || modes.has("static-relation")
  const hasProcessMode = modes.has("process-flow") || modes.has("data-flow") || modes.has("dependency-flow")
  return (architectureTypes.has(diagram.diagramType) && hasProcessMode) || (processTypes.has(diagram.diagramType) && hasStaticMode)
}

function validateEvidence(evidence, path, diagram) {
  assert(evidence && typeof evidence === "object", `图 ${diagram.id} 的 ${path} 证据无效`)
  assert(EVIDENCE_STATUSES.has(evidence.status), `图 ${diagram.id} 的 ${path} 证据状态无效`)
  assert(typeof evidence.evidence === "string" && evidence.evidence.length > 0, `图 ${diagram.id} 的 ${path} 缺少证据定位`)
  assert(evidence.status !== "FAIL", `图 ${diagram.id} 的 ${path} 已失败，不能保留当前单图决策`)
}

function validateStructuredDesign(diagram, maps, groupInfo) {
  if (!isStructuredDiagram(diagram)) return
  assert(DIAGRAM_TYPES.has(diagram.diagramType), `图 ${diagram.id} 缺少有效 diagramType`)
  const notes = diagram.designNotes
  assert(notes && typeof notes === "object", `图 ${diagram.id} 缺少 designNotes`)
  if ((diagram.groups ?? []).length > 0) assert(groupInfo.typed, `图 ${diagram.id} 的结构化分组必须全部声明 semanticType 和 members；旧分组请先迁移并标记 MIGRATION_REQUIRED`)
  assert(typeof notes.intent === "string" && notes.intent.length > 0, `图 ${diagram.id} 的 designNotes 缺少单一意图`)
  assert(Array.isArray(notes.semanticModes) && notes.semanticModes.length > 0 && notes.semanticModes.every(mode => SEMANTIC_MODES.has(mode)), `图 ${diagram.id} 的 semanticModes 无效`)
  assert(Array.isArray(notes.visualSemantics), `图 ${diagram.id} 的 visualSemantics 必须为数组`)
  const visualDeclarations = new Map()
  for (const declaration of notes.visualSemantics) {
    assert(declaration && VISUAL_CHANNELS.has(declaration.channel) && VISUAL_ROLES.has(declaration.role), `图 ${diagram.id} 的视觉语义声明无效`)
    assert(typeof declaration.reason === "string" && declaration.reason.length > 0, `图 ${diagram.id} 的视觉语义 ${declaration.channel} 缺少 reason`)
    assert(!visualDeclarations.has(declaration.channel), `图 ${diagram.id} 重复声明视觉语义通道：${declaration.channel}`)
    visualDeclarations.set(declaration.channel, declaration)
    if (declaration.channel === "icon" && declaration.role === "semantic") throw new Error(`图 ${diagram.id} 的通用 V1 尚不支持结构化 icon 语义，需 Provider profile 或改用受支持字段`)
  }

  const observed = observedVisualValues(diagram)
  const semanticChannels = []
  for (const [channel, values] of observed) {
    if (values.length <= 1) continue
    const declaration = visualDeclarations.get(channel)
    assert(declaration, `图 ${diagram.id} 的视觉通道 ${channel} 存在多个取值但未声明 semantic/decorative`)
    if (declaration.role === "semantic") semanticChannels.push(channel)
  }

  const decision = notes.legendDecision
  assert(decision && LEGEND_DECISION_STATUSES.has(decision.status), `图 ${diagram.id} 缺少有效 legendDecision`)
  assert(typeof decision.reason === "string" && decision.reason.length > 0, `图 ${diagram.id} 的 legendDecision 缺少 reason`)
  const hasLegend = diagram.legend !== undefined
  if (hasLegend) assert(decision.status === "required", `图 ${diagram.id} 有 legend 时 legendDecision 必须为 required`)
  if (semanticChannels.length > 0) assert(decision.status === "required" || decision.status === "exempt", `图 ${diagram.id} 存在语义化视觉差异却未要求图例或提供合规豁免`)
  if (decision.status === "required") assert(hasLegend, `图 ${diagram.id} 声明必须有图例但缺少 legend`)
  if (decision.status === "exempt") {
    assert(!hasLegend, `图 ${diagram.id} 的 exempt 图例决定不应同时提供 legend`)
    assert(decision.noReusedSymbol === true, `图 ${diagram.id} 的图例豁免必须声明 noReusedSymbol: true`)
    assert(Array.isArray(decision.inlineSemanticEvidence) && decision.inlineSemanticEvidence.length > 0, `图 ${diagram.id} 的图例豁免缺少逐对象文字证据`)
    const evidenceKeys = new Set(decision.inlineSemanticEvidence.map(targetKey))
    for (const channel of semanticChannels) {
      for (const target of targetsForChannel(diagram, channel)) {
        assert(evidenceKeys.has(targetKey(target)) && hasInlineSemanticText(target.kind, target.object), `图 ${diagram.id} 的图例豁免缺少 ${channel} 对象 ${targetKey(target)} 的完整紧邻文本证据`)
      }
    }
  }
  if (decision.status === "not-needed") assert(semanticChannels.length === 0 && !hasLegend, `图 ${diagram.id} 的 legendDecision 为 not-needed，但存在图例或语义化视觉差异`)

  if (hasLegend) validateLegend(diagram, maps, semanticChannels)

  if (groupInfo.specialGroups.length > 0) {
    const explainedGroupIds = new Set((notes.groupExplanations ?? []).map(item => item?.groupId))
    const legendGroupIds = new Set((diagram.legend?.items ?? []).flatMap(item => (item.targets ?? []).filter(target => target.kind === "group").map(target => target.ref)))
    for (const group of groupInfo.specialGroups) assert(explainedGroupIds.has(group.id) || legendGroupIds.has(group.id), `图 ${diagram.id} 的 ${group.semanticType} 分组 ${group.id} 缺少成员归属解释`)
  }

  const split = notes.splitDecision
  assert(split && SPLIT_STATUSES.has(split.status), `图 ${diagram.id} 缺少有效 splitDecision`)
  assert(typeof split.reason === "string" && split.reason.length > 0, `图 ${diagram.id} 的 splitDecision 缺少 reason`)
  const mixed = isMixedDiagram(diagram)
  if (mixed) assert(split.status !== "not-needed", `图 ${diagram.id} 同时声明架构/边界与过程语义，却没有拆图决策`)
  if (split.status === "split") assert(Array.isArray(split.relatedDiagramIds) && split.relatedDiagramIds.length >= 2 && split.relatedDiagramIds.every(id => typeof id === "string" && id.length > 0), `图 ${diagram.id} 的 split 决策缺少至少两张相关图 ID`)
  if (split.status === "kept-single") {
    assert(mixed, `图 ${diagram.id} 未声明混合语义，不应使用 kept-single`)
    for (const property of ["singleGoal", "staticBoundary", "processFlowDistinction"]) assert(typeof split[property] === "string" && split[property].length > 0, `图 ${diagram.id} 的 kept-single 决策缺少 ${property}`)
    assert(split.readabilityEvidence && typeof split.readabilityEvidence === "object", `图 ${diagram.id} 的 kept-single 决策缺少 readabilityEvidence`)
    for (const state of ["normal", "fit", "zoom"]) validateEvidence(split.readabilityEvidence[state], `readabilityEvidence.${state}`, diagram)
  }
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
  const edgesById = new Map()
  for (const edge of diagram.edges ?? []) {
    assert(typeof edge.id === "string" && edge.id.length > 0, `图 ${diagram.id} 存在无效连线 ID`)
    assert(!edgeIds.has(edge.id), `图 ${diagram.id} 的连线 ID 重复：${edge.id}`)
    edgeIds.add(edge.id)
    edgesById.set(edge.id, edge)
    assert(nodesById.has(edge.from) && nodesById.has(edge.to), `图 ${diagram.id} 的连线 ${edge.id} 引用了不存在的节点`)
    assert(PORTS.has(edge.fromPort ?? "right") && PORTS.has(edge.toPort ?? "left"), `图 ${diagram.id} 的连线 ${edge.id} 使用了无效端口`)
    assert(EDGE_KINDS.has(effectiveEdgeKind(edge)), `图 ${diagram.id} 的连线 ${edge.id} 使用了无效类型`)
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

  const groupIds = new Set()
  const groupsById = new Map()
  for (const group of diagram.groups ?? []) {
    assert(typeof group.id === "string" && group.id.length > 0, `图 ${diagram.id} 存在无效分组 ID`)
    assert(!groupIds.has(group.id), `图 ${diagram.id} 的分组 ID 重复：${group.id}`)
    assert(!nodeIds.has(group.id) && !edgeIds.has(group.id), `图 ${diagram.id} 的分组 ID 与节点/连线 ID 冲突：${group.id}`)
    groupIds.add(group.id)
    groupsById.set(group.id, group)
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

  const maps = { nodes: nodesById, edges: edgesById, groups: groupsById }
  const groupInfo = validateGroupSemantics(diagram, maps)
  validateStructuredDesign(diagram, maps, groupInfo)
  return getDiagramMigrationWarnings(diagram)
}

function renderMultilineText({ lines, x, y, fontSize = 16, fill = "#0f172a", anchor = "middle", weight = "500", lineHeight = 20, className = "" }) {
  const top = y - ((lines.length - 1) * lineHeight) / 2
  const tspans = lines.map((line, index) => `<tspan x="${x}" y="${top + index * lineHeight}">${escapeXml(line)}</tspan>`).join("")
  return `<text${className ? ` class="${className}"` : ""} text-anchor="${anchor}" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${tspans}</text>`
}

function wrapLegendText(value, maxChars) {
  const characters = [...value]
  const lines = []
  for (let index = 0; index < characters.length; index += maxChars) lines.push(characters.slice(index, index + maxChars).join(""))
  return lines.length > 0 ? lines : [value]
}

function createLegendLayout(diagram) {
  const availableWidth = diagram.canvas.width - LEGEND_MARGIN * 2
  const rows = [{ items: [], width: 0, height: 28 }]
  for (const item of diagram.legend.items) {
    const text = `${item.label}：${item.meaning}`
    const estimatedTextWidth = Math.max(120, Math.min(280, [...text].length * 8))
    const width = Math.min(availableWidth, 52 + estimatedTextWidth)
    const maxChars = Math.max(12, Math.floor((width - 52) / 8))
    const lines = wrapLegendText(text, maxChars)
    const height = Math.max(28, lines.length * 16 + 8)
    const row = rows.at(-1)
    if (row.items.length > 0 && row.width + 16 + width > availableWidth) rows.push({ items: [], width: 0, height: 28 })
    const targetRow = rows.at(-1)
    targetRow.items.push({ item, width, height, lines })
    targetRow.width += targetRow.items.length === 1 ? width : 16 + width
    targetRow.height = Math.max(targetRow.height, height)
  }

  const contentHeight = 24 + rows.reduce((total, row) => total + row.height, 0) + 16
  const bounds = {
    left: LEGEND_MARGIN,
    top: diagram.canvas.height - LEGEND_MARGIN - contentHeight,
    right: diagram.canvas.width - LEGEND_MARGIN,
    bottom: diagram.canvas.height - LEGEND_MARGIN,
  }
  let y = bounds.top + 24
  for (const row of rows) {
    let x = bounds.left
    for (const item of row.items) {
      item.x = x
      item.y = y
      x += item.width + 16
    }
    y += row.height
  }
  return { bounds, rows }
}

function validateLegend(diagram, maps, semanticChannels) {
  const legend = diagram.legend
  assert(legend && typeof legend === "object", `图 ${diagram.id} 的 legend 无效`)
  assert(legend.placement === undefined || legend.placement === "bottom", `图 ${diagram.id} 的通用 V1 图例 placement 只能为 bottom`)
  assert(Array.isArray(legend.items) && legend.items.length > 0, `图 ${diagram.id} 的 legend 至少需要一个 item`)
  if (legend.title !== undefined) assert(typeof legend.title === "string" && legend.title.length > 0, `图 ${diagram.id} 的 legend.title 无效`)

  const itemIds = new Set()
  const explainedTargets = new Set()
  for (const item of legend.items) {
    assert(item && typeof item === "object", `图 ${diagram.id} 的图例项无效`)
    assert(typeof item.id === "string" && item.id.length > 0 && !itemIds.has(item.id), `图 ${diagram.id} 的图例项 ID 无效或重复：${item.id}`)
    itemIds.add(item.id)
    assert(typeof item.label === "string" && item.label.length > 0, `图 ${diagram.id} 的图例项 ${item.id} 缺少 label`)
    assert(typeof item.meaning === "string" && item.meaning.length > 0, `图 ${diagram.id} 的图例项 ${item.id} 缺少 meaning`)
    assert(item.sample && typeof item.sample === "object", `图 ${diagram.id} 的图例项 ${item.id} 缺少样式样本`)
    const sampleObject = validateLegendTarget(item.sample, maps, diagram)
    assert(Array.isArray(item.targets) && item.targets.length > 0, `图 ${diagram.id} 的图例项 ${item.id} 缺少 targets`)
    const sampleKey = targetKey(item.sample)
    const targetStyles = new Set()
    for (const target of item.targets) {
      const targetObject = validateLegendTarget(target, maps, diagram)
      const key = targetKey(target)
      assert(!explainedTargets.has(key), `图 ${diagram.id} 的源对象被多个图例项重复解释：${key}`)
      explainedTargets.add(key)
      assert(styleFingerprint(target.kind, targetObject) === styleFingerprint(item.sample.kind, sampleObject), `图 ${diagram.id} 的图例项 ${item.id} 样本与目标样式不一致：${key}`)
      targetStyles.add(key)
    }
    assert(targetStyles.has(sampleKey), `图 ${diagram.id} 的图例项 ${item.id} 的 sample 必须属于 targets`)
  }

  for (const channel of semanticChannels) {
    const expectedValues = new Set((observedVisualValues(diagram).get(channel) ?? []))
    const coveredValues = new Set()
    for (const item of legend.items) {
      for (const target of item.targets) {
        const object = validateLegendTarget(target, maps, diagram)
        const value = channelValue(channel, target.kind, object)
        if (value !== undefined) coveredValues.add(value)
      }
    }
    for (const value of expectedValues) assert(coveredValues.has(value), `图 ${diagram.id} 的图例未覆盖视觉通道 ${channel} 的取值：${value}`)
  }

  const layout = createLegendLayout(diagram)
  assert(layout.bounds.left >= 0 && layout.bounds.top >= 0 && layout.bounds.right <= diagram.canvas.width && layout.bounds.bottom <= diagram.canvas.height, `图 ${diagram.id} 的图例超出 viewBox`)
  for (const node of diagram.nodes) assert(!rectanglesIntersect(layout.bounds, nodeBounds(node), LEGEND_GAP), `图 ${diagram.id} 的图例与业务节点或其间距冲突：${node.id}`)
  for (const group of diagram.groups ?? []) assert(!rectanglesIntersect(layout.bounds, rectangleForGroup(group), LEGEND_GAP), `图 ${diagram.id} 的图例落在业务分组/系统边界内或间距不足：${group.id}`)
  return layout
}

function renderGroup(group) {
  const { tone, dashArray } = groupVisualStyle(group)
  const roleAttribute = group.semanticType === undefined ? "" : ` data-group-role="${escapeXml(group.semanticType)}"`
  const memberAttribute = Array.isArray(group.members) ? ` data-group-members="${escapeXml(group.members.join(" "))}"` : ""
  return [
    `<g id="group-${escapeXml(group.id)}"${roleAttribute}${memberAttribute}>`,
    `<rect x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="12" fill="${tone.fill}" fill-opacity="0.52" stroke="${tone.stroke}" stroke-width="1.5" stroke-dasharray="${dashArray}"/>`,
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

function renderLegendShape(shape, tone, x, y, width, height) {
  const shared = `fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="1.5"`
  if (shape === "diamond") return `<polygon ${shared} points="${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}"/>`
  if (shape === "ellipse") return `<ellipse ${shared} cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}"/>`
  if (shape === "note") return `<path ${shared} d="M ${x} ${y} H ${x + width - 6} L ${x + width} ${y + 6} V ${y + height} H ${x} Z M ${x + width - 6} ${y} V ${y + 6} H ${x + width}"/>`
  if (shape === "database") return `<path ${shared} d="M ${x} ${y + 5} C ${x} ${y - 2}, ${x + width} ${y - 2}, ${x + width} ${y + 5} V ${y + height - 5} C ${x + width} ${y + height + 2}, ${x} ${y + height + 2}, ${x} ${y + height - 5} Z M ${x} ${y + 5} C ${x} ${y + 12}, ${x + width} ${y + 12}, ${x + width} ${y + 5}"/>`
  if (shape === "actor") return `<g ${shared}><circle cx="${x + width / 2}" cy="${y + 5}" r="4"/><rect x="${x + 4}" y="${y + 10}" width="${width - 8}" height="${height - 10}" rx="4"/></g>`
  const radius = shape === "round" ? 8 : 2
  return `<rect ${shared} x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/>`
}

function renderLegendSample(item, maps, x, y) {
  const sample = item.sample
  const object = validateLegendTarget(sample, maps, { id: "图例" })
  const sampleId = escapeXml(item.id)
  if (sample.kind === "edge") {
    const kind = effectiveEdgeKind(object)
    const markerStart = kind === "bidirectional" ? " marker-start=\"url(#arrow)\"" : ""
    const markerEnd = kind === "directed" || kind === "bidirectional" || kind === "dashed" ? " marker-end=\"url(#arrow)\"" : ""
    const dash = kind === "dashed" ? " stroke-dasharray=\"6 4\"" : ""
    return `<g data-legend-sample="${sampleId}"><line x1="${x}" y1="${y}" x2="${x + 36}" y2="${y}" stroke="#475569" stroke-width="2"${dash}${markerStart}${markerEnd}/></g>`
  }
  if (sample.kind === "node") return `<g data-legend-sample="${sampleId}">${renderLegendShape(effectiveNodeShape(object), toneFor(effectiveNodeTone(object)), x, y - 10, 36, 20)}</g>`
  const { tone, dashArray } = groupVisualStyle(object)
  return `<g data-legend-sample="${sampleId}"><rect x="${x}" y="${y - 10}" width="36" height="20" rx="4" fill="${tone.fill}" fill-opacity="0.52" stroke="${tone.stroke}" stroke-width="1.5" stroke-dasharray="${dashArray}"/></g>`
}

function renderLegend(diagram, maps) {
  const layout = createLegendLayout(diagram)
  const title = diagram.legend.title ?? "图例"
  const items = []
  for (const row of layout.rows) {
    for (const positioned of row.items) {
      items.push([
        `<g data-legend-item="${escapeXml(positioned.item.id)}">`,
        renderLegendSample(positioned.item, maps, positioned.x + 4, positioned.y + positioned.height / 2),
        renderMultilineText({ lines: positioned.lines, x: positioned.x + 52, y: positioned.y + positioned.height / 2 + 4, fontSize: 12, fill: "#334155", anchor: "start", weight: "500", lineHeight: 16 }),
        `</g>`,
      ].join("\n"))
    }
  }
  return [
    `<g id="legend" data-legend-placement="bottom">`,
    `<text x="${layout.bounds.left}" y="${layout.bounds.top + 16}" text-anchor="start" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="14" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>`,
    ...items,
    `</g>`,
  ].join("\n")
}

export function renderDiagram(diagram) {
  validateDiagram(diagram, "图表规格")
  const nodesById = new Map(diagram.nodes.map(node => [node.id, node]))
  const maps = {
    nodes: nodesById,
    edges: new Map((diagram.edges ?? []).map(edge => [edge.id, edge])),
    groups: new Map((diagram.groups ?? []).map(group => [group.id, group])),
  }
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
    ...(diagram.legend ? [renderLegend(diagram, maps)] : []),
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
  const migrationWarnings = []
  for (const diagram of manifest.diagrams) {
    migrationWarnings.push(...validateDiagram(diagram, resolvedInputPath))
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

  return { inputPath: resolvedInputPath, outputs, count: outputs.length, migrationWarnings }
}

function main() {
  const [, , inputPath, outputDirectory] = process.argv
  assert(inputPath && outputDirectory, "用法：node scripts/render-svg-diagrams.mjs <input.diagram.json> <output-directory>")
  const result = renderManifest(inputPath, outputDirectory)
  const status = result.migrationWarnings.length > 0 ? "完成（存在迁移提示）" : "通过"
  console.log(`SVG 场景渲染和结构验证${status}：${result.inputPath}`)
  console.log(`输出：${result.count} 个 SVG 文件`)
  if (result.migrationWarnings.length > 0) {
    console.warn(`兼容性迁移提示：${result.migrationWarnings.join("；")}`)
    process.exitCode = 2
  }
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
