# 图表验证流程优化实施计划

## 1. 目标

在不推翻现有 SVG 源、V1 `.diagram.json`、严格 `delivery-business-flow` profile 和 Chrome DevTools MCP 边界的前提下，将源码仓图表能力从“有限源级检查 + 专用流程几何检查”推进为可解释的分层验证协议：

```text
Semantic QA → Geometry QA → Render QA 状态 → Risk Assessment → Browser Routing
```

本次实施不伪造静态渲染器、Chrome 执行结果或浏览器证据。没有实际 Provider 证据时，结果保持 `UNVERIFIED`；旧资产缺少新结构化字段时保持 `MIGRATION_REQUIRED`。

## 2. 一次影响映射

| 改造项 | 事实来源 | 受影响入口/实现 | 验收项 |
|---|---|---|---|
| 通用验证结果、稳定错误码和安全阈值 | `steering/common-svg-diagram-standards.md`、`steering/common-diagram-design-standards.md` | `scripts/diagram-validation.mjs`、`scripts/validate-svg-diagrams.mjs` | Semantic/Geometry 状态可解释；旧资产不被误判为新契约通过 |
| 复用现有通用渲染和严格流程验证 | `scripts/render-svg-diagrams.mjs`、`scripts/render-delivery-business-flow-svg.mjs` | 现有脚本与新验证模块 | 不删除现有分组/图例/strict 几何检查；V1 输入仍可解析 |
| 风险评分和浏览器路由决策 | 本计划、`common-diagram-validation-standards.md` | `scripts/diagram-validation.mjs`、`skills/aidlc-diagram-design/SKILL.md` | 输出 score/level/reasons；LOW 默认不启动；显式浏览器要求优先 |
| Render QA 与 Browser Evidence 边界 | 新增 `steering/common-diagram-validation-standards.md` | `skills/aidlc-diagram-design/SKILL.md`、`steering/core-workflow.md` | `RENDER_PASS` 不冒充 `BROWSER_PASS`；未执行为 `UNVERIFIED` |
| 可回归验证 | `package.json`、现有脚本 | `scripts/diagram-validation.test.mjs`、npm script | PASS/FAIL/boundary/legacy/pipeline 路径可执行 |

## 3. 实施批次

### 批次 A：核心验证能力

1. 新增共享的 `scripts/diagram-validation.mjs`：
   - Semantic QA：ID、引用、端口、图例、分组和 V1 迁移状态；
   - Geometry QA：节点重叠、边穿节点、边交叉/重叠、标签覆盖、分组包围、端点和画布边界；
   - 集中定义 `MIN_NODE_GAP`、`MIN_EDGE_GAP`、`MIN_LABEL_GAP`、`MIN_GROUP_PADDING`、`MIN_PARALLEL_EDGE_GAP`；
   - Risk Assessment：score、level、reasons；
   - Browser Routing：只输出决策，不调用 Chrome；
   - Render/Browser 状态明确区分 `PASS`、`FAIL`、`UNVERIFIED`、`MIGRATION_REQUIRED`、`NEEDS_CAPABILITY`。
2. 将通用验证接入已有 `validate-svg-diagrams.mjs`；保留 `render-delivery-business-flow-svg.mjs` 的严格 profile 校验，不复制其流程专用规则。
3. 为 SVG 元素补充可追溯的数据属性，但不改变现有业务字段含义。

### 批次 B：规范、入口和回归验证

1. 新增 `steering/common-diagram-validation-standards.md`，只定义验证层、风险路由、证据和状态，不复制 Blueprinter 设计规则或 SVG 字段契约。
2. 更新 `skills/aidlc-diagram-design/SKILL.md` 和 `steering/core-workflow.md`：明确 Diagram Capability 负责分层验证，Chrome 只负责浏览器现实证据。
3. 增加 Node 内置测试和 `npm run test:diagrams`；覆盖通用 PASS/FAIL/boundary、strict 兼容、旧资产迁移、风险和路由。

## 4. 明确不在本批次实现的内容

- 不新增 Mermaid 或 ASCII 正式图表路径；
- 不移除或替换 Chrome DevTools MCP；
- 不实现新的自动布局器或 LLM 几何修复循环；
- 不把源码 SVG 生成误称为 Render QA；
- 不安装未评估的大型静态渲染依赖；本批次 Render QA 只提供状态协议和源包络检查边界；
- 不实现仓内 Chrome 调度器或虚构批量浏览器证据；
- 不迁移全部历史资产；旧资产继续返回 `MIGRATION_REQUIRED`。

## 5. 完成标准

- 通用验证器能返回结构化 stage/status/issues/risk/browser 决策；
- 通用几何检查覆盖节点、边、标签、分组、端口和画布的可执行子集；
- strict profile 仍由原验证器负责，且不被新通用检查替代；
- LOW 风险且未明确要求浏览器时不产生 Chrome 执行决策；
- 显式浏览器要求或目标环境为 browser 时返回 `required=true`；能力不可用时返回 `NEEDS_CAPABILITY`；
- 旧 V1 资产可解析且标记 `MIGRATION_REQUIRED`；
- 测试和 `npm run validate:svg-diagrams` 有实际命令证据；
- 所有修改完成后只进行一次全量静态验收和一次语义复审。

## 6. 实施记录

- 已完成核心批次：`scripts/diagram-validation.mjs` 提供结构化 Semantic/Geometry QA、稳定错误码、集中阈值、Risk Assessment、Browser Routing 和 Render/Browser 状态协议。
- 已接入 `scripts/validate-svg-diagrams.mjs`，支持 `--json` 输出；strict profile 仍由原验证器执行。
- 已完成入口同步：新增 `common-diagram-validation-standards.md`，并更新 `core-workflow.md`、`common-diagram-design-standards.md`、`common-svg-diagram-standards.md`、`common-quality-gates.md`、`skills/aidlc-diagram-design/SKILL.md` 及三平台说明。
- 已增加 `scripts/diagram-validation.test.mjs` 与 `npm run test:diagrams`；旧资产继续返回 `MIGRATION_REQUIRED`，未引入 Mermaid/ASCII、静态渲染依赖或 Chrome 执行伪证据。

## 7. 本次主轴/层级/注释契约增量记录

### 7.1 增量影响映射

| 改造项 | 事实来源 | 受影响入口/实现 | 验收项 |
|---|---|---|---|
| TD/LR 主阅读方向、正交主轴、同层关系、对称实体、分支目标端口和内容顺序 | `steering/common-diagram-design-standards.md`、`steering/common-svg-diagram-standards.md`、`steering/common-diagram-validation-standards.md` | `scripts/render-svg-diagrams.mjs`、`scripts/diagram-validation.mjs` | `LAYOUT_DIRECTION_INVALID`、`LAYOUT_LEVEL_MISMATCH`、`LAYOUT_SYMMETRY_MISMATCH`、`BRANCH_PORT_MISMATCH`、`BRANCH_PATH_DIRECTION`、`CONTENT_ORDER_INVALID` |
| 结构化注释稳定 ID 与源 SVG 追溯 | `steering/common-svg-diagram-standards.md`、`common-diagram-validation-standards.md` | `scripts/render-svg-diagrams.mjs`、`scripts/diagram-validation.mjs`、`scripts/validate-svg-diagrams.mjs` | JSON/SVG 注释 ID 集合一一对应；旧资产缺 ID 返回 `MIGRATION_REQUIRED` |
| 图例/注释画布扩展和绘制顺序 | `steering/common-svg-diagram-standards.md`、`common-diagram-design-standards.md` | `scripts/render-svg-diagrams.mjs` | 业务主体 → 图例 → 注释；图例不被注释覆盖；允许增加高度，不以压缩层级取消滚动 |
| `diagram-002`/`diagram-003` 正式回归契约 | `steering/common-diagram-design-standards.md`、用户验收约束 | `scripts/diagram-validation.test.mjs` | 仅使用结构化代表性夹具验证 LR/TD 方向、层级、主轴、端口、正交路径和注释映射；仓内没有对应业务资产，不声称真实业务图通过 |

### 7.2 增量实施结果

- `.diagram.json` 的 `version: 1` 保持不变；布局语义通过共享的 `designNotes.layout` 扩展，未引入 Provider 私有坐标字段。
- `diagram-003` 的两条反向分支使用外侧正交绕行，避免路径交叉和小于安全阈值的平行间距，同时保留目标 `top` 端口和 `y=700` 业务层级。
- `scripts/diagram-validation.test.mjs` 新增 `diagram-002` LR 与 `diagram-003` TD 代表性回归，以及非对称、错层、错端口、注释 ID 和内容顺序的失败回归；不创建、不读取、不修改其他项目业务图文件。
- 当前已执行的回归命令为 `npm run test:diagrams`，18 项全部通过。真实字体测量、Render Provider、静态栅格 Provider、Browser/Chrome 三视图、实际 viewport 裁切和水平溢出仍按既定边界记录为 `UNVERIFIED`。

### 7.3 语义复审后的定向修复

- 将批量入口根状态改为按 `delivery.status` 汇总，保留 `SOURCE_READY`、`UNVERIFIED`、`NEEDS_CAPABILITY`、`MIGRATION_REQUIRED` 和 `FAIL`，不再把未执行 Render/Browser 的源级结果汇总为 `PASS`；JSON 迁移/未验证状态返回非零状态码。
- 缺少 `designNotes` 或 `designNotes.layout` 时，Semantic 迁移标记会传播到 Geometry，几何证据标记为 `MIGRATION_REQUIRED` 并跳过，不再出现语义迁移但几何 PASS。
- 新增共享 `scripts/diagram-text-geometry.mjs`，渲染器和验证器使用同一多行文本边界；图例按注释完整边界避让，注释超出 `viewBox` 时明确失败，不通过压缩字体或层级静默掩盖。
- Render Provider 的 `PASS` 必须包含已执行标记、Provider、输入、渲染表面尺寸、内容/画布 bbox、未裁切状态和可复查证据；缺失时为 `RENDER_EVIDENCE_INVALID`/`FAIL`。
- `branchRules.levelId` 必须引用已声明层级，且 `edgeIds` 与 `targetNodeIds` 的实际集合必须一致；diagram-002 回归补充履约/虚拟交付分支的错端口和错层失败检查。
- 注释 ID 映射在读取 SVG `data-note` 时执行 XML 实体还原，并新增特殊字符 ID 与多行大行高注释回归。
- 复审修复后的定向证据：`npm run test:diagrams` 为 21/21 通过；脚本语法检查、`git diff --check` 通过；`node scripts/validate-svg-diagrams.mjs --json` 汇总为 `MIGRATION_REQUIRED`，40 个报告中 `failedReports=0`，39 项迁移提示。真实字体、静态栅格 Provider、Browser/Chrome 三视图、实际 viewport 裁切和水平溢出仍为 `UNVERIFIED`。
