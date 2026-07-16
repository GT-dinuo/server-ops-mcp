import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  TextContent,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { SecurityService, maskSecrets } from './security.js';
import { CommandExecutor } from './executor.js';
import { ALL_TOOLS, TOOL_REGISTRY, ToolContext, ToolDefinition } from './tools/index.js';

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8')
) as { version: string };

export class OpsMcpServer {
  private server: Server;
  private security: SecurityService;
  private executor: CommandExecutor;
  private config: ReturnType<typeof loadConfig>;

  constructor() {
    this.config = loadConfig();
    this.security = new SecurityService(this.config);
    this.executor = new CommandExecutor(this.config);

    this.server = new Server(
      { name: 'server-ops-mcp', version: packageJson.version },
      { capabilities: { tools: {} } }
    );

    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = ALL_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })) as Tool[];
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const context: ToolContext = {
        config: this.config,
        security: this.security,
        executor: this.executor,
      };
      let tool: ToolDefinition | undefined;

      try {
        if (name === 'confirm_execute') {
          return await this.handleConfirm(args as { confirmationId: string });
        }

        tool = TOOL_REGISTRY.get(name);
        if (!tool) {
          return this.error(`Unknown tool: ${name}`);
        }

        if (tool.requiresConfirmation) {
          const confirmationId = this.security.stageConfirmation(name, args as Record<string, unknown>);
          const summary = tool.summarize ? tool.summarize(args as Record<string, unknown>) : JSON.stringify(args);
          return this.text(
            `此操作需要确认：\n\nTool: ${name}\n参数: ${summary}\n\n` +
              `请调用 confirm_execute 并传入 confirmationId: "${confirmationId}" 以执行。`
          );
        }

        const result = await tool.handler(args as Record<string, unknown>, context);
        return this.text(maskSecrets(this.stringifyResult(result)));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'NEEDS_CONFIRMATION') {
          const confirmationId = this.security.stageConfirmation(name, args as Record<string, unknown>);
          const summary = tool?.summarize ? tool.summarize(args as Record<string, unknown>) : JSON.stringify(args);
          return this.text(
            `此操作需要确认：\n\nTool: ${name}\n参数: ${summary}\n\n` +
              `请调用 confirm_execute 并传入 confirmationId: "${confirmationId}" 以执行。`
          );
        }
        return this.error(maskSecrets(message));
      }
    });
  }

  private async handleConfirm(args: { confirmationId: string }): Promise<{ content: TextContent[]; isError?: boolean }> {
    const op = this.security.getPending(args.confirmationId);
    if (!op) {
      return this.error('确认已过期或不存在，请重新发起操作。');
    }

    const tool = TOOL_REGISTRY.get(op.tool);
    if (!tool) {
      return this.error(`Unknown tool: ${op.tool}`);
    }

    try {
      const context: ToolContext = {
        config: this.config,
        security: this.security,
        executor: this.executor,
      };
      const result = await tool.handler(op.args, context);
      this.security.removePending(op.id);
      return this.text(maskSecrets(this.stringifyResult(result)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.error(maskSecrets(message));
    }
  }

  private text(text: string): { content: TextContent[] } {
    return { content: [{ type: 'text', text }] };
  }

  private error(text: string): { content: TextContent[]; isError: true } {
    return { content: [{ type: 'text', text }], isError: true };
  }

  private stringifyResult(result: unknown): string {
    if (typeof result === 'string') return result;
    return JSON.stringify(result, null, 2);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
