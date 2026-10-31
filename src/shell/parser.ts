// AetherOS - aesh Shell Parser & AST Builder (POSIX-like Scripting)
import type {
  Token,
  CommandChain,
  Pipeline,
  SimpleCommand,
  Redirection,
  Statement,
  IfStatement,
  ForStatement,
  WhileStatement,
  CaseStatement,
  CaseArm,
  FunctionDefStatement,
} from './types';

/**
 * Parses tokens into simple command chains (backward-compatible legacy parser)
 */
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

  const finishPipeline = (operator?: 'AND' | 'OR' | 'THEN', background = false) => {
    finishCommand();
    if (currentPipeline.commands.length > 0) {
      chains.push({
        pipeline: currentPipeline,
        operator,
        background,
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

    if (token.type === 'AMPERSAND') {
      finishPipeline('THEN', true);
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
      } else {
        const nextVal = i + 1 < tokens.length ? tokens[i + 1].value : 'newline';
        throw new Error(`syntax error near unexpected token '${nextVal}'`);
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

/**
 * Parses tokens into structured AST Statements (supporting if, for, while, case, functions)
 */
export function parseScript(tokens: Token[]): Statement[] {
  let i = 0;

  function peek(): Token | undefined {
    return tokens[i];
  }

  function consume(): Token {
    return tokens[i++];
  }

  function skipDelimiters() {
    while (
      i < tokens.length &&
      (tokens[i].type === 'NEWLINE' || (tokens[i].type === 'SEMICOLON' && tokens[i].value === ';'))
    ) {
      i++;
    }
  }

  function parseStatements(stopKeywords: string[]): Statement[] {
    const stmts: Statement[] = [];
    skipDelimiters();

    while (i < tokens.length) {
      const tok = peek();
      if (!tok) break;

      if (stopKeywords.includes(tok.value)) {
        break;
      }

      if (tok.type === 'NEWLINE' || (tok.type === 'SEMICOLON' && tok.value === ';')) {
        consume();
        continue;
      }

      const res = parseSingleStatement();
      if (Array.isArray(res)) {
        stmts.push(...res);
      } else if (res) {
        stmts.push(res);
      }
      skipDelimiters();
    }

    return stmts;
  }

  function parseSingleStatement(): Statement[] | Statement | null {
    skipDelimiters();
    const tok = peek();
    if (!tok) return null;

    if (tok.type === 'WORD') {
      if (tok.value === 'if') {
        return parseIf();
      }
      if (tok.value === 'for') {
        return parseFor();
      }
      if (tok.value === 'while') {
        return parseWhile();
      }
      if (tok.value === 'case') {
        return parseCase();
      }
      if (
        tok.value === 'function' ||
        tok.value.endsWith('()') ||
        (i + 1 < tokens.length && tokens[i + 1].value === '()') ||
        (i + 2 < tokens.length && tokens[i + 1].value === '(' && tokens[i + 2].value === ')')
      ) {
        return parseFunctionDef();
      }
    }

    // Default to command chain
    const chainTokens: Token[] = [];
    while (i < tokens.length) {
      const cur = peek()!;
      if (['fi', 'then', 'else', 'elif', 'do', 'done', 'esac', ';;'].includes(cur.value)) {
        break;
      }
      if (cur.type === 'NEWLINE' || (cur.type === 'SEMICOLON' && cur.value === ';')) {
        chainTokens.push(consume());
        break;
      }
      chainTokens.push(consume());
    }

    const chains = parse(chainTokens);
    if (chains.length > 0) {
      return chains.map((chain) => ({
        type: 'chain' as const,
        chain,
      }));
    }

    return null;
  }

  function parseIf(): IfStatement {
    consume(); // consume 'if'
    const test = parseStatements(['then']);
    if (peek()?.value !== 'then') {
      throw new Error("Syntax error: expected 'then' after if condition");
    }
    consume(); // consume 'then'
    const thenBody = parseStatements(['elif', 'else', 'fi']);

    const elifs: Array<{ test: Statement[]; then: Statement[] }> = [];
    while (peek()?.value === 'elif') {
      consume(); // consume 'elif'
      const elifTest = parseStatements(['then']);
      if (peek()?.value !== 'then') {
        throw new Error("Syntax error: expected 'then' after elif condition");
      }
      consume(); // consume 'then'
      const elifThen = parseStatements(['elif', 'else', 'fi']);
      elifs.push({ test: elifTest, then: elifThen });
    }

    let elseBody: Statement[] | undefined;
    if (peek()?.value === 'else') {
      consume(); // consume 'else'
      elseBody = parseStatements(['fi']);
    }

    if (peek()?.value !== 'fi') {
      throw new Error("Syntax error: expected 'fi' to close if statement");
    }
    consume(); // consume 'fi'

    return {
      type: 'if',
      test,
      then: thenBody,
      elifs: elifs.length > 0 ? elifs : undefined,
      else: elseBody,
    };
  }

  function parseFor(): ForStatement {
    consume(); // consume 'for'
    const varTok = consume();
    if (varTok.type !== 'WORD') {
      throw new Error("Syntax error: expected variable name after 'for'");
    }
    const varName = varTok.value;

    const inTok = consume();
    if (inTok.value !== 'in') {
      throw new Error("Syntax error: expected 'in' after for variable");
    }

    const items: string[] = [];
    while (i < tokens.length) {
      const cur = peek()!;
      if (cur.type === 'SEMICOLON' || cur.type === 'NEWLINE' || cur.value === 'do') {
        break;
      }
      items.push(consume().value);
    }

    skipDelimiters();
    if (peek()?.value !== 'do') {
      throw new Error("Syntax error: expected 'do' in for loop");
    }
    consume(); // consume 'do'

    const body = parseStatements(['done']);
    if (peek()?.value !== 'done') {
      throw new Error("Syntax error: expected 'done' to close for loop");
    }
    consume(); // consume 'done'

    return {
      type: 'for',
      variable: varName,
      items,
      body,
    };
  }

  function parseWhile(): WhileStatement {
    consume(); // consume 'while'
    const test = parseStatements(['do']);
    if (peek()?.value !== 'do') {
      throw new Error("Syntax error: expected 'do' after while condition");
    }
    consume(); // consume 'do'

    const body = parseStatements(['done']);
    if (peek()?.value !== 'done') {
      throw new Error("Syntax error: expected 'done' to close while loop");
    }
    consume(); // consume 'done'

    return {
      type: 'while',
      test,
      body,
    };
  }

  function parseCase(): CaseStatement {
    consume(); // consume 'case'
    const wordTok = consume();
    const word = wordTok.value;

    if (peek()?.value !== 'in') {
      throw new Error("Syntax error: expected 'in' after case word");
    }
    consume(); // consume 'in'

    const arms: CaseArm[] = [];
    skipDelimiters();

    while (i < tokens.length && peek()?.value !== 'esac') {
      const patterns: string[] = [];
      while (i < tokens.length) {
        const cur = consume();
        let val = cur.value;
        const endsWithParen = val.endsWith(')');
        if (endsWithParen) {
          val = val.slice(0, -1);
        }
        if (cur.type === 'PIPE' || val === '|') {
          continue;
        }
        if (val) {
          const subPatterns = val.split('|').filter(Boolean);
          patterns.push(...subPatterns);
        }
        if (endsWithParen || cur.value === ')') {
          break;
        }
      }

      const armBody = parseStatements([';;', 'esac']);
      arms.push({ patterns, body: armBody });

      if (peek()?.value === ';;') {
        consume(); // consume ';;'
      }
      skipDelimiters();
    }

    if (peek()?.value !== 'esac') {
      throw new Error("Syntax error: expected 'esac' to close case statement");
    }
    consume(); // consume 'esac'

    return {
      type: 'case',
      word,
      arms,
    };
  }

  function parseFunctionDef(): FunctionDefStatement {
    let fnName = '';
    const first = consume();
    if (first.value === 'function') {
      fnName = consume().value.replace(/\(\)$/, '');
      if (peek()?.value === '()') consume();
    } else if (first.value.endsWith('()')) {
      fnName = first.value.slice(0, -2);
    } else {
      fnName = first.value;
      if (peek()?.value === '()') {
        consume();
      } else if (peek()?.value === '(') {
        consume();
        if (peek()?.value === ')') consume();
      }
    }

    skipDelimiters();
    const openBrace = consume();
    if (openBrace.value !== '{') {
      throw new Error(`Syntax error: expected '{' in function body for ${fnName}`);
    }

    const body = parseStatements(['}']);
    if (peek()?.value !== '}') {
      throw new Error(`Syntax error: expected '}' to close function ${fnName}`);
    }
    consume(); // consume '}'

    return {
      type: 'function',
      name: fnName,
      body,
    };
  }

  return parseStatements([]);
}
