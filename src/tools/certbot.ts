import { ToolDefinition } from './index.js';

const certbotInstall: ToolDefinition = {
  name: 'certbot_install',
  description: '为指定域名申请并安装 Let\'s Encrypt 证书',
  inputSchema: {
    type: 'object',
    properties: {
      domains: {
        type: 'array',
        items: { type: 'string' },
        description: '域名列表',
      },
      plugin: { type: 'string', default: 'nginx', enum: ['nginx', 'standalone'], description: 'certbot 插件' },
    },
    required: ['domains'],
  },
  requiresConfirmation: true,
  summarize: (args) => `为域名 ${(args.domains as string[]).join(', ')} 安装证书`,
  handler: async (args, { executor }) => {
    const domains = args.domains as string[];
    const plugin = (args.plugin as string) || 'nginx';
    const domainArgs = domains.map((d) => `-d ${d}`).join(' ');
    const result = await executor.execute(`certbot --${plugin} ${domainArgs}`);
    return result.stdout || result.stderr || `exit code: ${result.exitCode}`;
  },
};

const certbotRenew: ToolDefinition = {
  name: 'certbot_renew',
  description: '手动触发 certbot 证书续期',
  inputSchema: {
    type: 'object',
    properties: {
      dryRun: { type: 'boolean', default: false, description: '是否模拟运行' },
    },
  },
  requiresConfirmation: true,
  summarize: (args) => args.dryRun ? '模拟证书续期' : '手动触发证书续期',
  handler: async (args, { executor }) => {
    const dryRun = args.dryRun ? '--dry-run' : '';
    const result = await executor.execute(`certbot renew ${dryRun}`.trim());
    return result.stdout || result.stderr || `exit code: ${result.exitCode}`;
  },
};

export { certbotInstall, certbotRenew };
