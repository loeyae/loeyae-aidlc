# 安装 Loeyae AI-DLC for OpenCode

## 前提条件

- [OpenCode.ai](https://opencode.ai/) 已安装

## 安装

将 `loeyae-aidlc` 添加到你的 `opencode.json`（全局或项目级）的 `plugin` 数组中：

```json
{
  "plugin": ["loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git"]
}
```

重启 OpenCode。插件会通过 OpenCode 的插件管理器自动安装，并注册所有 skills。

验证方式：输入"使用 AI-DLC"，观察是否进入工作流。

## MCP 服务器配置（首次安装需要）

插件会尝试通过 config hook 自动注册 MCP 服务器。如果 MCP 工具不可用，需要手动注册：

**方式 1：运行 setup 脚本（推荐）**

```bash
bunx loeyae-aidlc
# 或
npx loeyae-aidlc
```

脚本会自动将 MCP 服务器写入全局配置。

**方式 2：手动添加**

在 `~/.config/opencode/opencode.json`（Linux/macOS）或 `%APPDATA%/opencode/opencode.json`（Windows）中添加：

```json
{
  "mcp": {
    "loeyae-skills": {
      "type": "remote",
      "url": "https://mcp-skills.allbelieves.com/mcp"
    },
    "awesome-design": {
      "type": "remote",
      "url": "https://mcp-design.allbelieves.com/mcp"
    },
    "figma": {
      "type": "remote",
      "url": "https://mcp.figma.com/mcp"
    },
    "ssot": {
      "type": "remote",
      "url": "https://ssot.dev.loeyae.com/mcp/",
      "headers": { "Authorization": "Bearer ${SSOT_API_KEY}" }
    }
  }
}
```

重启 OpenCode 后可看到 MCP 连接配置。`figma` 是否可实际调用取决于 Figma 官方客户端支持、OAuth 状态和 seat；配置存在不等于能力已验证。

首次选择 Figma 模式时必须依次验证：

1. MCP 列表中存在 `figma`
2. `whoami` 成功（完成浏览器 OAuth）
3. 读取路径：`get_metadata` 成功
4. 流程创建路径：在正式设计前完成 `create_new_file` + `use_figma` 最小写入验证

任一步失败时不得继续 Figma 写入；应切换到受支持客户端或由用户确认回退 HTML Mock。Figma 官方 Remote MCP 不支持 Personal Access Token。

## 使用

使用 OpenCode 原生 `skill` 工具：

```
使用 skill 工具列出 skills
使用 skill 工具加载 aidlc-inception
```

或者直接说：

```
使用 AI-DLC 开发用户认证模块
```

## 固定版本

```json
{
  "plugin": ["loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git#v1.37.4"]
}
```

## 更新

### 方式 1：使用 latest（推荐，始终获取最新版本）

`opencode.json` 中不指定版本号：

```json
{
  "plugin": ["loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git"]
}
```

清除缓存并重启：

```bash
# Linux/macOS
rm -rf ~/.config/opencode/.cache/plugins/loeyae-aidlc
# Windows
rmdir /s /q "%APPDATA%\opencode\.cache\plugins\loeyae-aidlc"
```

重启 OpenCode 即可拉取最新版本。

### 方式 2：指定版本号更新

修改 `opencode.json` 中的版本标签：

```json
{
  "plugin": ["loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git#v1.37.4"]
}
```

然后清除缓存并重启 OpenCode。

### 方式 3：npm 本地安装更新

```bash
# 重新安装（覆盖旧版本）
npm install loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git --prefix ~/.config/opencode
```

### 验证更新

重启 OpenCode 后输入：

```
使用 AI-DLC，展示欢迎消息
```

观察欢迎消息是否正常显示，确认版本已更新。

## 故障排除

### 插件未加载

1. 检查日志：`opencode run --print-logs "hello" 2>&1 | grep -i aidlc`
2. 确认 `opencode.json` 中的 plugin 行正确
3. 确保 OpenCode 版本 >= 1.0.110

### MCP 工具不可用

1. 确认插件 config hook 或 `bunx loeyae-aidlc` 已注册对应服务
2. 通用规范服务检查 `https://mcp-skills.allbelieves.com/mcp` 网络可达性
3. Figma 检查 MCP 列表、执行 `whoami` 完成 OAuth，再分别验证 `get_metadata` 和最小写入
4. Figma 客户端不受支持或验证失败时，切换受支持客户端或回退 HTML Mock
5. 重启 OpenCode

### Windows 安装问题

如果 OpenCode 无法从 git URL 安装，使用 npm 本地安装：

```bash
npm install loeyae-aidlc@git+https://github.com/loeyae/loeyae-aidlc.git --prefix "%USERPROFILE%\.config\opencode"
```

然后在 `opencode.json` 中使用本地路径：

```json
{
  "plugin": ["~/.config/opencode/node_modules/loeyae-aidlc"]
}
```

### Skills 未发现

1. 使用 `skill` 工具列出已发现的 skills
2. 确认插件已加载（见上方）

## 工具映射

当 skills 引用 Claude Code 工具时：

- `TodoWrite` → `todowrite`
- `Task` with subagents → `@mention` 语法
- `Skill` tool → OpenCode 原生 `skill` 工具
- 文件操作 → OpenCode 原生工具
