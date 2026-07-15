#!/usr/bin/env node
import { OpsMcpServer } from './server.js';

async function main(): Promise<void> {
  const server = new OpsMcpServer();
  await server.run();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
