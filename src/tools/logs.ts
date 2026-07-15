import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import glob from 'fast-glob';
import { ToolDefinition, ToolContext } from './index.js';

function resolveLogPath(channelPath: string, projectRoot: string): string {
  return channelPath.startsWith('/') ? channelPath : resolve(projectRoot, channelPath);
}

async function findLogFiles(
  channel: string,
  projectRoot: string,
  channels: Record<string, string>,
  executor?: ToolContext['executor']
): Promise<string[]> {
  const channelPath = channels[channel] || channels.default;
  const base = resolveLogPath(channelPath, projectRoot);

  if (executor) {
    const result = await executor.execute(`find "${base}" -type f -name '*.log'`);
    if (result.exitCode !== 0) return [];
    return result.stdout.split('\n').filter((line) => line.trim()).sort();
  }

  if (!existsSync(base)) return [];
  const entries = glob.sync('**/*.log', {
    cwd: base,
    absolute: true,
    onlyFiles: true,
  });
  return entries.sort();
}

function isRemote(config: ToolContext['config']): boolean {
  return Boolean(config.ssh?.host);
}

const logList: ToolDefinition = {
  name: 'log_list',
  description: '列出项目日志文件',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: '日志通道名，对应配置中的 logChannels，留空使用 default',
        default: 'default',
      },
    },
  },
  requiresConfirmation: false,
  handler: async (args, { config, executor }) => {
    const channel = (args.channel as string) || 'default';
    const files = await findLogFiles(channel, config.projectRoot, config.logChannels, isRemote(config) ? executor : undefined);

    if (isRemote(config)) {
      return files.map((f) => ({ path: f }));
    }

    return files.map((f) => ({ path: f, size: statSync(f).size }));
  },
};

const logRead: ToolDefinition = {
  name: 'log_read',
  description: '读取指定日志文件',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '日志文件绝对路径或相对项目根目录的路径' },
      offset: { type: 'number', default: 0 },
      limit: { type: 'number', default: 500 },
    },
    required: ['path'],
  },
  requiresConfirmation: false,
  handler: async (args, { config, security, executor }) => {
    const rawPath = args.path as string;
    const absPath = security.validatePath(rawPath);
    const limit = Math.min((args.limit as number) || 500, config.maxReadLines);
    const offset = (args.offset as number) || 0;

    if (isRemote(config)) {
      const start = offset + 1;
      const end = offset + limit;
      const result = await executor.execute(`sed -n '${start},${end}p' "${absPath}"`);
      if (result.exitCode !== 0) throw new Error(result.stderr || `exit code: ${result.exitCode}`);
      return result.stdout;
    }

    if (!existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
    const content = readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(offset, offset + limit).join('\n');
  },
};

const logSearch: ToolDefinition = {
  name: 'log_search',
  description: '在项目日志中搜索关键词',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', default: 'default' },
      keyword: { type: 'string' },
      level: { type: 'string', description: '日志级别，如 error、warning、info' },
      lines: { type: 'number', default: 100 },
    },
    required: ['keyword'],
  },
  requiresConfirmation: false,
  handler: async (args, { config, executor }) => {
    const channel = (args.channel as string) || 'default';
    const keyword = args.keyword as string;
    const level = args.level as string | undefined;
    const maxLines = (args.lines as number) || 100;

    const files = await findLogFiles(channel, config.projectRoot, config.logChannels, isRemote(config) ? executor : undefined);
    const results: { file: string; line: number; text: string }[] = [];

    for (const file of files) {
      let content: string;
      if (isRemote(config)) {
        const result = await executor.execute(`cat "${file}"`);
        content = result.stdout;
      } else {
        content = readFileSync(file, 'utf-8');
      }

      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const matchKeyword = line.toLowerCase().includes(keyword.toLowerCase());
        const matchLevel = level ? line.toLowerCase().includes(`[${level.toLowerCase()}]`) : true;
        if (matchKeyword && matchLevel) {
          results.push({ file, line: idx + 1, text: line });
        }
      });
      if (results.length >= maxLines) break;
    }

    return results.slice(0, maxLines);
  },
};

export { logList, logRead, logSearch };
