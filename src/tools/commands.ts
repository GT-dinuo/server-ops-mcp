import { ToolDefinition } from './index.js';

const commandExec: ToolDefinition = {
  name: 'command_exec',
  description: '执行白名单内的安全命令（只读命令直接执行，非只读命令需确认）',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的命令' },
      cwd: { type: 'string', description: '执行目录（相对项目根目录）' },
    },
    required: ['command'],
  },
  requiresConfirmation: false,
  handler: async (args, { config, security, executor }) => {
    const command = (args.command as string).trim();
    const cwd = args.cwd ? `${config.projectRoot}/${args.cwd}` : config.projectRoot;

    if (security.isDirectCommand(command)) {
      const result = await executor.execute(command, cwd);
      return result.stdout || result.stderr || `exit code: ${result.exitCode}`;
    }

    try {
      security.validateCommand(command, 'confirm');
      // 命中 confirm 白名单，需要确认
      throw new Error('NEEDS_CONFIRMATION');
    } catch (err) {
      if ((err as Error).message === 'NEEDS_CONFIRMATION') {
        throw err;
      }
      throw new Error(`Command not allowed: ${command}`);
    }
  },
};

export { commandExec };
