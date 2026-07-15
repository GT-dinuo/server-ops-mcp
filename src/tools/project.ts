import { existsSync, readFileSync } from 'fs';
import { ToolDefinition } from './index.js';
import { maskSecrets } from '../security.js';

const projectOverview: ToolDefinition = {
  name: 'project_overview',
  description: '查看项目概览：技术栈、Git 状态、分支、最近提交',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  requiresConfirmation: false,
  handler: async (_args, { config, executor }) => {
    const parts: string[] = [];
    const commands = [
      'git status --short',
      'git branch',
      'git log --oneline -10',
    ];

    for (const cmd of commands) {
      const result = await executor.execute(cmd, config.projectRoot);
      parts.push(`=== ${cmd} ===`);
      parts.push(result.stdout || result.stderr || `exit code: ${result.exitCode}`);
    }

    return parts.join('\n');
  },
};

const configAudit: ToolDefinition = {
  name: 'config_audit',
  description: '审计项目配置文件（自动脱敏）',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        default: 'server/.env',
        description: '配置文件相对项目根目录的路径',
      },
    },
  },
  requiresConfirmation: false,
  handler: async (args, { config, security }) => {
    const absPath = security.validatePath(args.file as string);
    if (!existsSync(absPath)) throw new Error(`File not found: ${absPath}`);

    const content = readFileSync(absPath, 'utf-8');
    return maskSecrets(content);
  },
};

export { projectOverview, configAudit };
