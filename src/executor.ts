import { spawn } from 'child_process';
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { Config } from './config.js';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type SshConfig = NonNullable<Config['ssh']>;

export class CommandExecutor {
  private targetClient?: Client;
  private sshReady = false;

  constructor(private config: Config) {}

  async execute(command: string, cwd?: string): Promise<ExecResult> {
    if (this.config.ssh?.host) {
      return this.executeRemote(command, cwd);
    }
    return this.executeLocal(command, cwd || this.config.projectRoot);
  }

  private executeLocal(command: string, cwd: string): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(/\s+/);
      const child = spawn(cmd, args, {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8');
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  }

  private async executeRemote(command: string, cwd?: string): Promise<ExecResult> {
    await this.ensureSshConnection();
    const fullCommand = cwd ? `cd ${cwd} && ${command}` : command;

    return new Promise((resolve, reject) => {
      this.targetClient!.exec(fullCommand, (err, stream) => {
        if (err) return reject(err);

        let stdout = '';
        let stderr = '';

        stream.on('close', (code: number) => {
          resolve({ stdout, stderr, exitCode: code });
        });
        stream.on('data', (data: Buffer) => {
          stdout += data.toString('utf-8');
        });
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
        });
      });
    });
  }

  private async ensureSshConnection(): Promise<void> {
    if (this.sshReady && this.targetClient) return;

    const ssh = this.config.ssh;
    if (!ssh?.host) {
      throw new Error('SSH not configured');
    }

    this.targetClient = await this.connectSsh(ssh);
    this.sshReady = true;
  }

  private connectSsh(ssh: SshConfig): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      client
        .on('ready', () => resolve(client))
        .on('error', (err) => reject(new Error(`SSH error: ${err.message}`)))
        .connect(this.buildSshConfig(ssh));
    });
  }

  private buildSshConfig(ssh: SshConfig): Record<string, unknown> {
    const config: Record<string, unknown> = {
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      readyTimeout: 20000,
    };

    if (ssh.privateKeyPath) {
      config.privateKey = readFileSync(ssh.privateKeyPath);
      if (ssh.passphrase) {
        config.passphrase = ssh.passphrase;
      }
    } else if (ssh.password) {
      config.password = ssh.password;
    } else {
      throw new Error('SSH authentication requires either privateKeyPath or password');
    }

    return config;
  }

  async dispose(): Promise<void> {
    if (this.targetClient) {
      this.targetClient.end();
      this.targetClient = undefined;
    }
    this.sshReady = false;
  }
}
