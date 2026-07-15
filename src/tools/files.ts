import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { dirname } from 'path';
import { ToolDefinition, ToolContext } from './index.js';

function resolvePath(security: ToolContext['security'], rawPath: string): string {
  return security.validatePath(rawPath);
}

async function readRemoteFile(
  executor: ToolContext['executor'],
  absPath: string,
  offset: number,
  limit: number
): Promise<string> {
  const start = offset + 1;
  const end = offset + limit;
  const result = await executor.execute(`sed -n '${start},${end}p' "${absPath}"`);
  if (result.exitCode !== 0) throw new Error(result.stderr || `exit code: ${result.exitCode}`);
  return result.stdout;
}

async function readLocalFile(absPath: string, offset: number, limit: number): Promise<string> {
  const content = readFileSync(absPath, 'utf-8');
  const lines = content.split('\n');
  return lines.slice(offset, offset + limit).join('\n');
}

async function listRemoteDir(executor: ToolContext['executor'], absPath: string): Promise<{ name: string; type: string }[]> {
  const result = await executor.execute(`ls -la "${absPath}"`);
  if (result.exitCode !== 0) throw new Error(result.stderr || `exit code: ${result.exitCode}`);

  return result.stdout
    .split('\n')
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split(/\s+/);
      const name = parts.slice(8).join(' ');
      const type = line.startsWith('d') ? 'directory' : 'file';
      return { name, type };
    })
    .filter((entry) => entry.name && entry.name !== '.' && entry.name !== '..');
}

async function listLocalDir(absPath: string): Promise<{ name: string; type: string }[]> {
  const { readdirSync } = await import('fs');
  return readdirSync(absPath, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'directory' : 'file',
  }));
}

async function searchRemoteFiles(
  executor: ToolContext['executor'],
  absPath: string,
  keyword: string,
  glob: string,
  maxLines: number
): Promise<{ file: string; line: number; text: string }[]> {
  const result = await executor.execute(
    `grep -R -n "${keyword.replace(/"/g, '\\"')}" "${absPath}" --include="${glob}" | head -n ${maxLines}`
  );
  return result.stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (!match) return null;
      return { file: match[1], line: parseInt(match[2], 10), text: match[3].trim() };
    })
    .filter(Boolean) as { file: string; line: number; text: string }[];
}

async function searchLocalFiles(
  absPath: string,
  keyword: string,
  glob: string,
  maxLines: number
): Promise<{ file: string; line: number; text: string }[]> {
  const { default: fg } = await import('fast-glob');
  const files = await fg(glob, {
    cwd: absPath,
    absolute: true,
    onlyFiles: true,
    ignore: ['node_modules/**', 'vendor/**', '.git/**', 'dist/**'],
  });

  const results: { file: string; line: number; text: string }[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({ file, line: idx + 1, text: line.trim() });
        }
      });
      if (results.length >= maxLines) break;
    } catch {
      // ignore
    }
  }
  return results.slice(0, maxLines);
}

function isRemote(config: ToolContext['config']): boolean {
  return Boolean(config.ssh?.host);
}

const fileRead: ToolDefinition = {
  name: 'file_read',
  description: '读取项目文件内容',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径（相对项目根目录或绝对路径）' },
      offset: { type: 'number', default: 0 },
      limit: { type: 'number', default: 500 },
    },
    required: ['path'],
  },
  requiresConfirmation: false,
  handler: async (args, { config, security, executor }) => {
    const absPath = resolvePath(security, args.path as string);
    const limit = Math.min((args.limit as number) || 500, config.maxReadLines);
    const offset = (args.offset as number) || 0;

    if (isRemote(config)) {
      return readRemoteFile(executor, absPath, offset, limit);
    }

    if (!existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
    if (statSync(absPath).isDirectory()) throw new Error('Path is a directory');
    return readLocalFile(absPath, offset, limit);
  },
};

const fileList: ToolDefinition = {
  name: 'file_list',
  description: '列出项目目录内容',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', default: '', description: '目录路径（相对项目根目录）' },
    },
  },
  requiresConfirmation: false,
  handler: async (args, { config, security, executor }) => {
    const relPath = (args.path as string) || '';
    const absPath = resolvePath(security, relPath);

    if (isRemote(config)) {
      return listRemoteDir(executor, absPath);
    }

    if (!existsSync(absPath)) throw new Error(`Directory not found: ${absPath}`);
    if (!statSync(absPath).isDirectory()) throw new Error('Path is not a directory');
    return listLocalDir(absPath);
  },
};

const fileSearch: ToolDefinition = {
  name: 'file_search',
  description: '在项目文件中搜索内容',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string' },
      glob: { type: 'string', default: '**/*', description: '文件匹配模式' },
      lines: { type: 'number', default: 50 },
    },
    required: ['keyword'],
  },
  requiresConfirmation: false,
  handler: async (args, { config, security, executor }) => {
    const keyword = args.keyword as string;
    const glob = args.glob as string;
    const maxLines = (args.lines as number) || 50;
    const absPath = resolvePath(security, '');

    if (isRemote(config)) {
      return searchRemoteFiles(executor, absPath, keyword, glob, maxLines);
    }
    return searchLocalFiles(absPath, keyword, glob, maxLines);
  },
};

const fileWrite: ToolDefinition = {
  name: 'file_write',
  description: '写入或创建项目文件',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      append: { type: 'boolean', default: false },
    },
    required: ['path', 'content'],
  },
  requiresConfirmation: true,
  summarize: (args) => `写入文件 ${args.path}`,
  handler: async (args, { config, security, executor }) => {
    const absPath = resolvePath(security, args.path as string);
    const content = args.content as string;
    const append = args.append ? '>>' : '>';

    if (isRemote(config)) {
      const base64 = Buffer.from(content, 'utf-8').toString('base64');
      const result = await executor.execute(`mkdir -p "${dirname(absPath)}" && echo "${base64}" | base64 -d ${append} "${absPath}"`);
      if (result.exitCode !== 0) throw new Error(result.stderr || `exit code: ${result.exitCode}`);
      return `File written: ${absPath}`;
    }

    const dir = dirname(absPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (args.append) {
      const { appendFileSync } = await import('fs');
      appendFileSync(absPath, content, 'utf-8');
    } else {
      writeFileSync(absPath, content, 'utf-8');
    }
    return `File written: ${absPath}`;
  },
};

const filePatch: ToolDefinition = {
  name: 'file_patch',
  description: '对项目文件进行局部替换修改',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldString: { type: 'string' },
      newString: { type: 'string' },
    },
    required: ['path', 'oldString', 'newString'],
  },
  requiresConfirmation: true,
  summarize: (args) => `修改文件 ${args.path}`,
  handler: async (args, { config, security, executor }) => {
    const absPath = resolvePath(security, args.path as string);
    const oldString = args.oldString as string;
    const newString = args.newString as string;

    let content: string;
    if (isRemote(config)) {
      const result = await executor.execute(`cat "${absPath}"`);
      if (result.exitCode !== 0) throw new Error(result.stderr || `exit code: ${result.exitCode}`);
      content = result.stdout;
    } else {
      if (!existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
      content = readFileSync(absPath, 'utf-8');
    }

    if (!content.includes(oldString)) throw new Error('oldString not found in file');
    const newContent = content.split(oldString).join(newString);

    if (isRemote(config)) {
      const base64 = Buffer.from(newContent, 'utf-8').toString('base64');
      const result = await executor.execute(`echo "${base64}" | base64 -d > "${absPath}"`);
      if (result.exitCode !== 0) throw new Error(result.stderr || `exit code: ${result.exitCode}`);
    } else {
      writeFileSync(absPath, newContent, 'utf-8');
    }

    return `File patched: ${absPath}`;
  },
};

const fileDelete: ToolDefinition = {
  name: 'file_delete',
  description: '删除项目文件',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
    required: ['path'],
  },
  requiresConfirmation: true,
  summarize: (args) => `删除文件 ${args.path}`,
  handler: async (args, { config, security, executor }) => {
    const absPath = resolvePath(security, args.path as string);

    if (isRemote(config)) {
      const result = await executor.execute(`rm "${absPath}"`);
      if (result.exitCode !== 0) throw new Error(result.stderr || `exit code: ${result.exitCode}`);
      return `File deleted: ${absPath}`;
    }

    if (!existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
    if (statSync(absPath).isDirectory()) throw new Error('Use shell command to delete directories');
    unlinkSync(absPath);
    return `File deleted: ${absPath}`;
  },
};

export { fileRead, fileList, fileSearch, fileWrite, filePatch, fileDelete };
