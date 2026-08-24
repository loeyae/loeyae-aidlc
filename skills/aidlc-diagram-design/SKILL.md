---
name: aidlc-diagram-design
description: "独立图表设计能力：依据 Blueprinter SVG 设计规则，根据已确认语义交付可审阅的 SVG 源、可选语义伴随清单和 Provider Request；外部 Provider 负责预览、渲染、导出和目标环境视觉检查。支持架构、流程、时序、状态、ER、部署、类、Pipeline、组件和基础设施图；以语义准确、可读布局和可缩放源为目标。触发词：画图、架构图、流程图、时序图、状态图、ER 图、部署图、diagram、architecture diagram、flowchart、sequence diagram、svg。"
---

# 图表设计能力

Independent Capability — not an AIDLC phase.

## 输入

调用方提供以下信息（独立调用时由用户直接提供）：

- **source/context**：用户描述、代码路径、文档路径或已有设计产物；
- **diagram intent**：图帮助读者理解什么；
- **diagram_type**（可选）：偏好图型，默认 `auto`；
- **output_format**（可选）：`svg`，默认且唯一的新图表格式；
- **output_location**：目标 Markdown 路径；要求保存时，SVG 源和可选语义伴随清单优先写入其同级 `assets/`；静态 SVG、PNG 或 PDF 只有在外部 Provider 实际生成后才作为目标交付物记录；
- **target_operations**（可选）：用户或目标产物实际要求的 `source-only`、`preview`、`render` 或 `export`；未要求时不主动调用 Provider；
- **approved facts**：已确认的角色、步骤、系统、关系和业务规则；
- **constraints**（可选）：`delivery-business-flow` 用于面向 PRD、业务方或客户交付的流程图；
- **target_reading_environment**（可选）：目标浏览器、容器尺寸或交付环境；未提供时记录实际可验证环境，不得假设 Preview 可用。

缺少可靠设计图表所需的信息时返回 `NEEDS_CONTEXT`，列出缺失信息并要求补充。不得推断流程状态或自行创造业务事实。

## 加载

1. `steering/common-diagram-design-standards.md`；
2. `steering/common-svg-diagram-standards.md`；
3. `steering/common-diagram-validation-standards.md`；
4. `constraints` 包含 `delivery-business-flow`，或 intent 明确面向 PRD、业务方、客户交付的业务流程时，自动应用交付型流程约束。

历史 Mermaid 或二维文本图只在迁移时按需读取对应遗留说明；它们不能作为新输出格式。

## 执行

1. 明确图的单一目的，区分系统结构与处理流程，并仅提取已批准的最小节点、关系、边界、状态和标签；
2. 选择 SVG 场景语义，按节点/边密度、同方向层级、长文本、回边和画布比例作出拆分决策；Architecture/Context 与 Flowchart/Pipeline 同时出现时默认拆图；需要保留单图时，必须记录单一理解目标、静态/过程语义区分和常规/适合窗口/放大三种阅读证据；需要拆图时按语义边界连接“上一图继续/下一图继续”，不得截断决策链；
3. 按 Blueprinter 设计规则生成可审阅的 SVG 源：保持稳定的视觉层级、文字可读性、图标语义、留白和连线避让；出现两种或以上语义化连线、箭头、颜色、节点形状、边界或图标时生成结构化图例，只有 Design Notes 记录紧邻文字完整表达且无符号复用时才豁免；可选生成 `.diagram.json` 结构化语义/布局伴随清单，记录稳定 ID、节点/边/端口、方向、连通性、图例映射、分组类型/成员/层级和图型决策；它不是三平台默认运行时输入，但源码仓维护脚本可以消费它；
4. 根据同一份文本测量、换行、行高和内边距计算节点、菱形、标签背景、分组和源画布；不得通过缩小字体、整体缩放或手改源 SVG 解决空间问题；最终目标环境的文字测量和坐标调整由 Provider 负责；
5. 生成 Provider Request，至少记录 SVG 源路径、可选清单路径、目标操作、目标阅读环境、需要的 Provider 能力和验收矩阵；Provider 必须声明是否支持本地 `.diagram.json` 的图例、分组语义和 Design Notes 字段；不支持时返回 `NEEDS_CAPABILITY`，不得静默忽略关键语义；AIDLC 不调用、安装或默认绑定本地渲染器、Kiro Preview、Claude runtime、OpenCode runtime、draw.io 或浏览器；
6. 对源和可选清单执行 `scripts/diagram-validation.mjs` 定义的 Semantic QA、Geometry QA、Render 状态和 Risk Assessment；旧 V1 资产保留 `MIGRATION_REQUIRED`，语义或几何失败必须先修复，不能交给 Chrome 掩盖；
7. 根据 Risk Assessment、`target_operations`、`target_reading_environment` 和用户明确要求计算 Browser Routing；LOW 风险默认不启动 Chrome，显式浏览器要求或 browser 目标环境优先，具体状态和路由规则加载 `common-diagram-validation-standards.md`；
8. 对照 `approved facts`、正文和节点/连线映射检查语义一致性，重点检查方向、端口、分支标签、状态转换、系统边界、单一起始节点、流程单向连接和重复文本；
9. 若目标操作交给已验证的外部 Provider，则只记录其实际返回的结构、几何、渲染和三种阅读状态证据；路由决定不等于 Provider 执行，未执行目标环境必须标记 `UNVERIFIED`；
10. 对 `delivery-business-flow` 继续调用其已声明的 strict profile 验证器，额外检查菱形共享入顶点、相邻分支顶点、正交路径、外侧回边、零交叉/覆盖、单一入口/出口、泳道全局可读性和流程单向连接；双向箭头只用于明确的数据互通关系图；
11. 仅在所有被要求的目标验收项均为 PASS 后描述目标 SVG 为已通过；否则保留源并返回 `SOURCE_READY`、`UNVERIFIED`、`MIGRATION_REQUIRED` 或 `NEEDS_CAPABILITY`，不得伪造目标结果。

Kiro Power 不携带本仓 `scripts/`，因而没有已验证 SVG Provider 时，能力可以生成并交付 SVG 源、可选语义伴随清单和 Provider Request，但不得声称目标预览、渲染或导出成功。只有用户明确要求目标操作且没有可验证 Provider 时才返回 `NEEDS_CAPABILITY`；未经用户同意不得降级到文字/表格，且不得伪造 SVG 结果、安装未确认工具或回退到 Mermaid/ASCII 图。

## 输出

返回以下结构：

- **Diagram Type**：选择的 SVG 场景语义及理由；
- **Purpose**：图的单一目的；
- **Diagram Artifact**：SVG 源路径；可选 `.diagram.json` 语义伴随清单路径；Provider Request；只有 Provider 实际返回时才记录静态 SVG、PNG、PDF 或预览路径；
- **Design Notes**：单一意图与读者目标、`diagramType`、语义模式、图例触发/豁免及对象证据、分组类型/成员/父子层级/交叠说明、拆图或保留单图理由、语义衔接、画布、回边、泳道、主流程方向和 Blueprinter 视觉决策；结构化字段定义见 `steering/common-svg-diagram-standards.md`，不在能力入口复制字段规则；
- **Constraints Applied**：实际应用的约束；
- **Validation Matrix**：按 `common-diagram-validation-standards.md` 返回 `semantic`、`geometry`、`render`、`risk`、`browser` 和 `delivery`；每层记录 `status`、稳定错误码、证据或具体问题。目标 Provider 未执行时保留 `UNVERIFIED`，strict profile 记录其专用验证器证据；
- **Delivery Status**：`SOURCE_READY`、`PASS`、`FAIL`、`UNVERIFIED`、`MIGRATION_REQUIRED`、`NEEDS_CAPABILITY` 或 `DEGRADED_TO_TEXT_TABLE`。`SOURCE_READY` 表示源和验证结果已生成，不表示目标环境已渲染；`NEEDS_CAPABILITY` 只表示被要求的目标 Provider 能力不可验证；
- **Assumptions**：如有假设，明确列出。

`PASS` 不自动表示最终阅读环境已验证；只有 `Validation Matrix` 中所有适用项均为 PASS 时，才可描述为完整通过。

## 不负责

不得更新 state.md 或 audit.md、等待或代替用户审批、执行 AIDLC 阶段路由、发起变更请求、修改业务代码、提交 Git，或宣布任何 AIDLC 阶段完成。
