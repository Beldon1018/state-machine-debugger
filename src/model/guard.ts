type GuardFn = (ctx: Record<string, unknown>) => boolean;

interface CompiledGuard {
  fn: GuardFn | null;
  error: string | null;
}

const guardCache = new Map<string, CompiledGuard>();

function compileGuard(expr: string): CompiledGuard {
  const key = String(expr ?? '');
  const cached = guardCache.get(key);
  if (cached) return cached;
  let compiled: CompiledGuard;
  if (!key.trim()) {
    compiled = { fn: null, error: null };
  } else {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('ctx', `with (ctx || {}) { return !!(${key}); }`) as GuardFn;
      compiled = { fn, error: null };
    } catch (e) {
      compiled = { fn: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
  guardCache.set(key, compiled);
  return compiled;
}

/** 返回 null 表示语法正确，否则返回错误信息。 */
export function validateGuard(expr: string): string | null {
  return compileGuard(expr).error;
}

/** 求值守卫，空守卫视为 true。 */
export function evalGuard(
  expr: string,
  context: Record<string, unknown>,
): { value: boolean; error: string | null } {
  const compiled = compileGuard(expr);
  if (!compiled.fn) {
    return compiled.error
      ? { value: false, error: compiled.error }
      : { value: true, error: null };
  }
  try {
    return { value: !!compiled.fn(context ?? {}), error: null };
  } catch (e) {
    return { value: false, error: e instanceof Error ? e.message : String(e) };
  }
}
