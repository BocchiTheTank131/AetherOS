// AetherOS - aesh Shell Parser
import type { Token, CommandChain, Pipeline, SimpleCommand, Redirection } from './types';

export function parse(tokens: Token[]): CommandChain[] {
  const chains: CommandChain[] = [];
  let currentPipeline: Pipeline = { commands: [] };
  let currentCmd: SimpleCommand | null = null;
  let i = 0;

  const finishCommand = () => {
    if (currentCmd) {
      currentPipeline.commands.push(currentCmd);
      currentCmd = null;
    }
  };

  const finishPipeline = (operator?: 'AND' | 'OR' | 'THEN') => {
    finishCommand();
    if (currentPipeline.commands.length > 0) {
      chains.push({
        pipeline: currentPipeline,
        operator,
      });
      currentPipeline = { commands: [] };
    }
  };

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === 'NEWLINE' || token.type === 'SEMICOLON') {
      finishPipeline('THEN');
      i++;
      continue;
    }

    if (token.type === 'AND') {
      finishPipeline('AND');
      i++;
      continue;
    }

    if (token.type === 'OR') {
      finishPipeline('OR');
      i++;
      continue;
    }

    if (token.type === 'PIPE') {
      finishCommand();
      i++;
      continue;
    }

    // Redirections: >, >>, <, 2>
    if (
      token.type === 'REDIRECT_OUT' ||
      token.type === 'REDIRECT_APPEND' ||
      token.type === 'REDIRECT_IN' ||
      token.type === 'REDIRECT_ERR'
    ) {
      if (i + 1 < tokens.length && tokens[i + 1].type === 'WORD') {
        const target = tokens[i + 1].value;
        const typeMap: Record<string, Redirection['type']> = {
          REDIRECT_OUT: 'out',
          REDIRECT_APPEND: 'append',
          REDIRECT_IN: 'in',
          REDIRECT_ERR: 'err',
        };
        const redir: Redirection = {
          type: typeMap[token.type],
          target,
        };

        if (!currentCmd) {
          currentCmd = { name: '', args: [], redirections: [redir] };
        } else {
          currentCmd.redirections.push(redir);
        }
        i += 2;
        continue;
      }
    }

    if (token.type === 'WORD') {
      if (!currentCmd) {
        currentCmd = { name: token.value, args: [], redirections: [] };
      } else if (!currentCmd.name) {
        currentCmd.name = token.value;
      } else {
        currentCmd.args.push(token.value);
      }
      i++;
      continue;
    }

    i++;
  }

  finishPipeline();
  return chains;
}
