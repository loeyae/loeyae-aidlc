# Loeyae AI-DLC

基于 AI-DLC 方法论的完整开发流程闭环，覆盖 Inception（规划）、Construction（实现与验证）和按条件执行的 Operations（部署准备），集成 Loeyae Boot Framework 编码规范和 Vue 3 前端规范。

> **仓库整合通知**：本仓库统一维护 Kiro、Claude Code 和 OpenCode 三个平台入口。原 `loeyae-cc-aidlc` 与 `loeyae-oc-aidlc` 已并入本仓库，后续以 `https://github.com/loeyae/loeyae-aidlc` 为准。

## 单仓库三入口

`steering/` 是共享流程规则的唯一事实来源，主入口为 `steering/core-workflow.md`；`skills/` 仅提供平台无关的可选薄入口，不承载规则。平台入口只负责加载、路由和能力适配。

```text
loeyae-aidlc/
├── steering/                         # 共享流程规则
│   ├── core-workflow.md              # 主工作流路由与事实入口
│   ├── core-workflow-slim.md         # OpenCode bootstrap 使用的精简入口
│   ├── common-quality-gates.md       # 质量门禁
│   ├── common-*.md
│   ├── inception-*.md
│   ├── construction-*.md
│   └── operations-*.md
├── skills/                           # 平台无关薄入口（含独立 Diagram Design 能力）
├── agents/                           # 平台无关子 Agent 指令
│   ├── orchestrator.md
│   └── batch-executor.md
├── .opencode/
│   ├── plugins/
│   │   └── loeyae-aidlc.js           # OpenCode 真实插件入口
│   └── INSTALL.md
├── .claude-plugin/                   # Claude Code 插件清单
├── POWER.md                          # Kiro Power 入口
├── CLAUDE.md                         # Claude Code 入口
├── package.json                      # OpenCode 包与发布清单
├── mcp.json                          # Kiro MCP 配置
└── scripts/setup.mjs                 # OpenCode MCP 注册脚本
```

| 平台 | 入口 | 共享资源加载方式 | `skills/` 是否自动装载 |
|------|------|------------------|------------------------|
| Kiro | `POWER.md` + `mcp.json` | Power 安装产物仅含 `POWER.md`、`mcp.json` 和 `steering/` | 否（已实测） |
| Claude Code | `CLAUDE.md` + `.claude-plugin/` | 插件按目录约定读取 `steering/`、`skills/` 与 `agents/` | 依赖平台约定，未实测 |
| OpenCode | `package.json` + `.opencode/plugins/loeyae-aidlc.js` | `main` 加载插件；插件注入 bootstrap | 是（插件写入 `config.skills.paths`） |

`skills/` 是可选的能力入口，不是流程必需路径。所有规则以 `steering/` 为准；平台未装载 `skills/` 时，按 `steering/core-workflow.md` 的降级规则直接加载对应 steering 执行，输入要求、输出内容和质量门禁均不变。`agents/` 在所有平台都需手动使用。

OpenCode 不使用根目录 `plugin.json`；`package.json` 及其 `main` 指向的 `.opencode/plugins/loeyae-aidlc.js` 是真实入口。

## 安装

### OpenCode

在全局或项目级 `opencode.json` 的 `plugin` 数组中添加：

```json
{
  "plugin": ["loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git"]
}
```

固定到当前版本：

```json
{
  "plugin": ["loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git#v1.37.1"]
}
```

重启 OpenCode 后，插件会注册 skills、注入 AI-DLC bootstrap，并尝试注册 `loeyae-skills`、`awesome-design`、`figma` MCP 服务（`ssot` 需设置 `SSOT_API_KEY`）。详细说明见 [.opencode/INSTALL.md](.opencode/INSTALL.md)。

MCP 自动注册未生效时，可运行：

```bash
bunx loeyae-aidlc
```

### Kiro

在 Kiro Powers 面板中通过本地目录或 Git 仓库添加本 Power。平台接入与 MCP 能力见 [POWER.md](POWER.md)。

### Claude Code

通过 marketplace 或插件仓库安装：

```json
{
  "plugins": {
    "repositories": ["https://github.com/loeyae/loeyae-aidlc.git"]
  }
}
```

平台接入、Hook 和 MCP 配置见 [CLAUDE.md](CLAUDE.md)。

## 使用方式

三个平台均可使用：

```text
使用 AI-DLC，[描述你的开发需求]
```

工作流按复杂度自适应执行：

```text
Inception（规划） → Construction（实现与验证） → Operations（部署准备，条件）
```

- **Inception**：确认开发什么、为什么开发以及如何验收。
- **Construction**：按单元完成设计、TDD 实现、审查和可复现验证。
- **Operations**：为已确认的目标环境生成交付配置和可执行部署说明；不覆盖部署后的生产运维。

对存量分布式系统，流程可按需建立服务与运行时依赖基线，治理跨边界契约、共享配置和分布式一致性，并据此计算 CR 与测试影响域。技术栈适配仅在工作区有可靠证据时条件加载；项目实际服务、配置和验证命令仍保存在业务项目的 `docs/aidlc/` 与既有工程事实来源中。

阶段路由、执行条件、审批级别和完成标准统一以 [`steering/core-workflow.md`](steering/core-workflow.md) 为准。

## 图表设计

正式图表遵循 Blueprinter 的 SVG 设计规则。AIDLC 默认生成可审阅的 SVG 源，并可选生成 `.diagram.json` 语义伴随清单和 Provider Request；外部 Provider 负责实际文字测量、最终布局、预览、渲染、PNG/PDF 导出和目标环境视觉检查。`.diagram.json` 不再是必须文件或默认本地渲染输入，静态 SVG 也不再是三平台默认生成能力。Markdown 只有在目标环境需要时才引用源或 Provider 生成的目标 SVG；引用不代表渲染已验证。不得新增 Mermaid 或二维 ASCII 正式图块。

在本仓库工作树中，以下命令仅是可选的源码仓维护/回归工具，不是 Kiro、Claude Code 或 OpenCode 的默认 Provider 路径：

```bash
npm run render:svg-diagrams
npm run render:delivery-business-flow-svg
npm run validate:svg-diagrams
```

各平台和目标环境的预览、渲染、导出能力须单独验证；无 Provider 时可以交付 SVG 源并将目标几何/视觉标为 `UNVERIFIED`，只有用户明确要求目标操作但能力不可验证时才返回 `NEEDS_CAPABILITY`。Kiro Power 的图表能力边界见 [POWER.md](POWER.md)。

## 平台能力

- **MCP 编码规范**：Java + Loeyae Boot Framework 项目可通过 `loeyae-skills` 按需加载框架规范。
- **UI 设计**：HTML Mock 可选用 `awesome-design`；Figma 路径通过官方 `figma` MCP 创建、审查或读取设计，具体能力必须运行时验证。
- **子 Agent**：共享指令位于 `agents/`，各平台按自身能力适配执行。

MCP 能力按以下四级状态判断，禁止把配置存在等同于可用：

1. **已配置**：平台入口包含服务连接配置。
2. **已认证**：`figma` 的 `whoami` 成功。
3. **可读取**：`get_metadata` 可读取目标文件或节点。
4. **可写入**：`create_new_file` + `use_figma` 最小写入验证成功。

三个入口面向相同的远程 MCP 服务，但注册格式和实际支持能力由各平台入口决定；未完成对应级别验证时必须明确当前状态并按流程降级。

## OpenCode 故障排除

### 插件未加载

1. 确认 `opencode.json` 中的插件配置正确。
2. 检查日志：`opencode run --print-logs "hello" 2>&1 | grep -i aidlc`。
3. 使用 `skill` 工具确认 aidlc 系列 skills 已发现。

### MCP 工具不可用

1. 运行 `bunx loeyae-aidlc` 注册 MCP 服务。
2. 通用规范服务检查 `https://mcp-skills.allbelieves.com/mcp` 网络可达性。
3. Figma 先确认配置，再执行 `whoami` 完成 OAuth，并分别验证 `get_metadata` 和最小写入。
4. Figma 客户端不支持或验证失败时，切换受支持客户端；无法切换则由用户确认回退 HTML Mock。
5. 重启 OpenCode。

### Windows 本地安装

```bash
npm install loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git --prefix "%USERPROFILE%\.config\opencode"
```

然后在 `opencode.json` 中使用本地包路径。

## 参考资源

- [AI-DLC 方法论](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/)
- [原始 aidlc-workflows 仓库](https://github.com/awslabs/aidlc-workflows)
