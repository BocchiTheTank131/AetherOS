// AetherOS - Lightweight Universal Syntax Tokenizer for Code Studio Editor

export interface TokenSpan {
  text: string;
  type: 'keyword' | 'string' | 'number' | 'comment' | 'function' | 'type' | 'tag' | 'attr' | 'punctuation' | 'plain';
}

export function tokenizeLine(line: string, language: string): TokenSpan[] {
  if (!line) return [{ text: '', type: 'plain' }];

  if (language === 'plain' || language === 'txt') {
    return [{ text: line, type: 'plain' }];
  }

  // Python
  if (language === 'python' || language === 'py') {
    return tokenizePython(line);
  }

  // JSON
  if (language === 'json') {
    return tokenizeJson(line);
  }

  // HTML
  if (language === 'html') {
    return tokenizeHtml(line);
  }

  // CSS
  if (language === 'css') {
    return tokenizeCss(line);
  }

  // Shell
  if (language === 'shell' || language === 'sh' || language === 'bash') {
    return tokenizeShell(line);
  }

  // Markdown
  if (language === 'markdown' || language === 'md') {
    return tokenizeMarkdown(line);
  }

  // Default: JS / TS
  return tokenizeJsTs(line);
}

function tokenizeJsTs(line: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const regex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(["'`].*?["'`])|(\b(?:const|let|var|function|class|interface|type|enum|return|if|else|for|while|import|export|from|as|async|await|new|this|extends|implements|try|catch|finally|throw|typeof|instanceof|void|default|case|switch|break|continue)\b)|(\b(?:string|number|boolean|any|void|never|unknown|Promise|Array|Record|Map|Set)\b)|(\b[0-9]+(?:\.[0-9]+)?\b)|(\b[a-zA-Z0-9_]+(?=\s*\())|([{}()[\].,;:+\-*/%=<>!&|~^?])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
    }

    if (match[1]) tokens.push({ text: match[1], type: 'comment' });
    else if (match[2]) tokens.push({ text: match[2], type: 'string' });
    else if (match[3]) tokens.push({ text: match[3], type: 'keyword' });
    else if (match[4]) tokens.push({ text: match[4], type: 'type' });
    else if (match[5]) tokens.push({ text: match[5], type: 'number' });
    else if (match[6]) tokens.push({ text: match[6], type: 'function' });
    else if (match[7]) tokens.push({ text: match[7], type: 'punctuation' });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}

function tokenizePython(line: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const regex = /(#[^\n]*)|(["'].*?["'])|(\b(?:def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|pass|assert|lambda|yield|async|await|in|is|not|and|or|True|False|None)\b)|(\b(?:int|str|float|bool|list|dict|set|tuple|Path|print|len|range)\b)|(\b[0-9]+(?:\.[0-9]+)?\b)|(\b[a-zA-Z0-9_]+(?=\s*\())|([{}()[\].,;:+\-*/%=<>!&|~^])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
    }

    if (match[1]) tokens.push({ text: match[1], type: 'comment' });
    else if (match[2]) tokens.push({ text: match[2], type: 'string' });
    else if (match[3]) tokens.push({ text: match[3], type: 'keyword' });
    else if (match[4]) tokens.push({ text: match[4], type: 'type' });
    else if (match[5]) tokens.push({ text: match[5], type: 'number' });
    else if (match[6]) tokens.push({ text: match[6], type: 'function' });
    else if (match[7]) tokens.push({ text: match[7], type: 'punctuation' });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}

function tokenizeJson(line: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const regex = /("(?:\\.|[^"\\])*")(?:\s*:)?|(\b(?:true|false|null)\b)|(\b-?[0-9]+(?:\.[0-9]+)?\b)|([{}[\]:,])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
    }

    if (match[1]) {
      const isKey = line[match.index + match[1].length] === ':';
      tokens.push({ text: match[1], type: isKey ? 'keyword' : 'string' });
    } else if (match[2]) {
      tokens.push({ text: match[2], type: 'keyword' });
    } else if (match[3]) {
      tokens.push({ text: match[3], type: 'number' });
    } else if (match[4]) {
      tokens.push({ text: match[4], type: 'punctuation' });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}

function tokenizeHtml(line: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const regex = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9-]+)|(["'][^"']*["'])|([a-zA-Z-]+(?=\s*=))|([<>/=])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
    }

    if (match[1]) tokens.push({ text: match[1], type: 'comment' });
    else if (match[2]) tokens.push({ text: match[2], type: 'tag' });
    else if (match[3]) tokens.push({ text: match[3], type: 'string' });
    else if (match[4]) tokens.push({ text: match[4], type: 'attr' });
    else if (match[5]) tokens.push({ text: match[5], type: 'punctuation' });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}

function tokenizeCss(line: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const regex = /(\/\*[\s\S]*?\*\/)|([.#]?[a-zA-Z0-9_-]+(?=\s*\{))|([a-zA-Z-]+(?=\s*:))|(:[^;]+;)|([{};])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
    }

    if (match[1]) tokens.push({ text: match[1], type: 'comment' });
    else if (match[2]) tokens.push({ text: match[2], type: 'tag' });
    else if (match[3]) tokens.push({ text: match[3], type: 'attr' });
    else if (match[4]) tokens.push({ text: match[4], type: 'string' });
    else if (match[5]) tokens.push({ text: match[5], type: 'punctuation' });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}

function tokenizeShell(line: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const regex = /(#[^\n]*)|(["'].*?["'])|(\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|export)\b)|(\$[a-zA-Z0-9_]+|\$\?)|(\b[a-zA-Z0-9_-]+(?=\s))|([|&;><=])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
    }

    if (match[1]) tokens.push({ text: match[1], type: 'comment' });
    else if (match[2]) tokens.push({ text: match[2], type: 'string' });
    else if (match[3]) tokens.push({ text: match[3], type: 'keyword' });
    else if (match[4]) tokens.push({ text: match[4], type: 'type' });
    else if (match[5]) tokens.push({ text: match[5], type: 'function' });
    else if (match[6]) tokens.push({ text: match[6], type: 'punctuation' });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}

function tokenizeMarkdown(line: string): TokenSpan[] {
  if (line.startsWith('#')) return [{ text: line, type: 'keyword' }];
  if (line.startsWith('```') || line.startsWith('`')) return [{ text: line, type: 'string' }];
  if (line.startsWith('>')) return [{ text: line, type: 'comment' }];
  if (line.startsWith('- ') || line.startsWith('* ')) return [{ text: line.slice(0, 2), type: 'punctuation' }, { text: line.slice(2), type: 'plain' }];
  return [{ text: line, type: 'plain' }];
}
