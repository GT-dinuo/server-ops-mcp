import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';

const sshSchema = z.object({
  host: z.string().optional(),
  port: z.number().int().default(22),
  username: z.string().optional(),
  privateKeyPath: z.string().optional(),
  password: z.string().optional(),
  passphrase: z.string().optional(),
});

const configSchema = z.object({
  projectRoot: z.string().min(1),
  ssh: sshSchema.optional(),
  maxReadLines: z.number().int().default(5000),
  maxReadBytes: z.number().int().default(2 * 1024 * 1024),
  commandWhitelist: z.object({
    direct: z.array(z.string()).default([]),
    confirm: z.array(z.string()).default([]),
  }).default({ direct: [], confirm: [] }),
  logChannels: z.record(z.string()).default({}),
});

export type Config = z.infer<typeof configSchema>;

const defaultLogChannels: Record<string, string> = {
  default: 'logs',
};

const defaultDirectWhitelist = [
  'git status',
  'git log --oneline -{n}',
  'git branch',
  'git diff --stat',
  'php think list',
  'php think version',
  'df -h',
  'du -sh {path}',
  'free -h',
  'ps aux',
  'top -bn1',
  'uname -a',
  'ls -la {path}',
  'cat {path}',
  'nginx -t',
  'nginx -v',
  'systemctl status {service}',
  'journalctl -u {service} --no-pager -n {n}',
];

const defaultConfirmWhitelist = [
  'git pull',
  'git fetch',
  'git checkout {branch}',
  'git reset --hard {ref}',
  'php think {command}',
  'npm run {script}',
  'pnpm run {script}',
  'nginx -s reload',
  'systemctl restart {service}',
  'systemctl reload {service}',
  'certbot --nginx -d {domains}',
  'certbot renew',
  'rm {path}',
];

export function loadConfig(): Config {
  const projectRoot = process.env.OPS_PROJECT_ROOT;
  if (!projectRoot) {
    throw new Error('Missing required environment variable: OPS_PROJECT_ROOT');
  }

  const sshHost = process.env.OPS_SSH_HOST;
  const sshConfig = sshHost
    ? {
        host: sshHost,
        port: parseInt(process.env.OPS_SSH_PORT || '22', 10),
        username: process.env.OPS_SSH_USER,
        privateKeyPath: process.env.OPS_SSH_KEY,
        password: process.env.OPS_SSH_PASSWORD,
        passphrase: process.env.OPS_SSH_PASSPHRASE,
      }
    : undefined;

  let extraConfig: Partial<Config> = {};
  const configPath = process.env.OPS_CONFIG_PATH;
  if (configPath && existsSync(configPath)) {
    try {
      extraConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (err) {
      console.error(`Failed to parse config file ${configPath}:`, err);
    }
  }

  const merged = {
    projectRoot,
    ssh: sshConfig,
    maxReadLines: parseInt(process.env.OPS_MAX_READ_LINES || '5000', 10),
    maxReadBytes: parseInt(process.env.OPS_MAX_READ_BYTES || '2097152', 10),
    commandWhitelist: {
      direct: extraConfig.commandWhitelist?.direct ?? defaultDirectWhitelist,
      confirm: extraConfig.commandWhitelist?.confirm ?? defaultConfirmWhitelist,
    },
    logChannels: extraConfig.logChannels ?? defaultLogChannels,
  };

  return configSchema.parse(merged);
}
