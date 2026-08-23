# AI-DLC Power 补充规范提交

## 提交背景

在项目实践中（澳洲电商二期，多模块模式，Inception 阶段 UI Mock 制作），发现现有 AI-DLC Power 在以下方面存在规范空白或不够细致：

1. **UI Mock 内容决策缺乏原则指导** — 现有 `inception-ui-mock.md` 侧重流程步骤和 HTML 结构，但对"页面内容该怎么推导、为什么这样画"缺乏系统性原则
2. **UI Mock 工作流缺乏分阶段审核机制** — 现有流程是"做完一整个端再给用户审"，实践中发现先审骨架（页面数量和流程跳转）再审内容效率更高
3. **多模块并行开发时缺乏边界约束** — 批量操作容易越界到其他模块
4. **AI 容易"好心办坏事"推翻产品已确认的决定** — 需要明确的防护规则

## 提交文件清单

### Steering 文件（5个）

| 文件名 | 建议融入位置 | 说明 |
|--------|------------|------|
| `steering/ui-mock-design-spec.md` | 新增独立文件 或 合并到 `inception-ui-mock.md` | UI Mock 设计规范：条件表生成规则、交互模式映射、表单联动规范、空状态规范等 |
| `steering/ui-mock-reasoning-principles.md` | 新增独立文件 或 合并到 `inception-ui-mock.md` | UI Mock 三层推导原则：UI本体（面向用户）→ 条件表（面向开发）→ 底部说明（面向验证），含详细自检清单 |
| `steering/ui-mock-workflow.md` | 新增独立文件 或 替代/增强 `inception-ui-mock.md` 步骤3-7 | 两阶段工作流：阶段1产出骨架HTML供用户确认流程 → 阶段2在同一HTML上填充完整内容 |
| `steering/module-scope-guard.md` | 新增为 `common-module-scope-guard.md` | 多模块模式下的边界约束：批量操作只能作用于 state.md 声明的活跃模块 |
| `steering/requirement-no-override.md` | 新增为 `common-requirement-integrity.md` 或合并到 `common-content-validation.md` | 禁止AI推翻产品已确认决定的防护规则 |

---

## 融入建议

### 方案A：保持独立文件（推荐）

将 UI Mock 相关的 3 个 steering 文件作为独立文件加入 Power 的 `steering/` 目录：
- `inception-ui-mock-design-spec.md` — 设计规范
- `inception-ui-mock-reasoning-principles.md` — 推导原则
- `inception-ui-mock-workflow.md` — 两阶段工作流（manual inclusion，用户手动选择是否启用）

优点：不影响现有 `inception-ui-mock.md` 的结构；文件按需加载（fileMatch: `**/*.html`），不浪费 token。

### 方案B：合并到现有文件

将规范内容合并到现有 `inception-ui-mock.md` 中：
- 推导原则 → 加在"步骤5：内容制作规则"之前
- 设计规范 → 加在步骤5的子节中
- 两阶段工作流 → 替代现有步骤3-7的线性流程

优点：集中管理；缺点：单文件过大，加载消耗 token 多。

### 通用规范融入

- `module-scope-guard.md` → 直接作为 `common-module-scope-guard.md` 加入，`inclusion: always`
- `requirement-no-override.md` → 作为 `common-requirement-integrity.md` 加入，`inclusion: always`

---

## 文件间的关系图

```
inception-ui-mock.md（现有，流程主干）
    ├── ui-mock-design-spec.md（新增，设计规范 — fileMatch: *.html）
    ├── ui-mock-reasoning-principles.md（新增，推导原则 — fileMatch: *.html）
    └── ui-mock-workflow.md（新增，两阶段工作流 — manual inclusion）

common-module-scope-guard.md（新增，通用 — always）
common-requirement-integrity.md（新增，通用 — always）
```

---

## 实践来源

这些规范均来自实际项目踩坑：
- **三层推导** — 解决了"AI 画出的 Mock 混杂系统术语，用户看不懂"的问题
- **两阶段工作流** — 解决了"做了一大堆页面内容，结果用户说页面数量和流程都不对"的返工问题
- **模块边界** — 解决了"审计一个模块时顺带改了其他模块文件"的越界问题
- **需求不可反转** — 解决了"产品说不限购，AI 自己加了限购规则"的严重bug
- **UI Mock 三层自检清单** — 解决了"每次都忘了自检，提交给用户后才发现层次混乱"的问题（已内含在 `ui-mock-reasoning-principles.md` 的自检清单中）
