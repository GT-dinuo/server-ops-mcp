import { ToolDefinition, ToolContext } from './index.js';

const runSimple = async (
  executor: ToolContext['executor'],
  command: string,
  cwd?: string
): Promise<string> => {
  const result = await executor.execute(command, cwd);
  return result.stdout || result.stderr || `exit code: ${result.exitCode}`;
};

const systemInfo: ToolDefinition = {
  name: 'system_info',
  description: '查看系统 CPU、内存、磁盘、负载和进程信息',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['all', 'cpu', 'memory', 'disk', 'load', 'processes'],
        default: 'all',
      },
    },
  },
  requiresConfirmation: false,
  handler: async (args, { executor }) => {
    const type = (args.type as string) || 'all';
    const parts: string[] = [];

    if (type === 'all' || type === 'cpu') {
      parts.push('=== CPU ===');
      const cpu = await runSimple(executor, 'top -bn1');
      parts.push(cpu.split('\n').slice(0, 20).join('\n'));
    }
    if (type === 'all' || type === 'memory') {
      parts.push('=== Memory ===');
      parts.push(await runSimple(executor, 'free -h'));
      parts.push('=== Swap ===');
      parts.push(await runSimple(executor, 'swapon --show'));
    }
    if (type === 'all' || type === 'disk') {
      parts.push('=== Disk ===');
      parts.push(await runSimple(executor, 'df -h'));
    }
    if (type === 'all' || type === 'load') {
      parts.push('=== Load ===');
      parts.push(await runSimple(executor, 'uptime'));
    }
    if (type === 'all' || type === 'processes') {
      parts.push('=== Top Processes ===');
      const procs = await runSimple(executor, 'ps aux --sort=-%mem');
      parts.push(procs.split('\n').slice(0, 20).join('\n'));
    }

    return parts.join('\n');
  },
};

const memoryAnalysis: ToolDefinition = {
  name: 'memory_analysis',
  description: '分析内存占用，找出占用内存最高的进程和 OOM 风险',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  requiresConfirmation: false,
  handler: async (_args, { executor }) => {
    const parts: string[] = [];

    parts.push('=== Memory Summary ===');
    parts.push(await runSimple(executor, 'free -h'));

    parts.push('=== Swap ===');
    parts.push(await runSimple(executor, 'swapon --show'));

    parts.push('=== Top Memory Processes ===');
    const procs = await runSimple(executor, 'ps aux --sort=-%mem');
    parts.push(procs.split('\n').slice(0, 20).join('\n'));

    parts.push('=== OOM Killer History ===');
    const dmesg = await runSimple(executor, 'dmesg');
    const oomLines = dmesg.split('\n').filter((line) => line.toLowerCase().includes('out of memory')).slice(-10);
    parts.push(oomLines.length ? oomLines.join('\n') : 'No OOM records in dmesg');

    return parts.join('\n');
  },
};

const diskAnalysis: ToolDefinition = {
  name: 'disk_analysis',
  description: '分析磁盘占用，找出大文件和大目录',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', default: '/' },
      depth: { type: 'number', default: 1 },
    },
  },
  requiresConfirmation: false,
  handler: async (args, { executor }) => {
    const path = (args.path as string) || '/';
    const depth = (args.depth as number) || 1;
    const parts: string[] = [];

    parts.push(`=== Disk Usage: ${path} ===`);
    parts.push(await runSimple(executor, `df -h ${path}`));

    parts.push('=== Top Directories ===');
    const du = await runSimple(executor, `du -h -d ${depth} ${path}`);
    const lines = du.split('\n').filter((line) => line.trim()).sort((a, b) => {
      const sizeA = parseFloat(a.split('\t')[0]);
      const sizeB = parseFloat(b.split('\t')[0]);
      return sizeB - sizeA;
    });
    parts.push(lines.slice(0, 20).join('\n'));

    return parts.join('\n');
  },
};

const serviceStatus: ToolDefinition = {
  name: 'service_status',
  description: '查看指定服务状态（nginx、php-fpm、mysql、redis 等）',
  inputSchema: {
    type: 'object',
    properties: {
      service: { type: 'string', description: '服务名，如 nginx、php-fpm、mysql、redis' },
    },
    required: ['service'],
  },
  requiresConfirmation: false,
  handler: async (args, { executor }) => {
    const service = args.service as string;
    return runSimple(executor, `systemctl status ${service} --no-pager`);
  },
};

const logSearchSystem: ToolDefinition = {
  name: 'log_search_system',
  description: '搜索系统日志（journalctl）',
  inputSchema: {
    type: 'object',
    properties: {
      service: { type: 'string', description: '服务名' },
      keyword: { type: 'string' },
      lines: { type: 'number', default: 50 },
    },
    required: ['service'],
  },
  requiresConfirmation: false,
  handler: async (args, { executor }) => {
    const service = args.service as string;
    const lines = (args.lines as number) || 50;
    const keyword = args.keyword as string | undefined;

    const result = await executor.execute(`journalctl -u ${service} --no-pager -n ${lines}`);
    let output = result.stdout || result.stderr || `exit code: ${result.exitCode}`;

    if (keyword) {
      output = output
        .split('\n')
        .filter((line) => line.toLowerCase().includes(keyword.toLowerCase()))
        .join('\n');
    }

    return output;
  },
};

export { systemInfo, memoryAnalysis, diskAnalysis, serviceStatus, logSearchSystem };
