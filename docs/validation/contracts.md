# 模块间接口契约

## 契约总览

```text
base (loeyae-common)
 ↑ 所有模块依赖
 ├── web (starter-web)
 ├── data (starter-mybatis)
 ├── security (starter-security)
 └── cache (starter-cache)
      ↑
      ├── message (starter-message)
      └── extensions (部分)
```

## 契约定义

### base → 所有模块

**提供（实体/接口）**：
- `ApiResult<T>` — 统一响应封装
- `PageParam` / `PageResult<T>` — 分页参数和结果
- `IErrorCode` — 错误码接口
- `GlobalException` — 全局异常基类
- `LoginUser` — 当前登录用户上下文
- `SecurityUtil` — 安全工具类（获取当前用户、租户等）
- `TenantContextHolder` — 多租户上下文持有者

**提供（SPI 扩展点）**：
- `AuthorizeRequestsCustomizer` — URL 权限规则自定义
- `AuthorizeUserTypeCustomizer` — 用户类型权限自定义

**提供（工具类）**：
- `Decide` — 断言工具
- `OptionalUtil` — Optional 增强
- `JsonTool` — JSON 序列化工具

---

### base → security

**base 提供给 security 的接口**：
- `LoginUser` — security 模块填充此对象并放入上下文
- `SecurityUtil.getLoginUser(): LoginUser` — security 模块负责实现此方法的底层逻辑

---

### security → web

**security 提供（通过 Spring Security Filter 链集成，非直接依赖）**：
- JWT Token 验证 Filter — 自动注入到 Filter 链
- CSRF 防护 Filter — 自动注入到 Filter 链

**说明**：web 和 security 之间无 Java 级别的直接依赖，通过 Spring Boot 自动配置和 Filter 链集成。

---

### base → data

**base 提供给 data 的接口**：
- `TenantContextHolder.getTenantId(): Long` — data 模块的多租户拦截器调用此方法获取当前租户
- `SecurityUtil.getLoginUserId(): Long` — data 模块的数据权限拦截器调用此方法获取当前用户
- `LoginUser.getDataPermissions(): Map` — data 模块读取用户的数据权限配置

---

### data → security（反向：security 使用 data 的能力）

**说明**：security 模块需要查询用户信息，但不直接依赖 data 模块。通过 SPI 接口解耦：

- `UserDetailsService`（Spring Security 标准接口）— 由业务应用实现，security 模块定义加载逻辑
- security 模块不直接调用 data 模块的 Repository

---

### cache → message

**cache 提供给 message 的接口**：
- `RedissonClient` — message 的 Redis Stream 实现需要 Redisson 客户端
- `BaseCache.get(key): V` / `BaseCache.put(key, value)` — 消息幂等性检查可能使用缓存

---

### cache → extensions

**cache 提供给 extensions 的接口**：
- `RedissonClient.getLock(name): RLock` — starter-job 使用分布式锁防止任务重复执行
- `BaseCache` — starter-cms 使用缓存加速内容查询

---

### message → 业务应用

**message 提供（SPI 扩展点）**：
- `MessageConsumerInterceptor` — 消费端拦截器
- `MessageProducerInterceptor` — 生产端拦截器
- `MqMessageLogFrameworkService` — 消息审计日志存储自定义

---

### data → 业务应用

**data 提供（SPI 扩展点）**：
- `DataPermissionHandler` — 数据权限逻辑自定义
- `AuditLogFrameworkService` — 审计日志存储自定义

---

## 契约规则

- 模块间通过 base 提供的接口/SPI 通信
- 禁止业务模块之间直接 Java 依赖（web 不依赖 data，security 不依赖 data）
- 跨模块集成通过 Spring Boot 自动配置 + Filter/Interceptor 链实现
- 接口变更需要记录到变更日志
- SPI 扩展点由业务应用实现，框架模块只定义接口

## 变更日志

| 时间 | 变更模块 | 变更内容 | 影响模块 | 状态 |
|------|---------|---------|---------|------|
| 2026-05-15 | - | 初始契约定义 | - | - |
