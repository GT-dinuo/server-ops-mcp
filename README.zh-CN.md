# Server Ops MCP

[English](./README.md) | **简体中文**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

通用服务器运维 MCP Server。让 Claude Code / Cursor / Codex 等 AI 工具，通过 `.mcp.json` 配置多个项目或服务器，完成**日志排查、系统资源查看、代码增删改查、Nginx / 证书管理**等运维操作。

支持**本地**与**远程（SSH）**两种模式，内置二次确认、命令白名单、路径穿越防护与敏感信息脱敏。

## 功能特性

- 🔍 **日志排查**：列出 / 读取 / 搜索项目日志，支持多通道日志与系统日志
- 📊 **资源监控**：CPU / 内存 / 磁盘 / 负载 / 进程 / 服务状态一键查看
- 📁 **代码操作**：文件读写、局部修改、删除、搜索，限制在项目根目录内
- 🌐 **Nginx / 证书**：配置测试与读取、安全重载、证书安装与续期
- 🔒 **安全可控**：写操作二次确认、命令白名单、路径穿越防护、自动脱敏

## 安装

需要 Node.js 18+。

```bash
git clone https://github.com/GT-dinuo/server-ops-mcp.git
cd server-ops-mcp
npm install
npm run build
```

构建产物输出到 `dist/`，入口为 `dist/index.js`。

## 配置

在需要使用本工具的项目中，创建（或追加）`.mcp.json`，为每个环境声明一个 MCP Server。本地模式只需 `OPS_PROJECT_ROOT`；远程模式再补充 SSH 相关变量。

```json
{
  "mcpServers": {
    "myproject-server": {
      "command": "node",
      "args": ["/absolute/path/to/server-ops-mcp/dist/index.js"],
      "env": {
        "OPS_PROJECT_ROOT": "/www/wwwroot/your-project",
        "OPS_SSH_HOST": "<server-ip-or-domain>",
        "OPS_SSH_PORT": "22",
        "OPS_SSH_USER": "ubuntu",
        "OPS_SSH_KEY": "~/.ssh/id_rsa"
      }
    }
  }
}
```

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPS_PROJECT_ROOT` | 是 | 项目根目录路径，所有文件操作都限制在此目录内 |
| `OPS_SSH_HOST` | 否 | 远程服务器 IP / 域名，留空则在本地执行 |
| `OPS_SSH_PORT` | 否 | SSH 端口，默认 `22` |
| `OPS_SSH_USER` | 否 | SSH 用户名 |
| `OPS_SSH_KEY` | 否 | SSH 私钥路径（与密码二选一） |
| `OPS_SSH_PASSWORD` | 否 | SSH 密码（与密钥二选一） |
| `OPS_SSH_PASSPHRASE` | 否 | 私钥 passphrase |
| `OPS_CONFIG_PATH` | 否 | 额外配置文件路径，见下文「自定义配置」 |

## 使用教程

配置完成后，在 AI 工具中直接用自然语言下达运维指令即可。AI 会自动选择合适的工具并调用。

### 只读操作（直接执行）

```
帮我看看服务器的 CPU、内存和磁盘占用情况
最近一小时 error 级别的日志有哪些？帮我搜一下
列出项目里有哪些日志文件
读一下 Nginx 配置，检查有没有问题
搜索代码里所有调用 sendSms 的地方
```

### 写操作（需二次确认）

涉及写入、删除、命令执行、Nginx 重载、证书安装等操作时，工具会先返回一个 `confirmationId`，AI 会向你展示将要执行的内容，**确认后才真正执行**：

```
你：帮我把 nginx 重载一下
AI：（调用 nginx_reload，返回待确认操作及 confirmationId）
    即将执行：nginx -s reload，是否确认？
你：确认
AI：（调用 confirm_execute 完成执行）
```

可通过 `file_write`、`file_patch`、`file_delete`、`command_exec` 等完成代码变更与命令执行，均遵循同样的确认流程。

### 典型场景

- **线上排障**：`帮我分析下服务器内存为什么满了` → `memory_analysis` + `log_search` 联动排查
- **日常巡检**：`看下磁盘快满了没有，哪个目录占得最多` → `disk_analysis`
- **安全审计**：`审计一下项目配置，有没有泄露的密钥` → `config_audit`（自动脱敏输出）

## 工具列表

### 系统运维

| 工具 | 说明 |
|------|------|
| `system_info` | 查看 CPU / 内存 / 磁盘 / 负载 / 进程 |
| `memory_analysis` | 内存占用分析 |
| `disk_analysis` | 磁盘占用分析 |
| `service_status` | 查看服务状态 |
| `log_search_system` | 搜索系统日志 |
| `nginx_config_test` | 测试 Nginx 配置 |
| `nginx_config_read` | 读取 Nginx 配置 |
| `nginx_reload` | 重载 Nginx（需确认） |
| `certbot_install` | 安装证书（需确认） |
| `certbot_renew` | 续期证书（需确认） |

### 项目代码

| 工具 | 说明 |
|------|------|
| `log_list` | 列出项目日志 |
| `log_read` | 读取日志 |
| `log_search` | 搜索日志 |
| `file_read` | 读取文件 |
| `file_list` | 列出目录 |
| `file_search` | 搜索代码 |
| `file_write` | 写入文件（需确认） |
| `file_patch` | 局部修改文件（需确认） |
| `file_delete` | 删除文件（需确认） |
| `command_exec` | 执行白名单命令 |
| `project_overview` | 项目概览 |
| `config_audit` | 审计配置（自动脱敏） |
| `confirm_execute` | 确认并执行待二次确认的操作 |

## 安全说明

1. **只读工具**可直接执行。
2. **写操作、命令执行、Nginx 重载、证书安装**等需用户二次确认（`confirm_execute`）。
3. 命令执行走白名单机制，拒绝 `rm -rf`、`sudo`、管道到 shell 等危险操作。
4. 文件操作限制在 `OPS_PROJECT_ROOT` 目录内，禁止路径穿越。
5. 读取 `.env`、日志时自动脱敏密码、Token 等敏感信息。

## 自定义配置

复制 `config.example.json` 为 `config.json`，通过环境变量 `OPS_CONFIG_PATH` 指向它，即可自定义日志通道、命令白名单、读取上限等。

```bash
cp config.example.json config.json
# 编辑 config.json 后，在 .mcp.json 的 env 中设置：
# "OPS_CONFIG_PATH": "/absolute/path/to/config.json"
```

`config.example.json` 主要字段：

- `logChannels`：日志通道名 → 日志目录相对路径
- `maxReadLines` / `maxReadBytes`：单次读取的行数 / 字节上限
- `commandWhitelist.direct`：可直接执行的命令
- `commandWhitelist.confirm`：需二次确认的命令

## 开发

```bash
npm run dev    # watch 模式，改动自动编译
npm run build  # 构建到 dist/
npm run clean  # 清理 dist/
npm start      # 直接运行已构建的 Server
```

## 注意事项

- 远程操作依赖 SSH，建议为 AI 配置**只读账号**或严格收敛命令白名单。
- 私钥文件权限应设为 `600`（`chmod 600 ~/.ssh/id_rsa`）。
- 不要将包含密码的 `.mcp.json`、`config.json` 提交到代码仓库。

## 许可证

[MIT](./LICENSE) © 2026 server-ops-mcp
