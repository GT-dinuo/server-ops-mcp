# Server Ops MCP

**English** | [简体中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/server-ops-mcp.svg)](https://www.npmjs.com/package/server-ops-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://modelcontextprotocol.io)
[![GitHub stars](https://img.shields.io/github/stars/GT-dinuo/server-ops-mcp?style=social)](https://github.com/GT-dinuo/server-ops-mcp)

A general-purpose server-ops MCP Server. Let AI tools like Claude Code / Cursor / Codex manage multiple projects or servers through `.mcp.json` — **log troubleshooting, system resource inspection, code read/write, and Nginx / certificate management**.

Supports **local** and **remote (SSH)** modes, with built-in two-step confirmation, command whitelisting, path-traversal protection, and automatic secret redaction.

## Features

- 🔍 **Log troubleshooting**: list / read / search project logs, multi-channel logs & system logs
- 📊 **Resource monitoring**: CPU / memory / disk / load / processes / service status at a glance
- 📁 **Code operations**: read, write, patch, delete, and search files — all sandboxed to the project root
- 🌐 **Nginx & certificates**: config test & read, safe reload, certificate install & renewal
- 🔒 **Secure by design**: two-step confirmation for writes, command whitelist, path-traversal protection, auto redaction

## Installation

Requires Node.js 18+.

```bash
git clone https://github.com/GT-dinuo/server-ops-mcp.git
cd server-ops-mcp
npm install
npm run build
```

Build output goes to `dist/`; the entry point is `dist/index.js`.

## Configuration

In each project where you want to use this tool, create (or append to) `.mcp.json` and declare an MCP Server per environment. Local mode only needs `OPS_PROJECT_ROOT`; remote mode adds the SSH variables.

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

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPS_PROJECT_ROOT` | Yes | Project root path; all file operations are sandboxed here |
| `OPS_SSH_HOST` | No | Remote server IP / domain; leave empty to run locally |
| `OPS_SSH_PORT` | No | SSH port, default `22` |
| `OPS_SSH_USER` | No | SSH username |
| `OPS_SSH_KEY` | No | Path to SSH private key (choose either key or password) |
| `OPS_SSH_PASSWORD` | No | SSH password (choose either key or password) |
| `OPS_SSH_PASSPHRASE` | No | Private key passphrase |
| `OPS_CONFIG_PATH` | No | Path to an extra config file — see "Custom Configuration" |

## Usage

Once configured, just give ops instructions in natural language in your AI tool. The AI picks and calls the right tool automatically.

### Read-only operations (run directly)

```
Check the server's CPU, memory, and disk usage
Search for error-level logs from the last hour
List the project's log files
Read the Nginx config and check for problems
Find every place in the code that calls sendSms
```

### Write operations (require confirmation)

For writes, deletes, command execution, Nginx reload, certificate install, and similar, the tool first returns a `confirmationId`. The AI shows you exactly what will run, and it **only executes after you confirm**:

```
You: Reload nginx
AI: (calls nginx_reload, returns the pending action + confirmationId)
    About to run: nginx -s reload. Confirm?
You: Confirm
AI: (calls confirm_execute to run it)
```

`file_write`, `file_patch`, `file_delete`, `command_exec`, and similar all follow the same confirmation flow.

### Typical scenarios

- **Production troubleshooting**: "Why is the server memory full?" → `memory_analysis` + `log_search` working together
- **Routine inspection**: "Is the disk almost full? Which directory uses the most?" → `disk_analysis`
- **Security audit**: "Audit the project config for leaked secrets" → `config_audit` (output is auto-redacted)

## Tool List

### System Ops

| Tool | Description |
|------|-------------|
| `system_info` | CPU / memory / disk / load / processes |
| `memory_analysis` | Memory usage analysis |
| `disk_analysis` | Disk usage analysis |
| `service_status` | Service status |
| `log_search_system` | Search system logs |
| `nginx_config_test` | Test Nginx config |
| `nginx_config_read` | Read Nginx config |
| `nginx_reload` | Reload Nginx (requires confirmation) |
| `certbot_install` | Install certificate (requires confirmation) |
| `certbot_renew` | Renew certificate (requires confirmation) |

### Project Code

| Tool | Description |
|------|-------------|
| `log_list` | List project logs |
| `log_read` | Read a log |
| `log_search` | Search logs |
| `file_read` | Read a file |
| `file_list` | List a directory |
| `file_search` | Search code |
| `file_write` | Write a file (requires confirmation) |
| `file_patch` | Patch a file (requires confirmation) |
| `file_delete` | Delete a file (requires confirmation) |
| `command_exec` | Run whitelisted commands |
| `project_overview` | Project overview |
| `config_audit` | Audit config (auto-redacted) |
| `confirm_execute` | Confirm and run a pending action |

## Security

1. **Read-only tools** run directly.
2. **Writes, command execution, Nginx reload, certificate install** require two-step confirmation (`confirm_execute`).
3. Command execution uses a whitelist — dangerous operations like `rm -rf`, `sudo`, and piping into a shell are rejected.
4. File operations are sandboxed to `OPS_PROJECT_ROOT`; path traversal is blocked.
5. Passwords, tokens, and other secrets in `.env` files and logs are automatically redacted.

## Custom Configuration

Copy `config.example.json` to `config.json`, then point `OPS_CONFIG_PATH` at it to customize log channels, the command whitelist, read limits, and more.

```bash
cp config.example.json config.json
# After editing config.json, set in the .mcp.json env:
# "OPS_CONFIG_PATH": "/absolute/path/to/config.json"
```

Main fields of `config.example.json`:

- `logChannels`: channel name → log directory path (relative to project root)
- `maxReadLines` / `maxReadBytes`: per-read line / byte limits
- `commandWhitelist.direct`: commands that run directly
- `commandWhitelist.confirm`: commands that require confirmation

## Development

```bash
npm run dev    # watch mode, recompiles on change
npm run build  # build to dist/
npm run clean  # remove dist/
npm start      # run the built Server
```

## Notes

- Remote operations rely on SSH — use a **read-only account** or a tightly-scoped command whitelist for the AI.
- Private key files should have permission `600` (`chmod 600 ~/.ssh/id_rsa`).
- Never commit `.mcp.json` or `config.json` containing passwords to a repository.

## License

[MIT](./LICENSE) © 2026 server-ops-mcp
