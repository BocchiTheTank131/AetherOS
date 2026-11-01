// AetherOS - Git CLI Command for aesh
import type { RegisteredCommand, ExecutionResult } from '../types';
import { gitService } from '../../git/GitService';
import { vfs } from '../../vfs/vfs';

export const gitCommands: RegisteredCommand[] = [
  {
    name: 'git',
    description: 'Local Git version control system',
    usage: 'git <command> [args...]',
    manual: `git - the stupid content tracker

Commands:
  init [directory]         Create an empty Git repository or reinitialize an existing one
  status                   Show the working tree status
  add <pathspec...>        Add file contents to the index
  commit -m <msg>          Record changes to the repository
  log [-n <count>]         Show commit logs
  diff [path]              Show changes between commits, commit and working tree, etc
  branch [name]            List, create, or delete branches
  checkout <branch>        Switch branches or restore working tree files
  switch <branch>          Switch branches
  restore <file>           Restore working tree files`,
    execute: async (args, context): Promise<ExecutionResult> => {
      const subcommand = args[0];
      const cwd = context.cwd;

      if (!subcommand) {
        return {
          stdout: '',
          stderr: 'usage: git [--version] [--help] <command> [<args>]\n',
          exitCode: 1,
        };
      }

      if (subcommand === '--version') {
        return {
          stdout: 'git version 2.43.0.isomorphic (AetherOS)\n',
          stderr: '',
          exitCode: 0,
        };
      }

      // git init [dir]
      if (subcommand === 'init') {
        const targetDir = args[1] ? vfs.resolve(cwd, args[1]) : cwd;
        try {
          await gitService.init(targetDir);
          return {
            stdout: `Initialized empty Git repository in ${targetDir}/.git/\n`,
            stderr: '',
            exitCode: 0,
          };
        } catch (err) {
          return {
            stdout: '',
            stderr: `git init error: ${(err as Error).message}\n`,
            exitCode: 1,
          };
        }
      }

      // Check if inside a repo
      const isRepo = await gitService.isRepo(cwd);
      if (!isRepo) {
        return {
          stdout: '',
          stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
          exitCode: 128,
        };
      }

      // git status
      if (subcommand === 'status') {
        try {
          const summary = await gitService.status(cwd);
          let out = `On branch ${summary.branch}\n`;

          if (summary.isClean) {
            out += 'nothing to commit, working tree clean\n';
            return { stdout: out, stderr: '', exitCode: 0 };
          }

          if (summary.staged.length > 0) {
            out += '\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)\n';
            for (const s of summary.staged) {
              const label = s.status === 'added' ? 'new file:   ' : s.status === 'deleted' ? 'deleted:    ' : 'modified:   ';
              out += `\t\x1b[32m${label}${s.filepath}\x1b[0m\n`;
            }
          }

          if (summary.unstaged.length > 0) {
            out += '\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)\n';
            for (const u of summary.unstaged) {
              const label = u.status === 'deleted' ? 'deleted:    ' : 'modified:   ';
              out += `\t\x1b[31m${label}${u.filepath}\x1b[0m\n`;
            }
          }

          if (summary.untracked.length > 0) {
            out += '\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n';
            for (const t of summary.untracked) {
              out += `\t\x1b[31m${t.filepath}\x1b[0m\n`;
            }
          }

          out += '\n';
          return { stdout: out, stderr: '', exitCode: 0 };
        } catch (err) {
          return { stdout: '', stderr: `git status error: ${(err as Error).message}\n`, exitCode: 1 };
        }
      }

      // git add <files...>
      if (subcommand === 'add') {
        const files = args.slice(1);
        if (files.length === 0) {
          return { stdout: '', stderr: 'Nothing specified, nothing added.\n', exitCode: 0 };
        }
        try {
          await gitService.add(cwd, files);
          return { stdout: '', stderr: '', exitCode: 0 };
        } catch (err) {
          return { stdout: '', stderr: `fatal: ${(err as Error).message}\n`, exitCode: 128 };
        }
      }

      // git commit -m <msg>
      if (subcommand === 'commit') {
        const mIdx = args.indexOf('-m');
        if (mIdx === -1 || !args[mIdx + 1]) {
          return { stdout: '', stderr: 'error: switch `m\' requires a value\n', exitCode: 1 };
        }
        const message = args.slice(mIdx + 1).join(' ').replace(/^["']|["']$/g, '');
        try {
          const summary = await gitService.status(cwd);
          if (summary.staged.length === 0) {
            return {
              stdout: `On branch ${summary.branch}\nnothing to commit, working tree clean\n`,
              stderr: '',
              exitCode: 1,
            };
          }

          const oid = await gitService.commit(cwd, message);
          const shortOid = oid.slice(0, 7);
          const changedCount = summary.staged.length;
          return {
            stdout: `[${summary.branch} ${shortOid}] ${message}\n ${changedCount} file${changedCount > 1 ? 's' : ''} changed\n`,
            stderr: '',
            exitCode: 0,
          };
        } catch (err) {
          return { stdout: '', stderr: `fatal: ${(err as Error).message}\n`, exitCode: 128 };
        }
      }

      // git log [-n count]
      if (subcommand === 'log') {
        try {
          let count = 20;
          const nIdx = args.indexOf('-n');
          if (nIdx !== -1 && args[nIdx + 1]) {
            count = parseInt(args[nIdx + 1], 10) || 20;
          }
          const commits = await gitService.log(cwd, count);
          if (commits.length === 0) {
            return { stdout: '', stderr: 'fatal: your current branch does not have any commits yet\n', exitCode: 128 };
          }
          let out = '';
          for (const c of commits) {
            const dateStr = new Date(c.author.timestamp * 1000).toUTCString();
            out += `\x1b[33mcommit ${c.oid}\x1b[0m\nAuthor: ${c.author.name} <${c.author.email}>\nDate:   ${dateStr}\n\n    ${c.message.trim()}\n\n`;
          }
          return { stdout: out, stderr: '', exitCode: 0 };
        } catch (err) {
          return { stdout: '', stderr: `fatal: ${(err as Error).message}\n`, exitCode: 128 };
        }
      }

      // git diff [file]
      if (subcommand === 'diff') {
        const file = args[1];
        try {
          const diffs = await gitService.diff(cwd, file);
          let out = '';
          for (const d of diffs) {
            if (d.patch) {
              out += d.patch + '\n';
            }
          }
          return { stdout: out, stderr: '', exitCode: 0 };
        } catch (err) {
          return { stdout: '', stderr: `fatal: ${(err as Error).message}\n`, exitCode: 128 };
        }
      }

      // git branch [name]
      if (subcommand === 'branch') {
        const branchName = args[1];
        try {
          if (!branchName) {
            const branches = await gitService.listBranches(cwd);
            const current = await gitService.currentBranch(cwd);
            let out = '';
            for (const b of branches) {
              if (b === current) {
                out += `* \x1b[32m${b}\x1b[0m\n`;
              } else {
                out += `  ${b}\n`;
              }
            }
            return { stdout: out, stderr: '', exitCode: 0 };
          }

          await gitService.branch(cwd, branchName);
          return { stdout: '', stderr: '', exitCode: 0 };
        } catch (err) {
          return { stdout: '', stderr: `fatal: ${(err as Error).message}\n`, exitCode: 128 };
        }
      }

      // git checkout <branch> or git switch <branch>
      if (subcommand === 'checkout' || subcommand === 'switch') {
        const target = args[1];
        if (!target) {
          return { stdout: '', stderr: `fatal: missing operand for ${subcommand}\n`, exitCode: 1 };
        }
        try {
          await gitService.checkout(cwd, target);
          return { stdout: `Switched to branch '${target}'\n`, stderr: '', exitCode: 0 };
        } catch (err) {
          return { stdout: '', stderr: `error: ${(err as Error).message}\n`, exitCode: 1 };
        }
      }

      // git restore <file>
      if (subcommand === 'restore') {
        const file = args[1];
        if (!file) {
          return { stdout: '', stderr: 'fatal: you must specify path(s) to restore\n', exitCode: 128 };
        }
        try {
          await gitService.restore(cwd, file);
          return { stdout: '', stderr: '', exitCode: 0 };
        } catch (err) {
          return { stdout: '', stderr: `fatal: ${(err as Error).message}\n`, exitCode: 128 };
        }
      }

      return {
        stdout: '',
        stderr: `git: '${subcommand}' is not a git command. See 'git --help'.\n`,
        exitCode: 1,
      };
    },
  },
];
