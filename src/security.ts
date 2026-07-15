import { createHash, randomUUID } from 'crypto';
import { realpathSync } from 'fs';
import { Config } from './config.js';

export interface PendingOperation {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  requestedAt: number;
  expiresAt: number;
}

const BLACKLIST_PATTERNS = [
  /\brm\s+-rf?\b/i,
  /\bdd\b/,
  /\bmkfs\b/,
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\bfdisk\b/,
  />\s*\/dev\/[sh]d[a-z]/,
  /\bsudo\s+/,
  /\bcurl\s+.*\|\s*sh\b/i,
  /\bwget\s+.*\|\s*sh\b/i,
  /[;&|`$()]/,
];

export class SecurityService {
  private pending = new Map<string, PendingOperation>();

  constructor(private config: Config) {}

  assertInsideProject(absPath: string): void {
    if (this.config.ssh?.host) {
      if (!absPath.startsWith(this.config.projectRoot)) {
        throw new Error(`Path outside project sandbox: ${absPath}`);
      }
      return;
    }

    let real: string;
    try {
      real = realpathSync(absPath);
    } catch {
      real = absPath;
    }
    const root = realpathSync(this.config.projectRoot);
    if (!real.startsWith(root)) {
      throw new Error(`Path outside project sandbox: ${absPath}`);
    }
  }

  validatePath(path: string): string {
    if (path.includes('..')) {
      throw new Error('Relative path traversal is not allowed');
    }
    const abs = path.startsWith('/') ? path : `${this.config.projectRoot}/${path}`;
    this.assertInsideProject(abs);
    return abs;
  }

  validateCommand(cmd: string, mode: 'direct' | 'confirm'): void {
    if (BLACKLIST_PATTERNS.some((p) => p.test(cmd))) {
      throw new Error(`Command blocked by security policy: ${cmd}`);
    }
    const patterns = this.config.commandWhitelist[mode];
    if (!patterns.some((pattern) => this.matchPattern(pattern, cmd))) {
      throw new Error(`Command not in ${mode} whitelist: ${cmd}`);
    }
  }

  isDirectCommand(cmd: string): boolean {
    try {
      this.validateCommand(cmd, 'direct');
      return true;
    } catch {
      return false;
    }
  }

  stageConfirmation(tool: string, args: Record<string, unknown>): string {
    const id = randomUUID();
    const now = Date.now();
    this.pending.set(id, {
      id,
      tool,
      args,
      requestedAt: now,
      expiresAt: now + 5 * 60 * 1000,
    });
    return id;
  }

  getPending(id: string): PendingOperation | undefined {
    const op = this.pending.get(id);
    if (!op) return undefined;
    if (Date.now() > op.expiresAt) {
      this.pending.delete(id);
      return undefined;
    }
    return op;
  }

  removePending(id: string): void {
    this.pending.delete(id);
  }

  private matchPattern(pattern: string, cmd: string): boolean {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\\{[a-zA-Z_]+\\}/g, '([\\w/.:@-]+)');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(cmd);
  }
}

export function maskSecrets(text: string): string {
  return text
    .replace(/PASSWORD\s*=\s*["']?[^"'\n]+/gi, 'PASSWORD = "***"')
    .replace(/DB_PASSWORD\s*=\s*["']?[^"'\n]+/gi, 'DB_PASSWORD = "***"')
    .replace(/REDIS_PASSWORD\s*=\s*["']?[^"'\n]+/gi, 'REDIS_PASSWORD = "***"')
    .replace(/TOKEN\s*=\s*["']?[^"'\n]+/gi, 'TOKEN = "***"')
    .replace(/SECRET\s*=\s*["']?[^"'\n]+/gi, 'SECRET = "***"')
    .replace(/privateKeyPath\s*[:=]\s*["']?[^"'\n]+/gi, 'privateKeyPath = "***"')
    .replace(/password\s*[:=]\s*["']?[^"'\n]+/gi, 'password = "***"');
}

export function computeArgsHash(tool: string, args: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify({ tool, args })).digest('hex');
}
