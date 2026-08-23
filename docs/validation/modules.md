# 模块划分

## 模块列表

### 基础模块

| 模块 ID | 模块名称 | 职责 | 包含内容 |
|---------|---------|------|---------|
| base | 基础设施 | 跨模块共享的通用能力 | 统一响应、分页、异常体系、工具类、当前用户上下文、BOM 版本管理 |

### 业务模块

| 模块 ID | 模块名称 | 职责 | 一句话需求摘要 | 优先级 |
|---------|---------|------|---------------|--------|
| web | Web 服务 | HTTP 层能力封装 | 提供全局异常处理、XSS/CORS 防护、请求加密、API 前缀注入 | P0 |
| data | 数据访问 | 数据库操作封装 | 提供 CRUD 封装、多租户、数据权限、字段加密、对象转换、数据审计 | P0 |
| security | 安全认证 | 认证授权体系 | 提供 JWT 认证、RBAC 权限、会话管理、CSRF 防护 | P0 |
| cache | 缓存服务 | 缓存抽象层 | 提供统一缓存接口、本地缓存(Caffeine)、分布式缓存(Redis)、二级缓存 | P0 |
| message | 消息队列 | 消息通信抽象 | 提供统一消息接口、Kafka/RabbitMQ/Redis Stream 实现、消息审计 | P1 |
| extensions | 扩展能力 | 独立扩展模块集合 | 提供定时任务、邮件、CMS、Feign、许可证、签名、脱敏等独立能力 | P2 |

## 模块边界规则

- 被 2 个以上模块引用的类/接口 → 放入 base
- 每个业务模块对应一个或多个 Maven starter
- 模块间通过 base 提供的接口/SPI 通信，不直接依赖
- extensions 中的每个子模块相互独立，可单独引入

## 模块依赖关系

```text
base (loeyae-common)
 ↑
 ├── web (starter-web)
 ├── data (starter-mybatis, starter-mybatis-audit)
 ├── security (starter-security)
 └── cache (starter-cache)
      ↑
      ├── message (starter-message-*)
      └── extensions (starter-job, starter-mail, starter-cms, ...)
```

注意：
- web、data、security、cache 都只依赖 base
- message 依赖 cache（消息可能需要缓存支持）
- extensions 中的部分模块依赖 cache（如 starter-job 需要分布式锁）
- security 和 web 之间无直接依赖（CSRF 防护在 security 中，但通过 Spring Security Filter 集成）

## 开发顺序建议

1. **base** — 所有模块的前置，定义公共接口和工具
2. **web** / **data** / **security** / **cache** — 可并行（都只依赖 base）
3. **message** — 依赖 cache 接口定义完成
4. **extensions** — 最后，各子模块可独立开发

## 变更记录

| 时间 | 变更 | 原因 |
|------|------|------|
| 2026-05-15 | 初始划分 | 产品级 Inception |
