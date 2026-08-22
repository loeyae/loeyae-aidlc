# Loeyae AI-DLC（Claude Code 入口）

本文件只定义 Claude Code 的接入与能力适配。共享流程规则的唯一事实来源是 `steering/`，主入口为 `steering/core-workflow.md`；阶段路由、执行条件、审批级别和完成标准不在此重复。

## Claude Code 接入

Claude Code 通过 `.claude-plugin/plugin.json` 和 `.claude-plugin/marketplace.json` 发现插件。`plugin.json` 只声明 MCP 服务，`skills/`、`steering/` 与 `agents/` 依赖 Claude Code 的插件目录约定读取，本仓未实测该装载行为。平台安装总览见 `README.md`。

激活示例：

```text
使用 AI-DLC 开发用户认证模块
```

激活后必须先读取 `steering/core-workflow.md`，再按其中路由加载所需文件。

## Claude Code 能力适配

- **Skills**：`skills/` 仅作为平台无关薄入口，负责加载与路由，不复制共享流程规则。它是可选加速路径；未被装载时按 `steering/core-workflow.md` 的降级规则直接加载对应 steering，能力边界与质量门禁不变。
- **子 Agent**：共享指令位于 `agents/`；Construction 分段执行可由 `.claude/workflows/aidlc-construction-batch.js` 适配 Claude Code。
- **会话延续**：工作流状态记录在业务项目的 `docs/aidlc/state.md`。
- **图表设计**：正式图表按 `steering/common-diagram-design-standards.md` 的 Blueprinter SVG 设计规则生成可审阅的 SVG 源，可选生成 `.diagram.json` 语义伴随清单和 Provider Request；外部 Provider 负责目标预览、渲染、导出和目标环境视觉检查。插件清单未声明已验证的 SVG Provider，因此不能把现有配置当作运行时生成、渲染、`.drawio → SVG` 导出或 Preview 成功的证据；无 Provider 时可交付源并将目标几何/视觉标为 `UNVERIFIED`，只有用户明确要求目标操作但无可验证 Provider 时才返回 `NEEDS_CAPABILITY`，或经用户同意降级为文字/表格。Claude Code 运行时 SVG 生成仍为未验证状态。

## MCP 集成

插件清单声明以下远程服务：

- `loeyae-skills`：仅在 Java + Loeyae Boot Framework 项目的 Construction 阶段按需加载框架编码规范。
- `awesome-design`：仅在 I9 选择 HTML Mock 模式且用户选择设计风格时使用。
- `figma`：Figma 官方 Remote MCP。首次调用触发浏览器 OAuth 授权（不支持 PAT）。仅在 I9 选择 Figma 模式（写入设计，规则见 `inception-ui-figma.md`）或 Construction 阶段还原 Figma 设计稿（读取设计，规则见 `common-figma-design-standards.md`）时使用。写入类工具处于 Beta 且受 seat 类型限速，`whoami` 显示 seat 不满足时应回退 HTML Mock 模式。
- `ssot`：SSOT 文档管理服务，仅用于只读检索项目文档作为上下文参考；AI-DLC 禁止调用写入/修改/归档类工具；需设置 `SSOT_API_KEY` 环境变量。

`figma` 出现在插件清单或 `/mcp` 中仅代表已配置，不代表已认证或具备读写能力。必须依次以 `whoami`、`get_metadata`、`create_new_file` + `use_figma` 区分已认证、可读取、可写入状态；仅使用外部 Figma 时无需验证写入。

自动注册失败时可手动执行：

```bash
claude mcp add --transport http loeyae-skills https://mcp-skills.allbelieves.com/mcp
claude mcp add --transport http awesome-design https://mcp-design.allbelieves.com/mcp
claude mcp add --transport http figma https://mcp.figma.com/mcp
claude mcp add --transport http ssot https://ssot.dev.loeyae.com/mcp/ --header "Authorization: Bearer $SSOT_API_KEY"
```

`figma` 注册后需执行 `/mcp` → 选择 `figma` → `Authenticate` 完成浏览器授权。

使用 `/mcp` 查看服务状态。MCP 不可用时，应明确告知用户，并仅依赖仓库内已有通用规则继续可执行部分。

## 三阶段术语

```text
Inception（规划） → Construction（实现与验证） → Operations（部署准备，条件）
```

Operations 为已确认的目标环境生成交付配置和可执行部署说明，不覆盖部署后的生产运维。完整流程统一见 `steering/core-workflow.md`。

## 故障排除

- **插件未发现**：检查 `.claude-plugin/` 清单及插件仓库配置。
- **MCP 连接失败**：运行 `/mcp`，检查远程服务网络可达性，必要时使用上述命令手动注册。
- **共享规则加载失败**：确认插件包包含 `steering/core-workflow.md`。
- **会话恢复失败**：确认业务项目中的 `docs/aidlc/state.md` 存在且为最新状态。
