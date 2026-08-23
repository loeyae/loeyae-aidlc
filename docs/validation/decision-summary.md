# 产品级 Inception - 决策摘要

**完成时间**：2026-05-15T21:35:00Z

## 模块划分决策
- 共 7 个模块：base, web, data, security, cache, message, extensions
- 基础模块：base（loeyae-common）
- 开发顺序：base → web/data/security/cache（并行）→ message → extensions

## 关键约束
- Java 21 最低版本
- Spring Boot 3.5.7 生态
- BOM 统一版本管理
- 模块间禁止直接 Java 依赖，通过 SPI + 自动配置集成

## 模块间核心依赖
- 所有模块 → base：公共接口和工具类
- message/extensions → cache：Redis 客户端和分布式锁
- security ↔ data：通过 Spring Security 标准 SPI 解耦，无直接依赖

## 注意事项
- web 和 security 之间通过 Filter 链集成，不是 Java 依赖
- data 模块的多租户和数据权限依赖 base 的 TenantContextHolder 和 SecurityUtil
- extensions 中的子模块相互独立，可以作为模块内的"单元"处理
- message 模块的 3 种实现（Kafka/RabbitMQ/Redis Stream）可以作为模块内的 3 个单元
