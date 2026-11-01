// AetherOS - aesh Shell Command Registry
import type { RegisteredCommand } from './types';
import { fsCommands } from './commands/fsCommands';
import { sysCommands } from './commands/sysCommands';
import { textCommands } from './commands/textCommands';
import { netCommands } from './commands/netCommands';
import { devCommands } from './commands/devCommands';
import { pkgCommands } from './commands/pkgCommands';
import { scriptCommands } from './commands/scriptCommands';
import { gitCommands } from './commands/gitCommands';
import { pythonCommands } from './commands/pythonCommands';
import { tscCommands } from './commands/tscCommands';

export class CommandRegistry {
  private commands = new Map<string, RegisteredCommand>();

  constructor() {
    this.registerAll(fsCommands);
    this.registerAll(sysCommands);
    this.registerAll(textCommands);
    this.registerAll(netCommands);
    this.registerAll(devCommands);
    this.registerAll(pkgCommands);
    this.registerAll(scriptCommands);
    this.registerAll(gitCommands);
    this.registerAll(pythonCommands);
    this.registerAll(tscCommands);
  }

  public register(cmd: RegisteredCommand): void {
    this.commands.set(cmd.name, cmd);
  }

  public registerAll(cmds: RegisteredCommand[]): void {
    for (const c of cmds) {
      this.register(c);
    }
  }

  public get(name: string): RegisteredCommand | undefined {
    return this.commands.get(name);
  }

  public has(name: string): boolean {
    return this.commands.has(name);
  }

  public getAll(): RegisteredCommand[] {
    return Array.from(this.commands.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}

export const commandRegistry = new CommandRegistry();
