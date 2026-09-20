// 安全的守卫条件表达式求值器：手写的小型词法/语法分析器，不使用 eval/Function。
// 支持：字面量（数字/字符串/true/false/null）、变量与点路径、数组下标、
// 算术、比较、逻辑、三元、括号，以及白名单函数（length/min/max/abs 等）。

export type EvalValue = unknown;

type TokenType =
  | 'number'
  | 'string'
  | 'ident'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'dot'
  | 'question'
  | 'colon'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const MULTI_CHAR_OPS = ['===', '!==', '<=', '>=', '&&', '||', '==', '!='];
const SINGLE_OPS = new Set(['+', '-', '*', '/', '%', '<', '>', '!']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdentStart = (c: string) =>
    (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
  const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }
    if (isDigit(c)) {
      const start = i;
      while (i < input.length && (isDigit(input[i]) || input[i] === '.')) i += 1;
      tokens.push({ type: 'number', value: input.slice(start, i), pos: start });
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i += 1;
      let out = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\') {
          const next = input[i + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };
          out += next !== undefined ? (map[next] ?? next) : '';
          i += 2;
        } else {
          out += input[i];
          i += 1;
        }
      }
      if (i >= input.length) throw new Error(`位置 ${start + 1}: 字符串缺少结束引号`);
      i += 1;
      tokens.push({ type: 'string', value: out, pos: start });
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < input.length && isIdentPart(input[i])) i += 1;
      tokens.push({ type: 'ident', value: input.slice(start, i), pos: start });
      continue;
    }
    const twoOrThree = input.slice(i, i + 3);
    const matched = MULTI_CHAR_OPS.find((op) => twoOrThree.startsWith(op));
    if (matched) {
      tokens.push({ type: matched === '?' ? 'question' : 'op', value: matched, pos: i });
      i += matched.length;
      continue;
    }
    if (c === '(') tokens.push({ type: 'lparen', value: c, pos: i });
    else if (c === ')') tokens.push({ type: 'rparen', value: c, pos: i });
    else if (c === '[') tokens.push({ type: 'lbracket', value: c, pos: i });
    else if (c === ']') tokens.push({ type: 'rbracket', value: c, pos: i });
    else if (c === ',') tokens.push({ type: 'comma', value: c, pos: i });
    else if (c === '.') tokens.push({ type: 'dot', value: c, pos: i });
    else if (c === '?') tokens.push({ type: 'question', value: c, pos: i });
    else if (c === ':') tokens.push({ type: 'colon', value: c, pos: i });
    else if (SINGLE_OPS.has(c)) tokens.push({ type: 'op', value: c, pos: i });
    else throw new Error(`位置 ${i + 1}: 无法识别的字符 "${c}"`);
    i += 1;
  }
  tokens.push({ type: 'eof', value: '', pos: input.length });
  return tokens;
}

type Ast =
  | { kind: 'literal'; value: EvalValue }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: string; arg: Ast }
  | { kind: 'binary'; op: string; left: Ast; right: Ast }
  | { kind: 'logical'; op: '&&' | '||'; left: Ast; right: Ast }
  | { kind: 'conditional'; test: Ast; cons: Ast; alt: Ast }
  | { kind: 'member'; object: Ast; property: string; computed: boolean; index?: Ast }
  | { kind: 'call'; callee: Ast; args: Ast[] };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }
  private expect(type: TokenType): Token {
    const tok = this.next();
    if (tok.type !== type) {
      throw new Error(`位置 ${tok.pos + 1}: 期望 ${typeName(type)}，实际得到 "${tok.value || typeName(tok.type)}"`);
    }
    return tok;
  }

  parse(): Ast {
    const expr = this.parseConditional();
    if (this.peek().type !== 'eof') {
      const tok = this.peek();
      throw new Error(`位置 ${tok.pos + 1}: 意外的符号 "${tok.value}"`);
    }
    return expr;
  }

  private parseConditional(): Ast {
    const test = this.parseBinary(0);
    if (this.peek().type === 'question') {
      this.next();
      const cons = this.parseConditional();
      this.expect('colon');
      const alt = this.parseConditional();
      return { kind: 'conditional', test, cons, alt };
    }
    return test;
  }

  private precedence(op: string): number {
    if (op === '||') return 1;
    if (op === '&&') return 2;
    if (op === '==' || op === '!=' || op === '===' || op === '!==') return 3;
    if (op === '<' || op === '>' || op === '<=' || op === '>=') return 4;
    if (op === '+' || op === '-') return 5;
    if (op === '*' || op === '/' || op === '%') return 6;
    return 0;
  }

  private parseBinary(minPrec: number): Ast {
    let left = this.parseUnary();
    while (this.peek().type === 'op') {
      const op = this.peek().value;
      const prec = this.precedence(op);
      if (prec === 0 || prec < minPrec) break;
      this.next();
      const right = this.parseBinary(prec + 1);
      if (op === '&&' || op === '||') {
        left = { kind: 'logical', op, left, right };
      } else {
        left = { kind: 'binary', op, left, right };
      }
    }
    return left;
  }

  private parseUnary(): Ast {
    const tok = this.peek();
    if (tok.type === 'op' && (tok.value === '!' || tok.value === '-')) {
      this.next();
      return { kind: 'unary', op: tok.value, arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Ast {
    let expr = this.parsePrimary();
    for (;;) {
      const tok = this.peek();
      if (tok.type === 'dot') {
        this.next();
        const name = this.expect('ident').value;
        expr = { kind: 'member', object: expr, property: name, computed: false };
      } else if (tok.type === 'lbracket') {
        this.next();
        const index = this.parseConditional();
        this.expect('rbracket');
        expr = { kind: 'member', object: expr, property: '', computed: true, index };
      } else if (tok.type === 'lparen') {
        this.next();
        const args: Ast[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.parseConditional());
          while (this.peek().type === 'comma') {
            this.next();
            args.push(this.parseConditional());
          }
        }
        this.expect('rparen');
        expr = { kind: 'call', callee: expr, args };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): Ast {
    const tok = this.next();
    switch (tok.type) {
      case 'number': {
        const value = Number(tok.value);
        if (Number.isNaN(value)) throw new Error(`位置 ${tok.pos + 1}: 非法数字`);
        return { kind: 'literal', value };
      }
      case 'string':
        return { kind: 'literal', value: tok.value };
      case 'ident':
        if (tok.value === 'true') return { kind: 'literal', value: true };
        if (tok.value === 'false') return { kind: 'literal', value: false };
        if (tok.value === 'null') return { kind: 'literal', value: null };
        return { kind: 'var', name: tok.value };
      case 'lparen': {
        const expr = this.parseConditional();
        this.expect('rparen');
        return expr;
      }
      default:
        throw new Error(`位置 ${tok.pos + 1}: 意外的符号 "${tok.value || typeName(tok.type)}"`);
    }
  }
}

function typeName(type: TokenType): string {
  const names: Record<TokenType, string> = {
    number: '数字',
    string: '字符串',
    ident: '标识符',
    op: '运算符',
    lparen: '"("',
    rparen: '")"',
    lbracket: '"["',
    rbracket: '"]"',
    comma: '","',
    dot: '"."',
    question: '"?"',
    colon: '":"',
    eof: '表达式结束',
  };
  return names[type];
}

const FUNCTIONS: Record<string, (...args: EvalValue[]) => EvalValue> = {
  length: (v) => {
    if (v === null || v === undefined) throw new Error('length: 值为 null');
    if (typeof v === 'string' || Array.isArray(v)) return v.length;
    if (typeof v === 'object') return Object.keys(v as object).length;
    throw new Error('length: 仅支持字符串、数组或对象');
  },
  min: (...args) => Math.min(...flatten(args).map(toNumber)),
  max: (...args) => Math.max(...flatten(args).map(toNumber)),
  abs: (v) => Math.abs(toNumber(v)),
  round: (v) => Math.round(toNumber(v)),
  floor: (v) => Math.floor(toNumber(v)),
  includes: (arr, item) => {
    if (typeof arr === 'string') return arr.includes(String(item));
    if (Array.isArray(arr)) return arr.some((el) => looseEquals(el, item));
    throw new Error('includes: 第一个参数必须是字符串或数组');
  },
  not: (v) => !isTruthy(v),
};

function flatten(args: EvalValue[]): EvalValue[] {
  return args.flatMap((a) => (Array.isArray(a) ? a : [a]));
}

function toNumber(v: EvalValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`无法转换为数字: ${formatValue(v)}`);
  return n;
}

export function isTruthy(v: EvalValue): boolean {
  return !(v === false || v === 0 || v === '' || v === null || v === undefined || Number.isNaN(v));
}

function looseEquals(a: EvalValue, b: EvalValue): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a) === String(b);
}

function deepEquals(a: EvalValue, b: EvalValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function evaluate(node: Ast, ctx: Record<string, EvalValue>): EvalValue {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'var': {
      if (!(node.name in ctx)) throw new Error(`未知变量 "${node.name}"`);
      return ctx[node.name];
    }
    case 'unary': {
      const v = evaluate(node.arg, ctx);
      if (node.op === '!') return !isTruthy(v);
      return -toNumber(v);
    }
    case 'logical': {
      const left = evaluate(node.left, ctx);
      if (node.op === '&&') return isTruthy(left) ? evaluate(node.right, ctx) : left;
      return isTruthy(left) ? left : evaluate(node.right, ctx);
    }
    case 'conditional':
      return isTruthy(evaluate(node.test, ctx))
        ? evaluate(node.cons, ctx)
        : evaluate(node.alt, ctx);
    case 'member': {
      const obj = evaluate(node.object, ctx);
      let key: string | number;
      if (node.computed) {
        const idx = evaluate(node.index!, ctx);
        key = typeof idx === 'number' ? idx : String(idx);
      } else {
        key = node.property;
      }
      if (obj === null || obj === undefined) {
        throw new Error(`无法访问 ${formatValue(obj)} 的属性 ${String(key)}`);
      }
      if (typeof obj === 'string' || Array.isArray(obj)) {
        if (key === 'length') return (obj as { length: number }).length;
        const idx = typeof key === 'number' ? key : Number(key);
        if (Array.isArray(obj) && Number.isInteger(idx)) return obj[idx];
        if (typeof obj === 'string' && Number.isInteger(idx)) return obj[idx];
      }
      if (typeof obj !== 'object') {
        throw new Error(`无法访问原始类型 ${typeof obj} 的属性 ${String(key)}`);
      }
      return (obj as Record<string, EvalValue>)[String(key)];
    }
    case 'call': {
      if (node.callee.kind !== 'var' && node.callee.kind !== 'member') {
        throw new Error('只能调用允许的函数');
      }
      const fnName =
        node.callee.kind === 'var'
          ? node.callee.name
          : node.callee.computed
            ? String(evaluate(node.callee.index!, ctx))
            : node.callee.property;
      const args = node.args.map((a) => evaluate(a, ctx));
      if (node.callee.kind === 'var') {
        const fn = FUNCTIONS[fnName];
        if (!fn) throw new Error(`不允许调用函数 "${fnName}"`);
        return fn(...args);
      }
      // 白名单方法：数组/字符串方法
      const obj = evaluate(node.callee.object, ctx);
      if (fnName === 'includes' && (Array.isArray(obj) || typeof obj === 'string')) {
        return (obj as string).includes(args[0] as never);
      }
      if (fnName === 'startsWith' && typeof obj === 'string') return obj.startsWith(String(args[0]));
      if (fnName === 'endsWith' && typeof obj === 'string') return obj.endsWith(String(args[0]));
      throw new Error(`不允许调用方法 "${fnName}"`);
    }
    case 'binary': {
      const op = node.op;
      if (op === '==' || op === '!=') {
        const a = evaluate(node.left, ctx);
        const b = evaluate(node.right, ctx);
        return op === '==' ? looseEquals(a, b) : !looseEquals(a, b);
      }
      if (op === '===' || op === '!==') {
        const a = evaluate(node.left, ctx);
        const b = evaluate(node.right, ctx);
        return op === '===' ? deepEquals(a, b) : !deepEquals(a, b);
      }
      const a = evaluate(node.left, ctx);
      const b = evaluate(node.right, ctx);
      switch (op) {
        case '+':
          if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
          return toNumber(a) + toNumber(b);
        case '-':
          return toNumber(a) - toNumber(b);
        case '*':
          return toNumber(a) * toNumber(b);
        case '/': {
          const denom = toNumber(b);
          if (denom === 0) throw new Error('除数为 0');
          return toNumber(a) / denom;
        }
        case '%':
          return toNumber(a) % toNumber(b);
        case '<':
          return compare(a, b) < 0;
        case '>':
          return compare(a, b) > 0;
        case '<=':
          return compare(a, b) <= 0;
        case '>=':
          return compare(a, b) >= 0;
        default:
          throw new Error(`不支持的运算符 ${op}`);
      }
    }
  }
}

function compare(a: EvalValue, b: EvalValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function formatValue(v: EvalValue): string {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `"${v}"`;
  if (Array.isArray(v) || (v !== null && typeof v === 'object')) return JSON.stringify(v);
  return String(v);
}

export interface EvalResult {
  ok: boolean;
  truthy: boolean;
  value?: EvalValue;
  error?: string;
}

export function evaluateGuard(expression: string, ctx: unknown): EvalResult {
  const trimmed = expression.trim();
  if (!trimmed) return { ok: true, truthy: true, value: true };
  try {
    const tokens = tokenize(trimmed);
    const ast = new Parser(tokens).parse();
    const value = evaluate(ast, (ctx ?? {}) as Record<string, EvalValue>);
    return { ok: true, truthy: isTruthy(value), value };
  } catch (e) {
    return { ok: false, truthy: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function validateExpression(expression: string): string | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;
  try {
    new Parser(tokenize(trimmed)).parse();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
