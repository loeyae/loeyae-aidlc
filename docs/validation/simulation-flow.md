# 流程模拟记录

## 场景 1：产品级 Inception 完成后的模块选择菜单

用户启动新会话，AI 检测到 state.md 存在且架构模式为多模块：

```markdown
**欢迎回来！检测到多模块项目。**

**模块状态：**
| 模块 | 类型 | 状态 | 进度 |
|------|------|------|------|
| base | 基础 | 🔓 可开始 | - |
| web | 业务 | 🔓 可开始 | - |
| data | 业务 | 🔓 可开始 | - |
| security | 业务 | 🔓 可开始 | - |
| cache | 业务 | 🔓 可开始 | - |
| message | 业务 | 🚫 依赖 cache | - |
| extensions | 业务 | 🚫 依赖 cache | - |

**你想做什么？**

A) 继续产品规划 — 修改模块划分或接口契约
B) 新增模块 — 添加新的业务模块
C) 进入「base」— 开始基础模块 Inception（建议优先）
D) 进入「web」— 开始 Web 服务模块 Inception
E) 进入「data」— 开始数据访问模块 Inception
F) 进入「security」— 开始安全认证模块 Inception
G) 进入「cache」— 开始缓存服务模块 Inception

[回答]:
```

**验证结论**：✅ 菜单清晰，依赖关系可见，用户能做出明智选择。

---

## 场景 2：用户选择 C（进入 base 模块）

AI 执行：
1. 更新 state.md：`活跃模块 = base`，base 状态改为 `🔄 Inception 进行中`
2. 加载上下文：
   - `product/contracts.md`（~2KB，只看 base 相关部分）
   - 无模块级产出物（首次进入）
3. 进入模块级 Inception → 需求分析

**模块级需求分析的范围**：
- 只关注 base 模块的需求：统一响应、分页、异常体系、工具类、当前用户上下文
- 引用 contracts.md 中 base 提供的接口列表作为需求来源
- 不关心 web/data/security 等模块的需求

**验证结论**：✅ 上下文极小（contracts.md ~2KB），范围明确。

---

## 场景 3：base 模块 Inception 完成后，切换到 data 模块

用户说："切换到 data 模块"

AI 执行：
1. 保存 base 模块进度到 state.md
2. 更新 state.md：`活跃模块 = data`
3. 卸载 base 模块上下文
4. 加载 data 模块上下文：
   - `product/contracts.md`（~2KB，关注 base→data 的接口）
   - 无模块级产出物（首次进入 data）
5. 进入 data 模块的模块级 Inception → 需求分析

**模块级需求分析的范围**：
- 只关注 data 模块的需求：CRUD 封装、多租户、数据权限、字段加密、审计
- 引用 contracts.md 中 base→data 的接口（TenantContextHolder、SecurityUtil）
- 不关心 web/security/cache 的需求

**验证结论**：✅ 模块切换流畅，上下文隔离有效。

---

## 场景 4：cache 模块 Inception 完成后，message 模块解锁

cache 模块完成 Inception 后：
1. state.md 中 cache 状态更新为 `✅ Inception 完成`
2. message 和 extensions 的状态自动变为 `🔓 可开始`
3. contracts.md 中 cache→message 的接口已经在产品级定义，无需额外操作

**验证结论**：✅ 依赖解锁逻辑清晰。

---

## 场景 5：contracts.md 变更通知

假设 base 模块在 Construction 阶段发现需要给 `SecurityUtil` 新增一个方法 `getLoginUserOrgId(): Long`。

1. 开发者更新 contracts.md：
   - 在 `base → data` 区域新增接口
   - 在变更日志中追加记录：

```markdown
| 2026-05-16T10:00:00Z | base | SecurityUtil 新增 getLoginUserOrgId() | data | 待同步 |
```

2. data 模块的开发者下次恢复时，AI 检测到变更日志：

```markdown
**⚠️ 检测到接口契约变更：**

| 时间 | 变更 | 影响 |
|------|------|------|
| 2026-05-16 | SecurityUtil 新增 getLoginUserOrgId() | data 模块的数据权限可能需要使用此方法 |

**建议操作**：
A) 立即处理 — 调整数据权限设计以使用新接口
B) 稍后处理 — 记录待办，继续当前工作
C) 查看详情 — 了解变更的完整上下文

[回答]:
```

**验证结论**：✅ 变更通知机制可行，不阻塞工作但确保信息同步。

---

## 场景 6：单模块退化

假设用户说："使用 AI-DLC，给 starter-web 添加一个请求限流功能"

这是一个小需求，只涉及 web 模块内部的变更。

AI 判断：
- 需求范围 = 单个模块内部
- 不需要产品级 Inception
- 直接进入模块级 Inception（或者如果足够简单，直接进入 Construction）

**验证结论**：✅ 小需求不会被强制走产品级流程。

---

## 验证总结

| 验证项 | 结果 | 说明 |
|--------|------|------|
| 产出物格式 | ✅ | product-overview/modules/contracts 格式清晰，信息量适中 |
| 模块划分粒度 | ✅ | 7 个模块，每个模块职责明确，边界清晰 |
| 接口契约支撑独立开发 | ✅ | 契约定义到方法签名级别，足够模块独立开发 |
| state.md 多模块扩展 | ✅ | 模块进度总览 + 依赖关系 + 活跃模块，信息完整 |
| 流程流畅性 | ✅ | 产品级 → 模块选择 → 模块级，路径清晰 |
| 上下文控制 | ✅ | 每个模块只加载 contracts.md + 本模块产出物，~35-50KB |
| 并行开发支持 | ✅ | web/data/security/cache 可以 4 人同时开发 |
| 变更通知 | ✅ | contracts.md 变更日志 + 恢复时检查 |
| 向后兼容 | ✅ | 小需求不走产品级，单模块自动退化 |

## 发现的问题

### 问题 1：extensions 模块的特殊性

extensions 不是一个真正的"业务模块"，而是一组独立子模块的集合（job、mail、cms、feign、license、signature、desensitize）。

**建议**：extensions 可以不作为一个模块参与产品级 Inception，而是：
- 每个子模块作为独立的小模块（如果需要独立开发）
- 或者作为一个"杂项模块"，内部按单元拆分

**结论**：当前设计已经支持这种情况（modules.md 中 extensions 的一句话摘要说明了它是"独立扩展模块集合"，模块级 Inception 时可以按单元拆分内部子模块）。无需修改。

### 问题 2：框架项目 vs 业务项目的差异

loeyae-boot-framework 是一个**框架项目**，模块间的"接口"更多是 Java 接口/SPI，而非 HTTP API。

对于**业务项目**（如电商系统），模块间的接口更多是 REST API 或事件。

**结论**：contracts.md 的格式已经足够灵活，支持两种场景：
- 框架项目：Java 接口签名 + SPI 扩展点
- 业务项目：HTTP API + 异步事件

无需修改，但可以在 `product-contracts.md` 中补充说明这两种场景的示例。
