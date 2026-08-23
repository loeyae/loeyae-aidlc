# AI-DLC Steering 与 MCP Skills 重复内容审阅

## 审阅结论

### 定位划分原则

| 层级 | 定位 | 内容范围 |
|------|------|----------|
| **AI-DLC steering** | 通用 AI 编程助手流程 | 适用于任何技术栈的工作流规则、通用编码原则 |
| **loeyae-mcp-skills** | Loeyae Boot Framework 专有规范 | 框架 API、注解、模块、代码模板 |

### 审阅结果

| 文件 | 当前内容 | 判定 | 建议操作 |
|------|----------|------|----------|
| `common-tech-backend.md` | 100% Loeyae Boot 专有（注解、异常、分层规范全部引用框架类） | 🔴 应移除 | 删除，内容已在 MCP skills 中覆盖 |
| `common-tech-backend-annotations.md` | 100% Loeyae Boot 专有（AssertUtil、@Pass、@QueryColumn 等） | 🔴 应移除 | 删除，对应 MCP skills: loeyae-validation, loeyae-data-access 等 |
| `common-tech-backend-modules.md` | 100% Loeyae Boot 专有（模块索引、依赖组合） | 🔴 应移除 | 删除，对应 MCP skill: loeyae-framework-modules |
| `common-tech-backend-practices.md` | 100% Loeyae Boot 专有（Decide、OptionalUtil、BaseCache、CRUD 示例） | 🔴 应移除 | 删除，对应 MCP skills: loeyae-crud, loeyae-cache 等 |
| `common-tech-testing.md` | 混合：通用测试原则 + Loeyae Boot 专有（@FakerField、RedisTestConfiguration） | 🟡 需拆分 | 保留通用部分，移除框架专有部分 |
| `common-database-design.md` | 混合：通用命名规范 + Loeyae Boot 专有（@InsertFillTime、@TableLogic 注解） | 🟡 需拆分 | 保留通用部分，移除框架专有部分 |
| `common-tech-frontend-pc.md` | 通用 Vue 3 / Element Plus 规范 | ✅ 保留 | 无需变更 |
| `common-tech-frontend-uniapp.md` | 通用 UniApp 规范 | ✅ 保留 | 无需变更 |
| `common-tech-security.md` | 需检查 | 待确认 | — |

### MCP Skills 中已有对应覆盖

| Steering 文件内容 | 对应 MCP Skill |
|-------------------|---------------|
| 注解速查（@Pass, @CurrentUser, @QueryColumn 等） | loeyae-auth, loeyae-data-access, loeyae-validation |
| 工具类（AssertUtil, Decide, OptionalUtil） | loeyae-error-handling, loeyae-decide, loeyae-optional-util |
| 模块索引与依赖组合 | loeyae-framework-modules |
| CRUD 完整示例 | loeyae-crud |
| 缓存使用 | loeyae-cache |
| 消息队列 | loeyae-message |
| 定时任务 | loeyae-job |
| 测试基类与工具 | loeyae-test, loeyae-test-base, loeyae-test-utils |
| 数据库设计（Entity 注解部分） | loeyae-database-design |
| 低代码规范 | loeyae-lowcode-* 系列 |

---

## 建议执行方案

### 第一步：删除纯 Loeyae Boot 专有文件（4 个）

- `common-tech-backend.md`
- `common-tech-backend-annotations.md`
- `common-tech-backend-modules.md`
- `common-tech-backend-practices.md`

### 第二步：拆分混合文件（2 个）

**common-tech-testing.md** — 保留：
- 测试类命名规范
- AAA 模式
- Mock 规范（何时 Mock）
- 参数化测试
- 测试覆盖要求
- 测试原则

**common-tech-testing.md** — 移除（已在 loeyae-test MCP skill 中）：
- @FakerField 注解及 FakerFieldType
- RedisTestConfiguration / SqlInitializationTestConfiguration
- FakerFieldUtils.generate()

**common-database-design.md** — 保留：
- 表名/字段名命名规范
- 索引规范
- 主键策略

**common-database-design.md** — 移除（已在 loeyae-database-design MCP skill 中）：
- Entity 注解列（@InsertFillTime, @TableLogic, @DefaultValue 等）
- 框架自动填充 Handler 引用

### 第三步：更新 core-workflow.md 中的引用

- 移除对已删除文件的加载指令
- 更新 MCP Skill 加载策略：明确"仅当 state.md 中 `后端框架 = Loeyae Boot` 时才通过 MCP 加载框架规范"
- 保留通用文件的加载指令

### 第四步：更新 construction-code-generation.md

- "Fallback 策略"中移除对已删除 steering 文件的引用
- 改为：非 Loeyae Boot 项目按项目自身规范编码，无需加载任何框架专有 steering

---

## 变更影响评估

| 影响项 | 说明 |
|--------|------|
| Loeyae Boot 项目 | 无影响 — 框架规范通过 MCP Skill 按需加载，比 steering 更详细 |
| 非 Loeyae Boot 项目 | 正面影响 — 不再加载无关的框架规范，减少 token 消耗和混淆 |
| Token 消耗 | 减少 ~15-20KB steering 加载量（4 个文件总计约 18KB） |
| 新项目初始化 | 无影响 — 工作区检测阶段识别技术栈后决定是否调用 MCP |
