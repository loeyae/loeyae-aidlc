# 图表验证标准

## 目的与边界

本文件定义图表生成后的验证分层、状态、风险路由和证据边界。它不重新定义 Blueprinter 图型设计规则，也不重新定义 SVG / `.diagram.json` 字段契约：

- 图表表达、图型、粒度、拆图和视觉语义：`common-diagram-design-standards.md`；
- SVG、V1 清单、端口和源—SVG映射：`common-svg-diagram-standards.md`；
- 本文件：如何用确定性检查和目标 Provider 证据证明结果。

源码实现基线为 `scripts/diagram-validation.mjs`。源码仓批量入口为 `scripts/validate-svg-diagrams.mjs`；`delivery-business-flow-strict` 继续由 `scripts/render-delivery-business-flow-svg.mjs` 执行其 profile 专用几何验证。

本文件描述的是验证协议，不代表某个平台已经具备 Chrome、静态栅格渲染器或 Provider 调度能力。能力声明必须以实际运行结果为准。

## 验证顺序

```text
Diagram IR / SVG source
        ↓
Semantic QA
        ↓
Geometry QA
        ↓
Render QA
        ↓
Risk Assessment
        ↓
Browser Routing
        ↓
Browser Evidence（仅实际执行时）
        ↓
Final Delivery Status
```

前一层失败时，不得用后一层证据掩盖源问题。Geometry QA 通过不代表 Render QA 通过；Render QA 通过不代表 Browser QA 通过。

## 状态定义

每一层必须独立记录 `status` 和 `issues`：

- `PASS`：该层的确定性检查或目标 Provider 检查有实际证据通过；
- `FAIL`：发现具体问题，必须修复后重跑受影响检查；
- `UNVERIFIED`：未执行、工具不可用或该层无法由当前工具证明；
- `MIGRATION_REQUIRED`：旧 V1 资产可解析，但缺少新契约要求的结构化字段或完整几何证据；不等同于 PASS；
- `NEEDS_CAPABILITY`：用户或目标环境要求 Provider 操作，但没有可验证 Provider；不等同于源不存在；
- `SOURCE_READY`：源和结构化验证结果已生成，目标环境验证仍可能为 `UNVERIFIED`。

`delivery.status` 的优先级为：

```text
FAIL → MIGRATION_REQUIRED → NEEDS_CAPABILITY → UNVERIFIED → SOURCE_READY/PASS
```

只有所有被要求的目标操作均有证据时，交付才可为 `PASS`。源文件存在或源码渲染器成功，不能单独产生 `PASS`。

## Semantic QA

Semantic QA 是纯结构化检查，不启动 Chrome。至少覆盖：

- 图表 ID、输出名、标题、描述、画布和节点数组；
- 节点 ID、形状、标签、坐标、尺寸和画布边界；
- 连线 ID、`from` / `to`、端口、类型、路径点和标签；
- 分组 ID、`semanticType`、直接成员、父级和引用；
- 图例项 ID、样本、目标和对象追溯；
- `diagramType`、`designNotes`、拆图、视觉语义和 `designNotes.layout` 字段；
- 布局方向与主轴声明、TD/LR 层级坐标、分支规则的节点/边引用和默认目标端口；
- 注释稳定 ID 的唯一性，以及同一图内跨节点、连线、分组和注释的稳定 ID 唯一性。

缺少旧资产的新结构化字段时返回 `MIGRATION_REQUIRED`；字段存在但值非法时返回 `FAIL`。不得把自然语言观察作为结构验证证据。

## Geometry QA

Geometry QA 只使用源坐标、路径点和结构化文本估算，不声称完成真实浏览器字体测量。当前通用验证器的可执行检查包括：

- 节点—节点重叠：`NODE_OVERLAP`；
- 节点安全间距：`INSUFFICIENT_GAP`；
- 连线—无关节点穿越：`EDGE_NODE_COLLISION`；
- 连线—连线交叉或重叠：`EDGE_CROSSING`；
- 标签—节点、标签或连线冲突：`LABEL_COLLISION`；
- 分组成员、嵌套父级和最小内边距：`GROUP_CONTAINMENT`；
- 端口、端点和端口偏移一致性：`PORT_MISMATCH`、`EDGE_ENDPOINT_MISMATCH`；
- 内容、路径点和标签超出画布：`CANVAS_CLIPPING`；
- 内容相对画布过小：`CANVAS_TOO_EMPTY`；
- 已声明形状的实际边界无法由当前算法精确证明：`UNSUPPORTED_SHAPE_GEOMETRY`，几何状态只能为 `UNVERIFIED`；
- Sequence 参与者缺少结构化生命线映射：`SEQUENCE_LIFELINE_MISSING`；
- 平行连线、节点和标签的安全间距：`INSUFFICIENT_GAP`；
- 主阅读方向、主轴对称性、TD/LR 层级和分支目标端口：`LAYOUT_DIRECTION_INVALID`、`LAYOUT_LEVEL_MISMATCH`、`LAYOUT_SYMMETRY_MISMATCH`、`BRANCH_PORT_MISMATCH`、`BRANCH_PATH_DIRECTION`；
- 业务主体—图例—注释顺序、注释集合和画布内容边界：`CONTENT_ORDER_INVALID`、`ANNOTATION_ID_MISMATCH`、`CANVAS_CLIPPING`。

通用检查无法可靠判断真实字体 bbox、所有复杂 SVG path 的精确边界或浏览器 marker 最终可见性时，必须保留 `UNVERIFIED`，不能使用矩形近似冒充完整视觉通过。

### 集中阈值

阈值只在 `scripts/diagram-validation.mjs` 的 `DEFAULT_GEOMETRY_THRESHOLDS` 集中定义，并允许验证调用方显式覆盖：

| 常量 | 默认值 | 用途 |
|---|---:|---|
| `MIN_NODE_GAP` | 24 | 节点之间的最低安全间距 |
| `MIN_EDGE_GAP` | 12 | 连线与可读区域的最低间距基线 |
| `MIN_LABEL_GAP` | 8 | 标签与其他对象的最低间距 |
| `MIN_GROUP_PADDING` | 16 | 分组内容和边界的最低内边距 |
| `MIN_PARALLEL_EDGE_GAP` | 24 | 同侧平行连线的最低间距 |
| `CANVAS_MARGIN` | 24 | 内容到画布边缘的最低内边距 |
| `POINT_TOLERANCE` | 1 | 端点比较允许的源坐标误差 |

这些阈值落实并引用 `common-diagram-design-standards.md` 与 `common-svg-diagram-standards.md` 的既有留白和端点规则，不在 Provider 中静默改写。

### 主轴、层级、分支和内容顺序的静态 QA

当结构化源提供 `designNotes.layout` 时，验证器执行以下确定性规则：

1. `TD` 使用节点中心 `y` 判断层级，`LR` 使用节点中心 `x` 判断层级；`levels` 中的节点必须落在声明坐标的容差内，同一分支规则的目标节点必须属于同一层。
2. `mainAxis` 的坐标必须与方向正交；声明的 `symmetricNodePairs` 必须到主轴等距。没有对称声明时，不凭空要求所有首层节点对称。
3. 分支规则的目标端口按方向默认检查为 TD=`top`、LR=`left`；只有记录了受支持的 `exception` 类型及原因时才允许偏离。目标前最后一段必须沿主阅读方向进入目标；这不等于要求所有回边、异常边都顺着主干。
4. 图例和注释不参与业务层级计算。若存在二者，结构化源默认/声明的顺序为业务主体 → 图例 → 注释；验证器检查估算的内容边界、图例与主体间距、注释与图例间距和 `viewBox` 裁切。扩展画布或纵向滚动是合法结果，不以“无滚动条”作为通过条件。
5. 结构化源有稳定注释 ID 且提供 SVG 时，验证器检查每个 ID 恰好有一个 `data-note`，并检查 JSON/SVG 集合相等；旧资产缺 ID 只返回迁移状态，缺少 SVG 或真实渲染表面时不声称视觉通过。

这些检查证明的是源坐标、结构化声明和 SVG 追溯关系；真实字体、浏览器 viewport、normal/fit/zoom 的可读性、实际水平溢出和裁切视觉证据仍由 Provider/Chrome 提供并保持 `UNVERIFIED`。

### Strict profile 边界

`delivery-business-flow-strict` 的正交路径、判断节点端口、线段交叉、节点穿越和标签覆盖仍由其专用验证器负责。通用 Geometry QA 不替代该 profile，也不把 strict 专用字段当作通用 V1 字段。

## Render QA

Render QA 验证 SVG 是否在静态渲染表面上呈现正确。它与源码检查、Chrome 检查分开记录：

- `render:svg-diagrams` 的职责是根据结构化源生成 SVG，不等于 Render QA；
- SVG 根元素、静态安全、`viewBox`、`title`、`desc` 等源包络检查可以记录为源检查证据；
- 没有实际静态渲染器返回 PNG/渲染表面 bbox 时，`render.status` 必须为 `UNVERIFIED`；Provider 返回 `PASS` 时至少必须同时提供已执行标记、Provider、输入源、渲染表面尺寸、content/canvas bbox、`clipped: false` 和可复查 evidence（或截图），否则结果为 `FAIL`；
- 不得以 SVG 文件存在、源脚本成功或静态结构检查通过冒充 `RENDER_PASS`。

当未来接入静态 Renderer 时，结果至少要记录 Provider、输入源、渲染表面尺寸、content bbox、裁切状态和异常；该 Provider 不得改变业务语义。

## Risk Assessment

Risk Assessment 是路由依据，不是质量门禁。风险高不代表图失败，风险低也不代表浏览器一定通过。当前初始规则在 `calculateDiagramRisk` 中集中实现：

| 因素 | 分值 |
|---|---:|
| 节点数 > 20 | +1 |
| 连线数 > 30 | +1 |
| 多拐点或非正交路径 | +2 |
| 多条连线共用同一节点同侧端口 | +2 |
| Sequence | +1 |
| 较复杂 Flowchart/Pipeline | +2 |
| 多层分组 | +2 |
| 复杂图例 | +1 |
| 多字体尺寸/字体族 | +2 |
| 多行或复杂文本 | +2 |
| `foreignObject` | +3 |
| `transform` | +1 |
| `marker` | +1 |
| 历史视觉失败 | +3 |
| 目标环境为 browser | +3 |
| 用户明确要求浏览器验证 | +3 |

风险等级为：

```text
0–2   LOW
3–5   MEDIUM
6+    HIGH
```

每个分值必须伴随稳定的 `code`、分值和可解释原因。风险结果不得覆盖 Semantic、Geometry 或 Render 的失败/迁移状态。

## Browser Routing

路由器只生成决策，不调用 Chrome：

1. 用户明确要求浏览器验证，或目标阅读环境为 browser：`required=true`；
2. `source-only`：默认不启动浏览器；
3. HIGH 风险且不是 source-only：进入浏览器路由；
4. MEDIUM 风险且目标操作包含 `preview`、`render` 或 `export`：进入浏览器路由；
5. LOW 风险默认不启动浏览器；
6. Semantic 或 Geometry 不是 `PASS` 时不得执行浏览器，先修复或迁移源；
7. 路由决定不是执行证据。Chrome 未实际执行时保持 `executed=false` 和 `status=UNVERIFIED`；要求能力但不可用时为 `NEEDS_CAPABILITY`。

浏览器结果必须保留三种阅读状态：`normal`、`fit`、`zoom`。每个状态都应包含状态、目标 viewport/缩放、几何观察和截图或可复查证据。

## Browser Evidence

实际 Provider 返回的结果应尽量符合现有 Diagram Result 语义，不创建与 Provider Request 平行的第二套协议：

```json
{
  "status": "PASS",
  "provider": "chrome-devtools",
  "viewport": { "width": 1440, "height": 900 },
  "readingStates": {
    "normal": { "status": "PASS", "evidence": "..." },
    "fit": { "status": "PASS", "evidence": "..." },
    "zoom": { "status": "PASS", "evidence": "..." }
  },
  "geometry": {
    "contentBBox": {},
    "canvasBBox": {},
    "clipped": false
  },
  "screenshots": []
}
```

当前仓库只有 Chrome MCP 配置，没有仓内 Provider 调度、批量会话或证据采集实现。因此不能声称 Browser PASS，也不能把路由结果当作浏览器结果。

## 自动修复边界

- Geometry 问题：优先由确定性布局/路由/间距算法修复；当前仓库尚未提供通用自动修复器，验证器只能报告问题；
- Semantic 问题：是否拆图、合并节点、改变图型或修正业务关系，返回 Diagram Capability 重新设计；
- 不让 LLM 反复猜测可由坐标和路径算法确定的几何问题；
- 不手工改最终 SVG 掩盖源或验证器问题。

## 结构化验证结果

通用结果由 `validateDiagramPipeline` 组织：

```text
{
  semantic: { status, issues },
  geometry: { status, issues, contentBBox, canvasBBox },
  render: { status, issues, provider },
  risk: { level, score, reasons },
  browser: { required, shouldExecute, executed, status, provider, reasons },
  delivery: { status }
}
```

错误代码必须稳定。至少包括：`NODE_OVERLAP`、`EDGE_NODE_COLLISION`、`EDGE_CROSSING`、`LABEL_COLLISION`、`GROUP_CONTAINMENT`、`PORT_MISMATCH`、`EDGE_ENDPOINT_MISMATCH`、`CANVAS_CLIPPING`、`CANVAS_TOO_EMPTY`、`INSUFFICIENT_GAP`、`UNSUPPORTED_SHAPE_GEOMETRY`、`SEQUENCE_LIFELINE_MISSING`、`DUPLICATE_ID`、`INVALID_REFERENCE`、`LEGEND_INVALID` 和 `MIGRATION_REQUIRED`。
