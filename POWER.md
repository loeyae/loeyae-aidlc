---
name: "loeyae-aidlc"
displayName: "Loeyae AI-DLC"
version: "1.37.5"
description: "基于 AI-DLC 方法论的完整开发流程闭环。当用户消息中出现 AI-DLC 或 aidlc 时必须激活。覆盖 Inception 规划、Construction 实现与验证，以及按条件执行的 Operations 部署准备；不覆盖部署后的生产运维。"
keywords: ["aidlc", "AI-DLC", "继续上次的工作", "认领单元", "团队协作模式", "loeyae", "功能设计", "用户故事", "架构设计", "单元生成", "代码审查", "逆向工程", "根因分析", "修改功能", "变更需求", "调整功能", "改动需求", "需求变更", "diagram", "图表设计", "架构图", "流程图", "时序图", "svg"]
author: "Loeyae Team"
---

# Loeyae AI-DLC（Kiro Power 入口）

**关键首步**：激活后必须先读取 `steering/core-workflow.md`，再执行其他操作。阶段路由、执行条件、审批级别和完成标准均以该文件为准，本入口不重复共享流程细节。

## Kiro 接入

1. 在 Kiro Powers 面板中通过本地目录或 Git 仓库添加本 Power。
2. Power 激活后，Kiro 按需读取 `steering/` 并注册 `mcp.json` 声明的服务。
3. 在聊天中输入 `使用 AI-DLC，展示欢迎消息` 验证接入。

Power 安装产物只包含 `POWER.md`、`mcp.json` 和 `steering/`，不包含 `skills/` 和 `agents/`。因此在 Kiro Power 形态下：

- 流程规则完整可用，`steering/core-workflow.md` 是唯一入口，所有必需规则均可从它到达；
- `skills/` 中的薄入口不会被自动发现，steering 中出现的能力 Skill 调用按“平台无 Skill 发现能力”降级，直接加载对应 steering 执行；
- `agents/` 需按 `README.md` 手动使用，不由 Power 自动装载。

本仓库同时支持 Claude Code 和 OpenCode；各平台入口与安装总览见 `README.md`。OpenCode 的真实入口是 `package.json` 及其 `main` 指向的 `.opencode/plugins/loeyae-aidlc.js`。

## Kiro 能力适配

- **工作流加载**：首先加载 `steering/core-workflow.md`，随后按其中路由按需读取规则，禁止预加载全部 steering。
- **会话延续**：工作流状态记录在业务项目的 `docs/aidlc/state.md`。
- **图表设计**：正式图表按 `steering/common-diagram-design-standards.md` 的 Blueprinter SVG 设计规则生成可审阅的 SVG 源，可选生成 `common-svg-diagram-standards.md` 定义的 `.diagram.json` 结构化清单和 Provider Request；分层验证、风险路由和证据状态按 `steering/common-diagram-validation-standards.md` 记录。Power 不负责 SVG 生成、重排或通用导出。预置的 `chrome-devtools` MCP 仅作为浏览器验收 Provider，负责加载已生成的独立 SVG 或目标预览 URL，采集 DOM/属性、几何、viewport 截图和控制台等浏览器证据；它不生成 SVG 或 `.diagram.json`，也不替代源静态检查。独立 SVG 可直接尝试使用 `file://` URL，不要求业务项目先提供预览服务；本地文件访问失败时必须记录为 `NEEDS_CAPABILITY`。Power 可以引用安装包中已有的静态 SVG，但引用不等于目标环境渲染已验证。
- **子 Agent**：读取 `agents/` 中的平台无关指令，通过 Kiro `invoke_sub_agent` 能力执行；不可用时按共享规则降级。
- **MCP**：`mcp.json` 声明 `loeyae-skills`、`awesome-design`、`figma`、`ssot` 和 `chrome-devtools` 服务。声明仅代表已配置；运行时可用性必须通过实际工具结果验证。Figma 是否已认证、可读取、可写入必须分别通过 `whoami`、`get_metadata`、`create_new_file` + `use_figma` 运行时验证。

Power 安装产物不含 `scripts/`；`mcp.json` 声明的 `chrome-devtools` 是浏览器验收 Provider，不是 SVG 生成、布局或通用导出 Provider。因此，安装后可直接尝试加载独立 SVG 进行浏览器验收，但仍需运行时验证 MCP 服务、Chrome、目标文件和工具结果，不能据此宣称目标环境预览、渲染或导出已通过。需要目标 `preview` 或浏览器侧 `render` 验收时，优先调用 `chrome-devtools`；`export` 或 Provider 生成静态 SVG 仍必须使用具备对应能力的 Provider。源码仓可选回归命令可以执行源级 Semantic/Geometry 检查并计算风险，但不能替代浏览器 Provider，也不能据此避免 `NEEDS_CAPABILITY`。无可用 Provider 时仍可交付 SVG 源和语义检查，并将目标几何/视觉标为 `UNVERIFIED`；只有用户明确要求目标操作而能力不可验证时才返回 `NEEDS_CAPABILITY`，或经用户同意降级为文字/表格。`.drawio → SVG` 和 Kiro Markdown SVG Preview 均未验证。

## MCP 使用边界

- `loeyae-skills`：仅在 Java + Loeyae Boot Framework 项目的 Construction 阶段按需加载框架编码规范；优先使用 outline 和 section 类工具。
- `awesome-design`：仅在 I9 选择 HTML Mock 模式且用户选择设计风格时使用。
- `figma`：Figma 官方 Remote MCP。首次调用触发浏览器 OAuth 授权（不支持 PAT）。仅在 I9 选择 Figma 模式（写入设计，规则见 `inception-ui-figma.md`）或 Construction 阶段还原 Figma 设计稿（读取设计，规则见 `common-figma-design-standards.md`）时使用。写入类工具处于 Beta 且受 seat 类型限速，`whoami` 显示 seat 不满足时应回退 HTML Mock 模式。
- `ssot`：SSOT 文档管理服务，仅用于只读检索项目文档作为上下文参考；AI-DLC 禁止调用写入/修改/归档类工具；需设置 `SSOT_API_KEY` 环境变量。
- `chrome-devtools`：仅用于 Diagram Provider Request 明确要求的 `preview` 或浏览器侧 `render` 验收。对独立 SVG 优先使用 `file://` URL；验收证据应包含目标页面、viewport/缩放、可复查的 DOM/几何结果和截图或控制台记录。它不负责生成 SVG、`.diagram.json` 或目标 PNG/PDF 导出；截图仅作为验收证据，不作为交付导出物，也不负责重新布局；相应能力缺失时按 `NEEDS_CAPABILITY` 处理。
- MCP 不可用时，应明确告知用户，并仅依赖仓库中已存在的通用规则继续可执行部分。

## 三阶段术语

```text
Inception（规划） → Construction（实现与验证） → Operations（部署准备，条件）
```

Operations 只为已确认的目标环境生成交付配置和可执行部署说明，不覆盖部署后的生产运维。具体流程统一见 `steering/core-workflow.md`。

## 故障排除

- **Power 未激活**：确认 Power 安装目录完整，并重新在 Kiro Powers 面板加载。
- **MCP 连接失败**：检查 Kiro MCP 面板连接状态及远程服务网络可达性。
- **Steering 加载失败**：确认安装包包含 `steering/core-workflow.md`，必要时重新安装 Power。
- **会话恢复失败**：确认业务项目中的 `docs/aidlc/state.md` 存在且为最新状态。
