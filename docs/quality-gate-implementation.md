# 质量门禁自动化实现参考

> 本文档为团队搭建CI/CD流水线和自动化质量检查的参考资料，不在AI-DLC工作流执行时主动加载。

---

## 自动化检查工具配置

### 代码质量检查工具

```yaml
quality_gates:
  tools:
    code_quality:
      java:
        - name: "checkstyle"
          config: ".checkstyle.xml"
          command: "mvn checkstyle:check"
        - name: "spotbugs"
          command: "mvn spotbugs:check"
      typescript:
        - name: "eslint"
          config: ".eslintrc.js"
          command: "pnpm lint"
        - name: "prettier"
          command: "pnpm format:check"
    security:
      - name: "sonarqube"
        command: "mvn sonar:sonar"
      - name: "owasp_dependency_check"
        command: "mvn org.owasp:dependency-check-maven:check"
    testing:
      - name: "jacoco"
        command: "mvn jacoco:check"
        threshold: 0.8
      - name: "jest"
        command: "pnpm test:coverage"
```

---

## 占位符检查脚本

```bash
#!/bin/bash
# check-placeholders.sh
echo "=== 占位符检查 ==="

if grep -r -i "TODO\|FIXME\|待实现\|待完成\|待补充" src/; then
    echo "❌ 发现占位符，质量门禁失败"
    exit 1
else
    echo "✅ 无占位符"
fi
```

---

## CI/CD 集成示例

```yaml
# .github/workflows/quality-gates.yml
name: Quality Gates

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  quality-gates:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3

    - name: Check for TODOs and FIXMEs
      run: |
        if grep -r -i "TODO\|FIXME\|待实现\|待完成\|待补充" src/; then
          echo "❌ 发现占位符"
          exit 1
        fi

    - name: Run code quality checks
      run: |
        mvn checkstyle:check
        mvn spotbugs:check
        pnpm lint
        pnpm type-check

    - name: Run tests
      run: |
        mvn test
        pnpm test:coverage

    - name: Security scan
      run: |
        mvn org.owasp:dependency-check-maven:check
```

---

## 质量门禁报告模板

```markdown
# 质量门禁检查报告

## 基本信息
- **项目名称**: [项目名称]
- **阶段**: [阶段名称]
- **检查时间**: [检查时间]

## 检查结果概览
- **总检查项**: [总数]
- **通过项**: [通过数]
- **失败项**: [失败数]
- **整体状态**: [通过/失败]

## 详细结果
| 检查项 | 状态 | 说明 |
|--------|------|------|
| [检查项名] | ✅/❌ | [详细说明] |

## 失败项修复建议
1. **[失败项]**: [原因] → [修复建议]
```

---

## 质量门禁配置示例

```yaml
# .kiro/quality-gates.yaml
quality_gates:
  strictness: "C"  # A:警告, B:检查点, C:强制
  enabled_phases:
    - "requirements-analysis"
    - "user-stories"
    - "application-design"
    - "code-generation"
    - "security"
    - "build-and-test"
  thresholds:
    test-coverage: 0.8
  tools:
    code-quality: ["checkstyle", "eslint", "prettier"]
    security: ["sonarqube", "owasp-dependency-check"]
    testing: ["jacoco", "jest"]
```

---

## 代码合规性自动化检查参考

### Python 实现示例

```python
import re

def check_no_placeholders(code_files):
    """检查代码中是否有占位符"""
    patterns = [
        r"TODO", r"FIXME", r"HACK", r"XXX",
        r"待实现", r"待完成", r"待补充", r"待优化"
    ]
    for file_path, content in code_files.items():
        for pattern in patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return False, f"{file_path}: 发现 {pattern}"
    return True, "无占位符"


def check_implementation_completeness(code_files):
    """检查是否有空方法体"""
    empty_method = r'(public|private|protected)\s+\w+\s+\w+\([^)]*\)\s*\{\s*\}'
    for file_path, content in code_files.items():
        if re.search(empty_method, content):
            return False, f"{file_path}: 发现空方法体"
    return True, "方法实现完整"
```

---

## 最佳实践

1. **渐进式实施**：从占位符检查和linting开始，逐步增加安全扫描和覆盖率检查
2. **团队培训**：确保团队理解质量门禁的目的和标准
3. **持续改进**：定期评审检查项，移除过时规则，增加新发现的问题模式
4. **误报处理**：建立误报反馈机制，避免阻塞正常开发流程
