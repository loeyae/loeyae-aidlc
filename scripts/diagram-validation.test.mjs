import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  VALIDATION_STATUS,
  calculateDiagramRisk,
  createRenderQaReport,
  routeBrowserVerification,
  validateDiagramPipeline,
  validateGeometryDiagram,
  validateSemanticDiagram,
  validateSvgTraceability,
  hasMigrationRequired,
} from "./diagram-validation.mjs"
import { renderDiagram } from "./render-svg-diagrams.mjs"
import { renderDeliveryBusinessFlowSvg } from "./render-delivery-business-flow-svg.mjs"

function baseDiagram(overrides = {}) {
  return {
    id: "sample-diagram",
    output: "sample.svg",
    title: "Sample",
    description: "Sample diagram",
    diagramType: "architecture",
    designNotes: {
      intent: "展示两个组件之间的静态关系",
      semanticModes: ["static-relation"],
      visualSemantics: [],
      legendDecision: { status: "not-needed", reason: "只有一种视觉编码" },
      splitDecision: { status: "not-needed", reason: "单一静态关系目标" },
      layout: {
        direction: "LR",
        mainAxis: { coordinate: "y", value: 130, tolerance: 2 },
      },
    },
    canvas: { width: 600, height: 240 },
    nodes: [
      { id: "node-a", shape: "rect", label: "A", x: 100, y: 100, width: 100, height: 60 },
      { id: "node-b", shape: "rect", label: "B", x: 400, y: 100, width: 100, height: 60 },
    ],
    edges: [
      {
        id: "edge-a-b",
        from: "node-a",
        fromPort: "right",
        to: "node-b",
        toPort: "left",
        kind: "directed",
        points: [[200, 130], [400, 130]],
      },
    ],
    groups: [],
    annotations: [],
    ...overrides,
  }
}

function codes(report) {
  return new Set(report.issues.map(issue => issue.code))
}

test("valid structured diagram passes Semantic and Geometry QA", () => {
  const diagram = baseDiagram()
  const semantic = validateSemanticDiagram(diagram)
  const geometry = validateGeometryDiagram(diagram, { semanticReport: semantic })
  assert.equal(semantic.status, VALIDATION_STATUS.PASS)
  assert.equal(geometry.status, VALIDATION_STATUS.PASS)
})

test("node overlap is reported deterministically", () => {
  const diagram = baseDiagram({
    nodes: [
      { id: "node-a", shape: "rect", label: "A", x: 100, y: 100, width: 100, height: 60 },
      { id: "node-b", shape: "rect", label: "B", x: 150, y: 100, width: 100, height: 60 },
    ],
  })
  const geometry = validateGeometryDiagram(diagram)
  assert.equal(geometry.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(geometry).has("NODE_OVERLAP"))
})

test("edge crossing and edge-node collision are detected", () => {
  const crossing = baseDiagram({
    canvas: { width: 600, height: 320 },
    nodes: [
      { id: "node-a", shape: "rect", label: "A", x: 80, y: 80, width: 80, height: 60 },
      { id: "node-b", shape: "rect", label: "B", x: 440, y: 80, width: 80, height: 60 },
      { id: "node-c", shape: "rect", label: "C", x: 80, y: 200, width: 80, height: 60 },
      { id: "node-d", shape: "rect", label: "D", x: 440, y: 200, width: 80, height: 60 },
    ],
    edges: [
      { id: "edge-a-d", from: "node-a", fromPort: "right", to: "node-d", toPort: "left", kind: "directed", points: [[160, 110], [440, 230]] },
      { id: "edge-c-b", from: "node-c", fromPort: "right", to: "node-b", toPort: "left", kind: "directed", points: [[160, 230], [440, 110]] },
    ],
  })
  const crossingReport = validateGeometryDiagram(crossing)
  assert.equal(crossingReport.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(crossingReport).has("EDGE_CROSSING"))

  const throughNode = baseDiagram({
    nodes: [
      ...baseDiagram().nodes,
      { id: "node-c", shape: "rect", label: "C", x: 280, y: 100, width: 80, height: 60 },
    ],
  })
  const collisionReport = validateGeometryDiagram(throughNode)
  assert.ok(codes(collisionReport).has("EDGE_NODE_COLLISION"))
})

test("structured diagrams require explicit V1 fields", () => {
  const incomplete = baseDiagram({
    nodes: [
      { id: "node-a", label: "A", x: 100, y: 100, width: 100, height: 60 },
      { id: "node-b", shape: "rect", label: "B", x: 400, y: 100, width: 100, height: 60 },
    ],
    edges: [{ id: "edge-a-b", from: "node-a", to: "node-b", points: [[200, 130], [400, 130]] }],
  })
  const report = validateSemanticDiagram(incomplete)
  assert.equal(report.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(report).has("INVALID_FIELD"))
  assert.ok(codes(report).has("INVALID_PORT"))
  assert.ok(codes(report).has("INVALID_EDGE_KIND"))
})

test("non-rectangular geometry does not use an outer-rectangle false positive", () => {
  const ellipseObstruction = baseDiagram({
    nodes: [
      { id: "node-a", shape: "rect", label: "A", x: 100, y: 100, width: 100, height: 60 },
      { id: "node-b", shape: "rect", label: "B", x: 400, y: 40, width: 100, height: 60 },
      { id: "ellipse", shape: "ellipse", label: "E", x: 280, y: 100, width: 80, height: 80 },
    ],
    canvas: { width: 600, height: 240 },
    edges: [{ id: "edge-a-b", from: "node-a", fromPort: "right", to: "node-b", toPort: "left", kind: "directed", points: [[200, 130], [400, 70]] }],
  })
  const ellipseReport = validateGeometryDiagram(ellipseObstruction)
  assert.equal(ellipseReport.status, VALIDATION_STATUS.PASS)
  assert.ok(!codes(ellipseReport).has("EDGE_NODE_COLLISION"))

  const databaseReport = validateGeometryDiagram({
    ...ellipseObstruction,
    nodes: [...ellipseObstruction.nodes.slice(0, 2), { id: "database", shape: "database", label: "DB", x: 280, y: 100, width: 80, height: 80 }],
  })
  assert.equal(databaseReport.status, VALIDATION_STATUS.UNVERIFIED)
  assert.ok(codes(databaseReport).has("UNSUPPORTED_SHAPE_GEOMETRY"))
})

test("sequence geometry requires and consumes participant lifelines", () => {
  const sequence = baseDiagram({
    id: "sequence-diagram",
    output: "sequence.svg",
    diagramType: "sequence",
    canvas: { width: 600, height: 260 },
    nodes: [
      { id: "client", shape: "rect", label: "Client", x: 100, y: 40, width: 100, height: 60 },
      { id: "service", shape: "rect", label: "Service", x: 400, y: 40, width: 100, height: 60 },
    ],
    edges: [{ id: "request", from: "client", fromPort: "right", to: "service", toPort: "left", kind: "directed", points: [[150, 180], [450, 180]] }],
    lifelines: [{ participant: "client", x: 150 }, { participant: "service", x: 450 }],
  })
  const semantic = validateSemanticDiagram(sequence)
  const geometry = validateGeometryDiagram(sequence, { semanticReport: semantic })
  assert.equal(semantic.status, VALIDATION_STATUS.PASS)
  assert.equal(geometry.status, VALIDATION_STATUS.PASS)

  const missing = validateSemanticDiagram({ ...sequence, lifelines: undefined })
  assert.equal(missing.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(missing).has("SEQUENCE_LIFELINE_MISSING"))
})

test("shared endpoint is rejected unless convergence is declared, while labels remain checked", () => {
  const shared = baseDiagram({
    canvas: { width: 600, height: 320 },
    nodes: [
      { id: "node-a", shape: "rect", label: "A", x: 100, y: 100, width: 100, height: 60 },
      { id: "node-b", shape: "rect", label: "B", x: 400, y: 80, width: 100, height: 60 },
      { id: "node-c", shape: "rect", label: "C", x: 400, y: 220, width: 100, height: 60 },
    ],
    edges: [
      { id: "edge-a-b", from: "node-a", fromPort: "right", to: "node-b", toPort: "left", kind: "directed", points: [[200, 130], [400, 110]] },
      { id: "edge-a-c", from: "node-a", fromPort: "right", to: "node-c", toPort: "left", kind: "directed", points: [[200, 130], [400, 250]] },
    ],
  })
  const undeclaredReport = validateGeometryDiagram(shared)
  assert.equal(undeclaredReport.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(undeclaredReport).has("EDGE_CROSSING"))

  const declared = baseDiagram({
    ...shared,
    designNotes: {
      ...shared.designNotes,
      sharedConvergences: [{ nodeId: "node-a", port: "right", direction: "outgoing", edgeIds: ["edge-a-b", "edge-a-c"] }],
    },
  })
  const declaredReport = validateGeometryDiagram(declared)
  assert.equal(declaredReport.status, VALIDATION_STATUS.PASS)

  const labelled = baseDiagram({
    edges: [{ ...baseDiagram().edges[0], label: { text: "关系", x: 300, y: 130 } }],
  })
  const labelReport = validateGeometryDiagram(labelled)
  assert.ok(codes(labelReport).has("LABEL_COLLISION"))
})

test("missing layout migration blocks geometry evidence", () => {
  const incomplete = baseDiagram()
  delete incomplete.designNotes.layout
  const semantic = validateSemanticDiagram(incomplete)
  const geometry = validateGeometryDiagram(incomplete, { semanticReport: semantic })
  assert.equal(semantic.status, VALIDATION_STATUS.MIGRATION_REQUIRED)
  assert.equal(geometry.status, VALIDATION_STATUS.MIGRATION_REQUIRED)
  assert.equal(geometry.skipped, true)
})

test("Render PASS requires executable provider evidence", () => {
  const invalid = createRenderQaReport({ providerResult: { status: VALIDATION_STATUS.PASS } })
  assert.equal(invalid.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(invalid).has("RENDER_EVIDENCE_INVALID"))

  const valid = createRenderQaReport({
    providerResult: {
      status: VALIDATION_STATUS.PASS,
      provider: "static-renderer",
      executed: true,
      input: "sample.svg",
      surface: { width: 800, height: 600 },
      geometry: {
        contentBBox: { left: 24, top: 24, right: 700, bottom: 500 },
        canvasBBox: { left: 0, top: 0, right: 800, bottom: 600 },
        clipped: false,
      },
      evidence: "rendered surface bbox and clipping check",
    },
  })
  assert.equal(valid.status, VALIDATION_STATUS.PASS)
})

test("pipeline propagates structured migration status", () => {
  const incomplete = baseDiagram({
    edges: [{ ...baseDiagram().edges[0], points: undefined }],
  })
  const result = validateDiagramPipeline(incomplete, { targetOperations: ["source-only"] })
  assert.equal(result.semantic.status, VALIDATION_STATUS.MIGRATION_REQUIRED)
  assert.equal(result.geometry.status, VALIDATION_STATUS.MIGRATION_REQUIRED)
  assert.equal(result.delivery.status, VALIDATION_STATUS.MIGRATION_REQUIRED)
  assert.equal(hasMigrationRequired(result), true)
})
test("group containment, port offset and canvas checks are explicit", () => {
  const grouped = baseDiagram({
    groups: [{ id: "group-a", label: "Group", semanticType: "exclusive", members: ["node-a", "node-b"], x: 60, y: 60, width: 500, height: 150 }],
  })
  const groupReport = validateGeometryDiagram(grouped)
  assert.equal(groupReport.status, VALIDATION_STATUS.PASS)

  const outside = baseDiagram({
    groups: [{ id: "group-a", label: "Group", semanticType: "exclusive", members: ["node-a", "node-b"], x: 200, y: 60, width: 360, height: 150 }],
  })
  const outsideReport = validateGeometryDiagram(outside)
  assert.ok(codes(outsideReport).has("GROUP_CONTAINMENT"))

  const offset = baseDiagram({
    edges: [{ ...baseDiagram().edges[0], fromPortOffset: 20, toPortOffset: 20, points: [[200, 150], [400, 110]] }],
  })
  const offsetReport = validateGeometryDiagram(offset)
  assert.equal(offsetReport.status, VALIDATION_STATUS.PASS)

  const tooEmpty = baseDiagram({ canvas: { width: 600, height: 600 } })
  const emptyReport = validateGeometryDiagram(tooEmpty)
  assert.ok(codes(emptyReport).has("CANVAS_TOO_EMPTY"))
})

test("invalid legend and legacy assets have explainable statuses", () => {
  const invalidLegend = baseDiagram({
    legend: {
      placement: "bottom",
      items: [{ id: "legend-a", label: "A", meaning: "A", sample: { kind: "node", ref: "missing" }, targets: [{ kind: "node", ref: "missing" }] }],
    },
  })
  const semantic = validateSemanticDiagram(invalidLegend)
  assert.equal(semantic.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(semantic).has("INVALID_REFERENCE"))

  const legacy = {
    id: "legacy",
    output: "legacy.svg",
    title: "Legacy",
    description: "Legacy diagram",
    canvas: { width: 200, height: 120 },
    nodes: [{ id: "a", shape: "rect", label: "A", x: 40, y: 40, width: 80, height: 40 }],
    edges: [],
  }
  const legacyReport = validateSemanticDiagram(legacy)
  assert.equal(legacyReport.status, VALIDATION_STATUS.MIGRATION_REQUIRED)
})

test("risk assessment and browser routing remain separate from quality gates", () => {
  const lowRisk = calculateDiagramRisk(baseDiagram())
  assert.equal(lowRisk.level, "LOW")

  const highRisk = calculateDiagramRisk({
    diagramType: "sequence",
    nodes: Array.from({ length: 21 }, (_, index) => ({ id: `node-${index}`, label: "node", fontSize: index % 2 ? 14 : 16 })),
    edges: Array.from({ length: 31 }, (_, index) => ({ id: `edge-${index}`, points: [[0, 0], [10, 0], [10, 10], [20, 10]] })),
    groups: [{ id: "outer", parent: "inner" }, { id: "inner", parent: "outer" }],
  }, { historyVisualFailure: true, targetReadingEnvironment: "browser", userRequestedBrowserVerification: true, svg: "<svg transform=\"scale(1)\"><foreignObject/><path marker-end=\"x\"/></svg>" })
  assert.equal(highRisk.level, "HIGH")
  assert.ok(highRisk.reasons.length > 0)

  const lowRoute = routeBrowserVerification({ targetOperations: ["source-only"], risk: lowRisk, semanticStatus: "PASS", geometryStatus: "PASS" })
  assert.equal(lowRoute.required, false)
  assert.equal(lowRoute.shouldExecute, false)
  assert.equal(lowRoute.status, VALIDATION_STATUS.UNVERIFIED)

  const explicitRoute = routeBrowserVerification({ userRequestedBrowserVerification: true, risk: lowRisk, semanticStatus: "PASS", geometryStatus: "PASS", chromeAvailable: false })
  assert.equal(explicitRoute.required, true)
  assert.equal(explicitRoute.shouldExecute, true)
  assert.equal(explicitRoute.status, VALIDATION_STATUS.NEEDS_CAPABILITY)

  const migrationRoute = routeBrowserVerification({ userRequestedBrowserVerification: true, risk: lowRisk, semanticStatus: "MIGRATION_REQUIRED", geometryStatus: "MIGRATION_REQUIRED", chromeAvailable: false })
  assert.equal(migrationRoute.shouldExecute, false)
  assert.equal(migrationRoute.status, VALIDATION_STATUS.UNVERIFIED)
})

test("pipeline keeps Render and Browser unverified without providers", () => {
  const result = validateDiagramPipeline(baseDiagram(), { targetOperations: ["source-only"] })
  assert.equal(result.semantic.status, VALIDATION_STATUS.PASS)
  assert.equal(result.geometry.status, VALIDATION_STATUS.PASS)
  assert.equal(result.render.status, VALIDATION_STATUS.UNVERIFIED)
  assert.equal(result.browser.executed, false)
  assert.equal(result.delivery.status, VALIDATION_STATUS.SOURCE_READY)
})

test("strict delivery-business-flow fixture remains source-compatible", () => {
  const inputPath = "docs/assets/delivery-business-flow-test-10-nodes-3-branches.diagram.json"
  const outputPath = "docs/assets/delivery-business-flow-test-10-nodes-3-branches.svg"
  const spec = JSON.parse(readFileSync(inputPath, "utf8"))
  assert.equal(renderDeliveryBusinessFlowSvg(spec), readFileSync(outputPath, "utf8"))
})

function diagram003Fixture() {
  return {
    id: "diagram-003-regression",
    output: "diagram-003-regression.svg",
    title: "diagram-003 纵向布局回归夹具",
    description: "验证纵向主轴、分支同层、目标顶边和图例注释顺序。",
    diagramType: "flowchart",
    designNotes: {
      intent: "验证门店规则进入云 Mall 后的纵向分支布局",
      semanticModes: ["process-flow"],
      visualSemantics: [{ channel: "node-shape", role: "semantic", reason: "用矩形、圆角和菱形区分实体、流程节点和判断" }],
      legendDecision: { status: "required", reason: "保留结构化流程连接图例" },
      splitDecision: { status: "not-needed", reason: "回归夹具只验证单一纵向布局契约" },
      layout: {
        direction: "TD",
        mainAxis: { coordinate: "x", value: 580, tolerance: 2, symmetricNodePairs: [["oms", "dmall"]] },
        levels: [
          { id: "sources", coordinate: 115, nodeIds: ["oms", "dmall"] },
          { id: "cloud", coordinate: 255, nodeIds: ["cloud-mall"] },
          { id: "decision", coordinate: 550, nodeIds: ["enable-check"] },
          { id: "branch-results", coordinate: 700, nodeIds: ["active", "pending"] },
        ],
        branchRules: [{
          decisionNodeId: "enable-check",
          edgeIds: ["check-active", "check-pending"],
          targetNodeIds: ["active", "pending"],
          levelId: "branch-results",
          targetPort: "top",
        }],
        contentOrder: ["business", "legend", "annotations"],
      },
    },
    canvas: { width: 1160, height: 1200 },
    nodes: [
      { id: "oms", shape: "rect", label: "OMS 门店基础数据", x: 220, y: 80, width: 180, height: 70 },
      { id: "dmall", shape: "rect", label: "E-Fulfilment（Dmall）", x: 760, y: 80, width: 180, height: 70 },
      { id: "cloud-mall", shape: "round", label: "云 Mall 接收与建档", x: 470, y: 220, width: 220, height: 70 },
      { id: "enable-check", shape: "diamond", label: "启用条件判断", x: 500, y: 500, width: 160, height: 100 },
      { id: "active", shape: "round", label: "ACTIVE", x: 260, y: 670, width: 180, height: 60 },
      { id: "pending", shape: "round", label: "PENDING", x: 720, y: 670, width: 180, height: 60 },
    ],
    edges: [
      { id: "oms-cloud", from: "oms", fromPort: "right", to: "cloud-mall", toPort: "top", kind: "directed", points: [[400, 115], [400, 220], [580, 220]] },
      { id: "dmall-cloud", from: "dmall", fromPort: "left", to: "cloud-mall", toPort: "right", kind: "directed", points: [[760, 115], [760, 255], [690, 255]] },
      { id: "cloud-check", from: "cloud-mall", fromPort: "bottom", to: "enable-check", toPort: "top", kind: "directed", points: [[580, 290], [580, 500]] },
      { id: "check-active", from: "enable-check", fromPort: "right", to: "active", toPort: "top", kind: "directed", points: [[660, 550], [740, 550], [740, 600], [350, 600], [350, 670]], label: { text: "通过", x: 690, y: 530 } },
      { id: "check-pending", from: "enable-check", fromPort: "left", to: "pending", toPort: "top", kind: "directed", points: [[500, 550], [180, 550], [180, 40], [960, 40], [960, 180], [810, 180], [810, 670]], label: { text: "未通过", x: 470, y: 530 } },
    ],
    groups: [],
    annotations: [
      { id: "diagram-003-note-legend", text: "图例下方保留注释区", x: 580, y: 1110 },
      { id: "diagram-003-note-scroll", text: ["允许扩展画布高度", "不得压缩业务层级"], x: 580, y: 1140 },
    ],
    legend: {
      placement: "bottom",
      title: "图例",
      items: [{
        id: "diagram-003-directed-edge",
        label: "流程连接",
        meaning: "按主阅读方向传递业务流程",
        sample: { kind: "edge", ref: "cloud-check" },
        targets: [
          { kind: "edge", ref: "oms-cloud" },
          { kind: "edge", ref: "dmall-cloud" },
          { kind: "edge", ref: "cloud-check" },
          { kind: "edge", ref: "check-active" },
          { kind: "edge", ref: "check-pending" },
        ],
      }, {
        id: "diagram-003-rect-node",
        label: "流程/实体节点",
        meaning: "矩形节点表达普通流程或外部实体",
        sample: { kind: "node", ref: "oms" },
        targets: [{ kind: "node", ref: "oms" }, { kind: "node", ref: "dmall" }],
      }, {
        id: "diagram-003-round-node",
        label: "状态节点",
        meaning: "圆角节点表达阶段或状态结果",
        sample: { kind: "node", ref: "cloud-mall" },
        targets: [{ kind: "node", ref: "cloud-mall" }, { kind: "node", ref: "active" }, { kind: "node", ref: "pending" }],
      }, {
        id: "diagram-003-diamond-node",
        label: "判断节点",
        meaning: "菱形节点表达启用条件判断",
        sample: { kind: "node", ref: "enable-check" },
        targets: [{ kind: "node", ref: "enable-check" }],
      }],
    },
  }
}

function diagram002Fixture() {
  return {
    id: "diagram-002-regression",
    output: "diagram-002-regression.svg",
    title: "diagram-002 横向布局回归夹具",
    description: "验证横向业务阶段、分支同层、目标左边和注释顺序。",
    diagramType: "flowchart",
    designNotes: {
      intent: "验证定店到履约后处理的横向业务阶段布局",
      semanticModes: ["process-flow"],
      visualSemantics: [{ channel: "node-shape", role: "semantic", reason: "用矩形、圆角和菱形区分步骤、终态和商品类型判断" }],
      legendDecision: { status: "required", reason: "保留结构化流程连接图例" },
      splitDecision: { status: "not-needed", reason: "回归夹具只验证单一横向布局契约" },
      layout: {
        direction: "LR",
        mainAxis: { coordinate: "y", value: 310, tolerance: 2 },
        levels: [
          { id: "start", coordinate: 135, nodeIds: ["settle-store"] },
          { id: "browse", coordinate: 335, nodeIds: ["browse-products"] },
          { id: "detail", coordinate: 535, nodeIds: ["view-detail"] },
          { id: "type-check", coordinate: 740, nodeIds: ["product-type-check"] },
          { id: "purchase-branch", coordinate: 965, nodeIds: ["physical-cart", "virtual-buy"] },
          { id: "fulfilment-branch", coordinate: 1195, nodeIds: ["physical-fulfilment", "virtual-delivery"] },
          { id: "post-process", coordinate: 1475, nodeIds: ["order-post-process"] },
        ],
        branchRules: [{
          decisionNodeId: "product-type-check",
          edgeIds: ["type-physical", "type-virtual"],
          targetNodeIds: ["physical-cart", "virtual-buy"],
          levelId: "purchase-branch",
          targetPort: "left",
        }, {
          decisionNodeId: "physical-cart",
          edgeIds: ["physical-cart-fulfilment"],
          targetNodeIds: ["physical-fulfilment"],
          levelId: "fulfilment-branch",
          targetPort: "left",
        }, {
          decisionNodeId: "virtual-buy",
          edgeIds: ["virtual-buy-delivery"],
          targetNodeIds: ["virtual-delivery"],
          levelId: "fulfilment-branch",
          targetPort: "left",
        }],
        contentOrder: ["business", "legend", "annotations"],
      },
    },
    canvas: { width: 1650, height: 840 },
    nodes: [
      { id: "settle-store", shape: "round", label: "完成定店", x: 60, y: 280, width: 150, height: 60 },
      { id: "browse-products", shape: "rect", label: "商品浏览", x: 260, y: 280, width: 150, height: 60 },
      { id: "view-detail", shape: "rect", label: "查看商品详情", x: 460, y: 280, width: 150, height: 60 },
      { id: "product-type-check", shape: "diamond", label: "商品类型判断", x: 660, y: 270, width: 160, height: 80 },
      { id: "physical-cart", shape: "rect", label: "实物商品加入购物车", x: 875, y: 200, width: 180, height: 60 },
      { id: "virtual-buy", shape: "rect", label: "虚拟商品直接购买", x: 875, y: 400, width: 180, height: 60 },
      { id: "physical-fulfilment", shape: "rect", label: "实物履约", x: 1105, y: 200, width: 180, height: 60 },
      { id: "virtual-delivery", shape: "rect", label: "虚拟商品独立交付", x: 1105, y: 400, width: 180, height: 60 },
      { id: "order-post-process", shape: "round", label: "订单后处理 / 售后（汇合）", x: 1400, y: 280, width: 150, height: 60 },
    ],
    edges: [
      { id: "settle-browse", from: "settle-store", fromPort: "right", to: "browse-products", toPort: "left", kind: "directed", points: [[210, 310], [260, 310]] },
      { id: "browse-detail", from: "browse-products", fromPort: "right", to: "view-detail", toPort: "left", kind: "directed", points: [[410, 310], [460, 310]] },
      { id: "detail-type", from: "view-detail", fromPort: "right", to: "product-type-check", toPort: "left", kind: "directed", points: [[610, 310], [660, 310]] },
      { id: "type-physical", from: "product-type-check", fromPort: "top", to: "physical-cart", toPort: "left", kind: "directed", points: [[740, 270], [740, 230], [875, 230]], label: { text: "实物商品", x: 820, y: 250 } },
      { id: "type-virtual", from: "product-type-check", fromPort: "bottom", to: "virtual-buy", toPort: "left", kind: "directed", points: [[740, 350], [740, 430], [875, 430]], label: { text: "虚拟商品", x: 820, y: 390 } },
      { id: "physical-cart-fulfilment", from: "physical-cart", fromPort: "right", to: "physical-fulfilment", toPort: "left", kind: "directed", points: [[1055, 230], [1105, 230]] },
      { id: "virtual-buy-delivery", from: "virtual-buy", fromPort: "right", to: "virtual-delivery", toPort: "left", kind: "directed", points: [[1055, 430], [1105, 430]] },
      { id: "physical-post", from: "physical-fulfilment", fromPort: "right", to: "order-post-process", toPort: "top", kind: "directed", points: [[1285, 230], [1475, 230], [1475, 280]] },
      { id: "virtual-post", from: "virtual-delivery", fromPort: "right", to: "order-post-process", toPort: "bottom", kind: "directed", points: [[1285, 430], [1475, 430], [1475, 340]] },
    ],
    groups: [],
    annotations: [
      { id: "diagram-002-note-legend", text: "图例和注释均属于画布内容", x: 825, y: 730 },
      { id: "diagram-002-note-scroll", text: ["必要时增加画布高度", "不压缩横向业务层级"], x: 825, y: 760 },
    ],
    legend: {
      placement: "bottom",
      title: "图例",
      items: [{
        id: "diagram-002-directed-edge",
        label: "流程连接",
        meaning: "按从左到右的阶段方向传递业务流程",
        sample: { kind: "edge", ref: "detail-type" },
        targets: [
          { kind: "edge", ref: "settle-browse" },
          { kind: "edge", ref: "browse-detail" },
          { kind: "edge", ref: "detail-type" },
          { kind: "edge", ref: "type-physical" },
          { kind: "edge", ref: "type-virtual" },
          { kind: "edge", ref: "physical-cart-fulfilment" },
          { kind: "edge", ref: "virtual-buy-delivery" },
          { kind: "edge", ref: "physical-post" },
          { kind: "edge", ref: "virtual-post" },
        ],
      }, {
        id: "diagram-002-round-node",
        label: "起止/汇合节点",
        meaning: "圆角节点表达流程起点或分支汇合后的处理",
        sample: { kind: "node", ref: "settle-store" },
        targets: [{ kind: "node", ref: "settle-store" }, { kind: "node", ref: "order-post-process" }],
      }, {
        id: "diagram-002-rect-node",
        label: "步骤节点",
        meaning: "矩形节点表达商品浏览、购买和交付步骤",
        sample: { kind: "node", ref: "browse-products" },
        targets: [{ kind: "node", ref: "browse-products" }, { kind: "node", ref: "view-detail" }, { kind: "node", ref: "physical-cart" }, { kind: "node", ref: "virtual-buy" }, { kind: "node", ref: "physical-fulfilment" }, { kind: "node", ref: "virtual-delivery" }],
      }, {
        id: "diagram-002-diamond-node",
        label: "判断节点",
        meaning: "菱形节点表达商品类型判断",
        sample: { kind: "node", ref: "product-type-check" },
        targets: [{ kind: "node", ref: "product-type-check" }],
      }],
    },
  }
}

test("diagram-003 TD fixture passes main axis, levels, branch ports and note mapping", () => {
  const diagram = diagram003Fixture()
  const svg = renderDiagram(diagram)
  const result = validateDiagramPipeline(diagram, { targetOperations: ["source-only"], svg })
  assert.equal(result.semantic.status, VALIDATION_STATUS.PASS, JSON.stringify(result.semantic.issues))
  assert.equal(result.geometry.status, VALIDATION_STATUS.PASS, JSON.stringify(result.geometry.issues))
  assert.equal(result.svg.status, VALIDATION_STATUS.PASS, JSON.stringify(result.svg.issues))
  assert.deepEqual(result.svg.actualIds, ["diagram-003-note-legend", "diagram-003-note-scroll"])
  assert.ok(svg.indexOf('id="nodes"') < svg.indexOf('id="legend"'))
  assert.ok(svg.indexOf('id="legend"') < svg.indexOf('id="annotations"'))
})

test("diagram-002 LR fixture passes same-layer branches and left target ports", () => {
  const diagram = diagram002Fixture()
  const svg = renderDiagram(diagram)
  const result = validateDiagramPipeline(diagram, { targetOperations: ["source-only"], svg })
  assert.equal(result.semantic.status, VALIDATION_STATUS.PASS, JSON.stringify(result.semantic.issues))
  assert.equal(result.geometry.status, VALIDATION_STATUS.PASS, JSON.stringify(result.geometry.issues))
  assert.equal(result.svg.status, VALIDATION_STATUS.PASS, JSON.stringify(result.svg.issues))
})

test("layout QA rejects asymmetric, uneven and wrong-port regression variants", () => {
  const asymmetric = structuredClone(diagram003Fixture())
  asymmetric.nodes.find(node => node.id === "oms").x = 240
  const asymmetricReport = validateGeometryDiagram(asymmetric)
  assert.ok(codes(asymmetricReport).has("LAYOUT_SYMMETRY_MISMATCH"))

  const uneven = structuredClone(diagram003Fixture())
  uneven.nodes.find(node => node.id === "pending").y = 710
  const unevenReport = validateGeometryDiagram(uneven)
  assert.ok(codes(unevenReport).has("LAYOUT_LEVEL_MISMATCH"))

  const wrongTdPort = structuredClone(diagram003Fixture())
  wrongTdPort.edges.find(edge => edge.id === "check-active").toPort = "right"
  const wrongTdPortReport = validateGeometryDiagram(wrongTdPort)
  assert.ok(codes(wrongTdPortReport).has("BRANCH_PORT_MISMATCH"))

  const wrongLrLevel = structuredClone(diagram002Fixture())
  wrongLrLevel.nodes.find(node => node.id === "virtual-buy").x = 900
  const wrongLrLevelReport = validateGeometryDiagram(wrongLrLevel)
  assert.ok(codes(wrongLrLevelReport).has("LAYOUT_LEVEL_MISMATCH"))

  const wrongLrPort = structuredClone(diagram002Fixture())
  wrongLrPort.edges.find(edge => edge.id === "type-virtual").toPort = "right"
  const wrongLrPortReport = validateGeometryDiagram(wrongLrPort)
  assert.ok(codes(wrongLrPortReport).has("BRANCH_PORT_MISMATCH"))

  const wrongLrFulfilmentPort = structuredClone(diagram002Fixture())
  wrongLrFulfilmentPort.edges.find(edge => edge.id === "physical-cart-fulfilment").toPort = "right"
  const wrongLrFulfilmentPortReport = validateGeometryDiagram(wrongLrFulfilmentPort)
  assert.ok(codes(wrongLrFulfilmentPortReport).has("BRANCH_PORT_MISMATCH"))

  const wrongLrFulfilmentLevel = structuredClone(diagram002Fixture())
  wrongLrFulfilmentLevel.nodes.find(node => node.id === "virtual-delivery").x = 1120
  const wrongLrFulfilmentLevelReport = validateGeometryDiagram(wrongLrFulfilmentLevel)
  assert.ok(codes(wrongLrFulfilmentLevelReport).has("LAYOUT_LEVEL_MISMATCH"))

  const unknownLevel = structuredClone(diagram002Fixture())
  unknownLevel.designNotes.layout.branchRules[0].levelId = "missing-level"
  const unknownLevelReport = validateSemanticDiagram(unknownLevel)
  assert.equal(unknownLevelReport.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(unknownLevelReport).has("INVALID_REFERENCE"))
})

test("structured annotations require stable IDs and exact SVG mapping", () => {
  const missingId = diagram003Fixture()
  delete missingId.annotations[0].id
  const missingIdReport = validateSemanticDiagram(missingId)
  assert.equal(missingIdReport.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(missingIdReport).has("ANNOTATION_ID_MISMATCH"))

  const diagram = diagram003Fixture()
  const tamperedSvg = renderDiagram(diagram).replace('data-note="diagram-003-note-legend"', 'data-note="missing-note"')
  const mapping = validateSvgTraceability(diagram, tamperedSvg)
  assert.equal(mapping.status, VALIDATION_STATUS.FAIL)
  assert.ok(codes(mapping).has("ANNOTATION_ID_MISMATCH"))

  const escaped = diagram003Fixture()
  escaped.annotations[0].id = "note&1"
  const escapedMapping = validateSvgTraceability(escaped, renderDiagram(escaped))
  assert.equal(escapedMapping.status, VALIDATION_STATUS.PASS)
  assert.deepEqual(escapedMapping.actualIds, ["note&1", "diagram-003-note-scroll"])
})

test("multi-line annotation bounds reserve the full legend gap", () => {
  const diagram = diagram003Fixture()
  diagram.annotations[0].text = ["第一行", "第二行", "第三行"]
  diagram.annotations[0].lineHeight = 50
  const report = validateGeometryDiagram(diagram)
  assert.equal(report.status, VALIDATION_STATUS.PASS, JSON.stringify(report.issues))
  const actualAnnotationTop = 1110 - ((3 - 1) * 50) / 2 - 13
  assert.ok(report.legendBBox.bottom <= actualAnnotationTop - 24)
  assert.equal(validateSvgTraceability(diagram, renderDiagram(diagram)).status, VALIDATION_STATUS.PASS)
})

test("content order fails when annotations force the legend into the business body", () => {
  const diagram = diagram003Fixture()
  diagram.annotations[0].y = 500
  const report = validateGeometryDiagram(diagram)
  assert.ok(codes(report).has("CONTENT_ORDER_INVALID"))
})
