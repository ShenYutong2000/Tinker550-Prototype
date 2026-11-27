import type { AssetCategoryId, AssetItem } from '../asset-library/assetLibraryModel';
import type { Language } from '../../../shared/i18n';
import type { BoardEdge, BoardNode, OutcomePropertyRule } from '../design-board/studioModel';

export type StateVariableType = 'number' | 'boolean' | 'text' | 'choice';

export type StateVariableValue = number | boolean | string;

export interface StateVariable {
  id: string;
  name: string;
  type: StateVariableType;
  initialValue: StateVariableValue;
  stageParameterId?: string;
  // Number-only optional range constraints (enabled only when checkbox is ticked)
  hasMin?: boolean;
  minValue?: number;
  hasMax?: boolean;
  maxValue?: number;
  // Choice-only options list & optional explicit ordering (enables Previous / Next)
  options?: string[];
  ordered?: boolean;
  description?: string;
}

export interface ScopedStateVariable {
  variable: StateVariable;
  scope: 'global' | 'asset';
  assetId?: string;
  assetName?: string;
  assetCategoryId?: AssetCategoryId;
  fullKey: string;
  playValue: StateVariableValue;
  isDirty: boolean;
}

export interface NumericFormulaSymbol {
  /** Display key inserted into formula, e.g. "Cat.HP" or "Move Speed" */
  key: string;
  value: number;
  source: 'state' | 'parameter';
}

export function assetCategorySupportsProperties(categoryId: AssetCategoryId): boolean {
  return (
    categoryId === 'characters' ||
    categoryId === 'objects' ||
    categoryId === 'backgrounds'
  );
}

export function clampNumberValue(
  raw: number,
  variable: Pick<StateVariable, 'hasMin' | 'minValue' | 'hasMax' | 'maxValue'>,
): number {
  let next = Number.isFinite(raw) ? raw : 0;
  if (variable.hasMin && typeof variable.minValue === 'number' && Number.isFinite(variable.minValue)) {
    next = Math.max(variable.minValue, next);
  }
  if (variable.hasMax && typeof variable.maxValue === 'number' && Number.isFinite(variable.maxValue)) {
    next = Math.min(variable.maxValue, next);
  }
  return next;
}

export function coerceVariableValue(
  variable: StateVariable,
  raw: StateVariableValue,
): StateVariableValue {
  if (variable.type === 'number') {
    const num = typeof raw === 'number' ? raw : Number(raw);
    return clampNumberValue(Number.isFinite(num) ? num : 0, variable);
  }
  if (variable.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const low = raw.trim().toLowerCase();
      return low === 'true' || low === '1' || low === 'yes' || low === '是';
    }
    return Boolean(raw);
  }
  if (variable.type === 'choice') {
    const opts = variable.options && variable.options.length > 0 ? variable.options : [];
    const str = String(raw ?? '');
    if (opts.length > 0 && !opts.includes(str)) {
      return opts[0];
    }
    return str;
  }
  return String(raw ?? '');
}

export function areVariableValuesEqual(
  type: StateVariableType,
  a: StateVariableValue,
  b: StateVariableValue,
): boolean {
  if (type === 'number') {
    return Number(a) === Number(b);
  }
  if (type === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  return String(a) === String(b);
}

export function collectAllScopedVariables(
  globalVariables: StateVariable[],
  assetItems: AssetItem[],
  playValues: Record<string, StateVariableValue>,
): ScopedStateVariable[] {
  const result: ScopedStateVariable[] = [];

  for (const variable of globalVariables) {
    const rawPlay =
      variable.id in playValues ? playValues[variable.id] : variable.initialValue;
    const playValue = coerceVariableValue(variable, rawPlay);
    result.push({
      variable,
      scope: 'global',
      fullKey: variable.name,
      playValue,
      isDirty: !areVariableValuesEqual(variable.type, playValue, variable.initialValue),
    });
  }

  for (const asset of assetItems) {
    if (!assetCategorySupportsProperties(asset.categoryId) && !asset.stagePreset) continue;
    const props = asset.properties ?? [];
    for (const variable of props) {
      const rawPlay =
        !variable.stageParameterId && variable.id in playValues ? playValues[variable.id] : variable.initialValue;
      const playValue = coerceVariableValue(variable, rawPlay);
      result.push({
        variable,
        scope: 'asset',
        assetId: asset.id,
        assetName: asset.name,
        assetCategoryId: asset.categoryId,
        fullKey: `${asset.name}.${variable.name}`,
        playValue,
        isDirty: !areVariableValuesEqual(variable.type, playValue, variable.initialValue),
      });
    }
  }

  return result;
}

export function formatVariableValue(
  variable: StateVariable,
  value: StateVariableValue,
  lang: Language,
): string {
  if (variable.type === 'boolean') {
    const truthy = Boolean(value);
    return lang === 'zh' ? (truthy ? '是' : '否') : truthy ? 'True' : 'False';
  }
  if (variable.type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : '0';
  }
  const str = String(value ?? '');
  return str || (lang === 'zh' ? '（空）' : '(empty)');
}

export function formatNumberRangeHint(variable: StateVariable): string | null {
  if (variable.type !== 'number') return null;
  const hasMin = variable.hasMin && typeof variable.minValue === 'number';
  const hasMax = variable.hasMax && typeof variable.maxValue === 'number';
  if (hasMin && hasMax) return `${variable.minValue}–${variable.maxValue}`;
  if (hasMin) return `≥ ${variable.minValue}`;
  if (hasMax) return `≤ ${variable.maxValue}`;
  return null;
}

export function defaultConditionForVariable(
  entry: ScopedStateVariable,
): string {
  const key = entry.fullKey;
  if (entry.variable.type === 'number') {
    const base = Number(entry.variable.initialValue);
    const target = Number.isFinite(base) ? base : 1;
    return `${key} >= ${target}`;
  }
  if (entry.variable.type === 'boolean') {
    return `${key} == true`;
  }
  if (entry.variable.type === 'choice') {
    const opt = entry.variable.options?.[0] ?? String(entry.variable.initialValue ?? '');
    return `${key} == ${opt}`;
  }
  const val = String(entry.variable.initialValue ?? '').trim() || 'hello';
  return `${key} == ${val}`;
}

export interface VariableReferences {
  nodeIds: string[];
  edgeIds: string[];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textMentionsVariable(
  text: string,
  entry: ScopedStateVariable,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const candidates = [entry.fullKey, entry.variable.name]
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 || /[\u4e00-\u9fa5]/.test(s));

  for (const token of candidates) {
    const isAscii = /^[a-zA-Z0-9_.\s-]+$/.test(token);
    if (isAscii) {
      const re = new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(token)}([^a-zA-Z0-9_]|$)`, 'i');
      if (re.test(trimmed)) return true;
    } else if (trimmed.toLowerCase().includes(token.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Locates all Design Board cards & arrow conditions that reference or bind this variable.
 */
export function findVariableReferences(
  entry: ScopedStateVariable,
  nodes: BoardNode[],
  edges: BoardEdge[],
): VariableReferences {
  const nodeIds: string[] = [];
  const edgeIds: string[] = [];

  for (const node of nodes) {
    const boundAssets = Array.isArray(node.assetIds)
      ? node.assetIds
      : node.assetId
        ? [node.assetId]
        : [];
    const bindsOwnerAsset =
      entry.scope === 'asset' &&
      Boolean(entry.assetId) &&
      boundAssets.includes(entry.assetId!);

    const referencesInRules = (node.fields.relatedProperties ?? []).some(
      (rule) =>
        rule.variableId === entry.variable.id ||
        (rule.formula ? textMentionsVariable(rule.formula, entry) : false),
    );

    const referencesInPrompt =
      node.promptInput?.outcomeTargetKind === 'variable' &&
      node.promptInput.outcomeTargetRef === entry.variable.id;

    const mentionsInText =
      textMentionsVariable(node.note, entry) || textMentionsVariable(node.title, entry);

    if (bindsOwnerAsset || referencesInRules || referencesInPrompt || mentionsInText) {
      nodeIds.push(node.id);
    }
  }

  for (const edge of edges) {
    const matchedInGroup = edge.conditionGroup?.clauses.some(
      (clause) =>
        clause.kind === 'property' &&
        (clause.propertyId === entry.variable.id ||
          clause.comparePropertyId === entry.variable.id ||
          (clause.valueMode === 'formula' &&
            clause.formulaExpression &&
            textMentionsVariable(clause.formulaExpression, entry))),
    );
    if (matchedInGroup || (edge.condition && textMentionsVariable(edge.condition, entry))) {
      edgeIds.push(edge.id);
    }
  }

  return { nodeIds, edgeIds };
}

export function createStateVariableId(): string {
  return `var-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ============================================================================
// Safe deterministic expression evaluator for Outcome Number & Boolean Formulas
// (Never uses eval or new Function)
// ============================================================================

type ArithToken =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function substituteNumericSymbols(
  expr: string,
  symbols: NumericFormulaSymbol[],
): string {
  // Replace longest keys first so "Cat.HP" beats "HP"
  const sorted = [...symbols]
    .filter((s) => s.key.trim().length > 0)
    .sort((a, b) => b.key.length - a.key.length);

  let out = expr;
  for (const sym of sorted) {
    const key = sym.key.trim();
    const escaped = escapeRegExp(key);
    const isAsciiWord = /^[a-zA-Z0-9_.\s]+$/.test(key);
    const re = isAsciiWord
      ? new RegExp(`(?<![a-zA-Z0-9_.])${escaped}(?![a-zA-Z0-9_.])`, 'gi')
      : new RegExp(escaped, 'gi');
    const replacement = `(${Number.isFinite(sym.value) ? sym.value : 0})`;
    out = out.replace(re, replacement);
  }
  return out;
}

function tokenizeArithmetic(src: string): ArithToken[] | null {
  const tokens: ArithToken[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if (ch === '×') {
      tokens.push({ type: 'op', value: '*' });
      i += 1;
      continue;
    }
    if (ch === '÷') {
      tokens.push({ type: 'op', value: '/' });
      i += 1;
      continue;
    }
    const numMatch = src.slice(i).match(/^\d+(?:\.\d+)?/);
    if (numMatch) {
      tokens.push({ type: 'num', value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    return null;
  }
  return tokens;
}

export function evaluateNumberFormula(
  formula: string,
  scopedVariables: ScopedStateVariable[],
  numericParameters: NumericFormulaSymbol[] = [],
): { ok: boolean; value: number } {
  const trimmed = formula.trim();
  if (!trimmed) return { ok: false, value: 0 };

  const symbols: NumericFormulaSymbol[] = [...numericParameters];
  for (const entry of scopedVariables) {
    if (entry.variable.type !== 'number') continue;
    const val = Number(entry.playValue);
    symbols.push({ key: entry.fullKey, value: val, source: 'state' });
    if (entry.variable.name !== entry.fullKey) {
      symbols.push({ key: entry.variable.name, value: val, source: 'state' });
    }
  }

  const substituted = substituteNumericSymbols(trimmed, symbols);
  const tokens = tokenizeArithmetic(substituted);
  if (!tokens || tokens.length === 0) {
    return { ok: false, value: 0 };
  }

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < tokens.length) {
      const tok = peek();
      if (tok && tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
        consume();
        const right = parseTerm();
        if (right === null) return null;
        left = tok.value === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parseUnary();
    if (left === null) return null;
    while (pos < tokens.length) {
      const tok = peek();
      if (tok && tok.type === 'op' && (tok.value === '*' || tok.value === '/')) {
        consume();
        const right = parseUnary();
        if (right === null) return null;
        if (tok.value === '/') {
          if (right === 0) return null;
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  };

  const parseUnary = (): number | null => {
    const tok = peek();
    if (tok && tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
      consume();
      const inner = parseUnary();
      if (inner === null) return null;
      return tok.value === '-' ? -inner : inner;
    }
    return parsePrimary();
  };

  const parsePrimary = (): number | null => {
    const tok = peek();
    if (!tok) return null;
    if (tok.type === 'num') {
      consume();
      return tok.value;
    }
    if (tok.type === 'lparen') {
      consume();
      const val = parseExpr();
      const close = peek();
      if (val === null || !close || close.type !== 'rparen') return null;
      consume();
      return val;
    }
    return null;
  };

  const result = parseExpr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return { ok: false, value: 0 };
  }
  const rounded = Math.round(result * 1000) / 1000;
  return { ok: true, value: rounded };
}

type BoolToken =
  | { type: 'bool'; value: boolean }
  | { type: 'and' }
  | { type: 'or' }
  | { type: 'not' }
  | { type: 'lparen' }
  | { type: 'rparen' };

function evaluateAtomicCondition(
  atom: string,
  scopedVariables: ScopedStateVariable[],
  numericParameters: NumericFormulaSymbol[],
): boolean | null {
  const trimmed = atom.trim();
  if (!trimmed) return null;
  const low = trimmed.toLowerCase();
  if (low === 'true' || low === '是') return true;
  if (low === 'false' || low === '否') return false;

  // Comparison expression: LHS (==|!=|>=|<=|>|<) RHS
  const cmpMatch = trimmed.match(/^(.+?)\s*(>=|<=|!=|==|>|<|=)\s*(.+)$/);
  if (cmpMatch) {
    const lhsRaw = cmpMatch[1].trim();
    const op = cmpMatch[2];
    const rhsRaw = cmpMatch[3].trim();

    const lhsNum = evaluateNumberFormula(lhsRaw, scopedVariables, numericParameters);
    const rhsNum = evaluateNumberFormula(rhsRaw, scopedVariables, numericParameters);
    if (lhsNum.ok && rhsNum.ok) {
      switch (op) {
        case '>':
          return lhsNum.value > rhsNum.value;
        case '>=':
          return lhsNum.value >= rhsNum.value;
        case '<':
          return lhsNum.value < rhsNum.value;
        case '<=':
          return lhsNum.value <= rhsNum.value;
        case '!=':
          return lhsNum.value !== rhsNum.value;
        case '=':
        case '==':
          return lhsNum.value === rhsNum.value;
      }
    }

    // Fallback string/boolean equality for Choice / Text / Boolean states
    const resolveStr = (raw: string): string => {
      const cleaned = raw.replace(/^["'“]|["'”]$/g, '').trim();
      const matched = scopedVariables.find(
        (v) =>
          v.fullKey.toLowerCase() === cleaned.toLowerCase() ||
          v.variable.name.toLowerCase() === cleaned.toLowerCase(),
      );
      if (matched) return String(matched.playValue).toLowerCase();
      return cleaned.toLowerCase();
    };
    const lStr = resolveStr(lhsRaw);
    const rStr = resolveStr(rhsRaw);
    if (op === '!=') return lStr !== rStr;
    if (op === '=' || op === '==') return lStr === rStr;
    return null;
  }

  // Direct Boolean State lookup (prefer fullKey first)
  const matched =
    scopedVariables.find((v) => v.fullKey.toLowerCase() === low) ??
    scopedVariables.find((v) => v.variable.name.toLowerCase() === low);
  if (matched) {
    if (matched.variable.type === 'boolean') return Boolean(matched.playValue);
    if (matched.variable.type === 'number') return Number(matched.playValue) > 0;
    return String(matched.playValue).trim().length > 0;
  }

  return null;
}

export function evaluateBooleanFormula(
  formula: string,
  scopedVariables: ScopedStateVariable[],
  numericParameters: NumericFormulaSymbol[] = [],
): { ok: boolean; value: boolean } {
  const trimmed = formula.trim();
  if (!trimmed) return { ok: false, value: false };

  // Tokenize preserving parentheses, AND, OR, NOT, and atomic condition chunks
  const tokens: BoolToken[] = [];
  let i = 0;
  while (i < trimmed.length) {
    if (/\s/.test(trimmed[i])) {
      i += 1;
      continue;
    }
    if (trimmed[i] === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (trimmed[i] === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }

    const rest = trimmed.slice(i);
    const andMatch = rest.match(/^(?:AND\b|&&|且)/i);
    if (andMatch) {
      tokens.push({ type: 'and' });
      i += andMatch[0].length;
      continue;
    }
    const orMatch = rest.match(/^(?:OR\b|\|\||或)/i);
    if (orMatch) {
      tokens.push({ type: 'or' });
      i += orMatch[0].length;
      continue;
    }
    const notMatch = rest.match(/^(?:NOT\b|!(?!=)|非)/i);
    if (notMatch) {
      tokens.push({ type: 'not' });
      i += notMatch[0].length;
      continue;
    }

    // Consume until next parens or logical operator
    let end = i;
    while (end < trimmed.length) {
      const ch = trimmed[end];
      if (ch === '(' || ch === ')') break;
      const slice = trimmed.slice(end);
      if (/^(?:\s+(?:AND|OR|NOT)\b|\s*&&|\s*\|\|)/i.test(slice)) break;
      end += 1;
    }
    const atom = trimmed.slice(i, end).trim();
    if (!atom) return { ok: false, value: false };
    const evaluated = evaluateAtomicCondition(atom, scopedVariables, numericParameters);
    if (evaluated === null) return { ok: false, value: false };
    tokens.push({ type: 'bool', value: evaluated });
    i = end;
  }

  if (tokens.length === 0) return { ok: false, value: false };

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  const parseOr = (): boolean | null => {
    let left = parseAnd();
    if (left === null) return null;
    while (peek()?.type === 'or') {
      consume();
      const right = parseAnd();
      if (right === null) return null;
      left = left || right;
    }
    return left;
  };

  const parseAnd = (): boolean | null => {
    let left = parseNot();
    if (left === null) return null;
    while (peek()?.type === 'and') {
      consume();
      const right = parseNot();
      if (right === null) return null;
      left = left && right;
    }
    return left;
  };

  const parseNot = (): boolean | null => {
    if (peek()?.type === 'not') {
      consume();
      const inner = parseNot();
      return inner === null ? null : !inner;
    }
    const tok = peek();
    if (!tok) return null;
    if (tok.type === 'bool') {
      consume();
      return tok.value;
    }
    if (tok.type === 'lparen') {
      consume();
      const inner = parseOr();
      if (inner === null || peek()?.type !== 'rparen') return null;
      consume();
      return inner;
    }
    return null;
  };

  const res = parseOr();
  if (res === null || pos !== tokens.length) return { ok: false, value: false };
  return { ok: true, value: res };
}

/**
 * Computes the next StateVariableValue when an Outcome card's Related Property rule fires.
 */
export function applyOutcomePropertyRule(
  rule: OutcomePropertyRule,
  target: ScopedStateVariable,
  allScopedVariables: ScopedStateVariable[],
  numericParameters: NumericFormulaSymbol[] = [],
): StateVariableValue {
  const { variable, playValue } = target;

  if (variable.type === 'number') {
    if (rule.op === 'reset') {
      return coerceVariableValue(variable, variable.initialValue);
    }
    if (rule.op === 'set') {
      return coerceVariableValue(variable, rule.numberValue ?? 0);
    }
    if (rule.op === 'random') {
      const a = Number.isFinite(rule.randomMin) ? Number(rule.randomMin) : 0;
      const b = Number.isFinite(rule.randomMax) ? Number(rule.randomMax) : 10;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const isInt = Number.isInteger(lo) && Number.isInteger(hi);
      const raw = isInt
        ? Math.floor(Math.random() * (hi - lo + 1)) + lo
        : Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
      return coerceVariableValue(variable, raw);
    }
    if (rule.op === 'formula') {
      const evalRes = evaluateNumberFormula(
        rule.formula ?? '',
        allScopedVariables,
        numericParameters,
      );
      if (evalRes.ok) {
        return coerceVariableValue(variable, evalRes.value);
      }
      return playValue;
    }
  }

  if (variable.type === 'boolean') {
    if (rule.op === 'reset') {
      return coerceVariableValue(variable, variable.initialValue);
    }
    if (rule.op === 'set') {
      return Boolean(rule.booleanValue);
    }
    if (rule.op === 'toggle') {
      return !Boolean(playValue);
    }
    if (rule.op === 'formula') {
      const evalRes = evaluateBooleanFormula(
        rule.formula ?? '',
        allScopedVariables,
        numericParameters,
      );
      if (evalRes.ok) return evalRes.value;
      return playValue;
    }
  }

  if (variable.type === 'choice') {
    const opts = variable.options && variable.options.length > 0 ? variable.options : [];
    if (rule.op === 'reset') {
      return coerceVariableValue(variable, variable.initialValue);
    }
    if (rule.op === 'set') {
      return coerceVariableValue(variable, rule.choiceValue ?? opts[0] ?? '');
    }
    if (rule.op === 'random') {
      if (opts.length === 0) return playValue;
      return opts[Math.floor(Math.random() * opts.length)];
    }
    if (rule.op === 'step' && variable.ordered && opts.length > 0) {
      const currentIdx = Math.max(0, opts.indexOf(String(playValue)));
      const delta = rule.stepDirection === 'previous' ? -1 : 1;
      const wrap = rule.stepWrap ?? 'stay';
      let nextIdx = currentIdx + delta;
      if (wrap === 'loop') {
        nextIdx = ((nextIdx % opts.length) + opts.length) % opts.length;
      } else {
        nextIdx = Math.max(0, Math.min(opts.length - 1, nextIdx));
      }
      return opts[nextIdx];
    }
  }

  if (variable.type === 'text') {
    if (rule.op === 'reset') {
      return String(variable.initialValue ?? '');
    }
    if (rule.op === 'clear') {
      return '';
    }
    if (rule.op === 'set') {
      return String(rule.textValue ?? '');
    }
    if (rule.op === 'append') {
      return `${String(playValue ?? '')}${String(rule.textValue ?? '')}`;
    }
  }

  return playValue;
}
