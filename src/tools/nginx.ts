import { ToolDefinition } from './index.js';

const nginxConfigTest: ToolDefinition = {
  name: 'nginx_config_test',
  description: '测试 Nginx 配置文件语法',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  requiresConfirmation: false,
  handler: async (_args, { executor }) => {
    const result = await executor.execute('nginx -t');
    return result.stdout || result.stderr || `exit code: ${result.exitCode}`;
  },
};

const nginxConfigRead: ToolDefinition = {
  name: 'nginx_config_read',
  description: '读取 Nginx 配置文件',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        default: '/etc/nginx/nginx.conf',
        description: 'Nginx 配置文件路径',
      },
    },
  },
  requiresConfirmation: false,
  handler: async (args, { executor }) => {
    const absPath = args.path as string;
    const result = await executor.execute(`cat "${absPath}"`);
    if (result.exitCode !== 0) throw new Error(result.stderr || `exit code: ${result.exitCode}`);
    return result.stdout;
  },
};

const nginxReload: ToolDefinition = {
  name: 'nginx_reload',
  description: '重载 Nginx 配置',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  requiresConfirmation: true,
  summarize: () => '重载 Nginx 配置',
  handler: async (_args, { executor }) => {
    const result = await executor.execute('nginx -s reload');
    return result.stdout || result.stderr || `exit code: ${result.exitCode}`;
  },
};

export { nginxConfigTest, nginxConfigRead, nginxReload };
