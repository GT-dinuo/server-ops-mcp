import { ToolDefinition } from './index.js';

const confirmExecute: ToolDefinition = {
  name: 'confirm_execute',
  description: '确认并执行需要二次确认的操作（如 file_write、file_delete、nginx_reload 等）',
  inputSchema: {
    type: 'object',
    properties: {
      confirmationId: {
        type: 'string',
        description: '需要确认的操作 ID，由之前的工具调用返回',
      },
    },
    required: ['confirmationId'],
  },
  requiresConfirmation: false,
  handler: async () => {
    throw new Error('confirm_execute 应由 server 直接处理');
  },
};

export { confirmExecute };
