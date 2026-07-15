import { Config } from '../config.js';
import { SecurityService } from '../security.js';
import { CommandExecutor } from '../executor.js';

export interface ToolContext {
  config: Config;
  security: SecurityService;
  executor: CommandExecutor;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
  summarize?: (args: Record<string, unknown>) => string;
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
}

import * as system from './system.js';
import * as logs from './logs.js';
import * as files from './files.js';
import * as commands from './commands.js';
import * as nginx from './nginx.js';
import * as certbot from './certbot.js';
import * as project from './project.js';
import * as confirm from './confirm.js';

export const ALL_TOOLS: ToolDefinition[] = [
  system.systemInfo,
  system.memoryAnalysis,
  system.diskAnalysis,
  system.serviceStatus,
  system.logSearchSystem,
  logs.logList,
  logs.logRead,
  logs.logSearch,
  files.fileRead,
  files.fileList,
  files.fileSearch,
  files.fileWrite,
  files.filePatch,
  files.fileDelete,
  commands.commandExec,
  nginx.nginxConfigTest,
  nginx.nginxConfigRead,
  nginx.nginxReload,
  certbot.certbotInstall,
  certbot.certbotRenew,
  project.projectOverview,
  project.configAudit,
  confirm.confirmExecute,
];

export const TOOL_REGISTRY = new Map<string, ToolDefinition>(
  ALL_TOOLS.map((t) => [t.name, t])
);
