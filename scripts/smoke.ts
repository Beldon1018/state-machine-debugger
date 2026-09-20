import { analyzeMachine } from '../src/lib/analyzer';
import { evaluateGuard, validateExpression } from '../src/lib/eval';
import { createSampleMachine } from '../src/lib/sample';
import { deserializeMachine, serializeMachine } from '../src/lib/machine';
import { findInitial, runEventStep, makeInitStep } from '../src/lib/interpreter';
import type { Context, Machine } from '../src/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name} ${extra}`);
  }
}

// ---- 守卫求值 ----
check('true 字面量', evaluateGuard('true', {}).truthy === true);
check('数值比较 true', evaluateGuard('amount >= 300', { amount: 300 }).truthy === true);
check('数值比较 false', evaluateGuard('amount >= 300', { amount: 299 }).truthy === false);
check('逻辑与', evaluateGuard('a > 0 && b === "x"', { a: 1, b: 'x' }).truthy === true);
check('逻辑或短路', evaluateGuard('false || x === 1', { x: 1 }).truthy === true);
check('取反', evaluateGuard('!vip', { vip: false }).truthy === true);
check('点路径', evaluateGuard('user.level === "vip"', { user: { level: 'vip' } }).truthy === true);
check('数组下标', evaluateGuard('items[0] === "a"', { items: ['a'] }).truthy === true);
check('三元', evaluateGuard('amount > 100 ? "big" === "big" : false', { amount: 200 }).truthy === true);
check('算术', evaluateGuard('(a + b) * 2 === 10', { a: 2, b: 3 }).truthy === true);
check('字符串拼接', String(evaluateGuard('"a" + 1', {}).value) === 'a1');
check('length 函数', evaluateGuard('length(items) === 3', { items: [1, 2, 3] }).truthy === true);
check('includes', evaluateGuard('includes(tags, "x")', { tags: ['x', 'y'] }).truthy === true);
check('空守卫恒真', evaluateGuard('   ', {}).truthy === true);
check('除零报错', evaluateGuard('1/0 === 0', {}).ok === false);
check('未知变量报错', evaluateGuard('missing === 1', {}).ok === false);
check('语法错误检测', validateExpression('vip ===') !== null);
check('合法表达式无错', validateExpression('a === 1 && (b || !c)') === null);
check('拒绝函数调用 eval', evaluateGuard('evil("x")', {}).ok === false);
check('成员访问 null 报错', evaluateGuard('a.b', { a: null }).ok === false);
check('恒等比较', evaluateGuard('a === b', { a: 1, b: 1 }).truthy === true);
check('严格不等类型', evaluateGuard('"1" !== 1', {}).truthy === true);

// ---- 示例分析 ----
const sample = createSampleMachine();
const analysis = analyzeMachine(sample);
const types = new Map(analysis.issues.map((i) => [i.type, i]));
check('示例：不可达', types.has('unreachable'));
check('示例：死胡同', types.has('dead-end'));
check('示例：非确定性(警告)', types.has('ambiguous'));
check('示例：守卫语法错误', types.has('guard-syntax'));
check('示例：空事件', types.has('empty-event'));
check('示例：初始唯一(无多初始错误)', !types.has('multiple-initial'));
check('示例：有初始(无缺初始错误)', !types.has('no-initial'));

// 歧义严重级别：TIMEOUT 两条无守卫 => error
const timeoutIssue = analysis.issues.find(
  (i) => i.type === 'ambiguous' && i.message.includes('TIMEOUT'),
);
check('示例：TIMEOUT 歧义为 error', timeoutIssue?.severity === 'error');
// SUBMIT 守卫存在重叠区间（amount > 10000 时两条都成立）=> warning 级歧义
const submitAmb = analysis.issues.find((i) => i.type === 'ambiguous' && i.message.includes('SUBMIT'));
check('示例：SUBMIT 守卫重叠为 warning', submitAmb?.severity === 'warning');

// 初始配置
function withFlags(machine: Machine, flags: Record<string, { initial?: boolean; final?: boolean }>): Machine {
  return {
    ...machine,
    nodes: machine.nodes.map((n) =>
      n.id in flags
        ? { ...n, data: { ...n.data, initial: flags[n.id].initial ?? n.data.initial, final: flags[n.id].final ?? n.data.final } }
        : n,
    ),
  };
}
const noInitial = analyzeMachine(withFlags(sample, { draft: { initial: false } }));
check('缺初始状态被识别', noInitial.issues.some((i) => i.type === 'no-initial'));
const twoInitial = analyzeMachine(withFlags(sample, { paid: { initial: true } }));
check('多初始状态被识别', twoInitial.issues.some((i) => i.type === 'multiple-initial'));

// 悬空边
const dangling: Machine = {
  nodes: [
    { id: 'a', type: 'state', position: { x: 0, y: 0 }, data: { label: 'A', initial: true, final: false } },
    { id: 'b', type: 'state', position: { x: 0, y: 0 }, data: { label: 'B', initial: false, final: true } },
  ],
  edges: [
    { id: 'e1', type: 'transition', source: 'a', target: 'b', data: { event: 'GO', guard: '' } },
    { id: 'e2', type: 'transition', source: 'a', target: 'ghost', data: { event: 'X', guard: '' } },
  ],
};
check('悬空边被识别', analyzeMachine(dangling).issues.some((i) => i.type === 'dangling-edge'));

// ---- 序列化往返 ----
const roundtrip = deserializeMachine(serializeMachine(sample));
check('序列化往返节点数', roundtrip.nodes.length === sample.nodes.length);
check('序列化往返边数', roundtrip.edges.length === sample.edges.length);

// ---- 解释器：成功路径 ----
const ctx: Context = { amount: 299, paidAmount: 299, vip: false };
const events = ['SUBMIT', 'APPROVE', 'PAY', 'SHIP', 'CONFIRM'];
let { state } = findInitial(sample);
check('初始状态是 draft', state === 'draft');
let step = makeInitStep(sample, state!, events.length);
for (const [idx, evt] of events.entries()) {
  step = runEventStep({
    machine: sample,
    currentState: step.stateAfter!,
    eventName: evt,
    eventIndex: idx,
    remainingEvents: events.length - idx - 1,
    stepIndex: idx + 1,
    context: ctx,
  });
}
check('成功路径结束于 completed', step.stateAfter === 'completed' && step.outcome === 'transitioned');
const completedNode = sample.nodes.find((n) => n.id === 'completed')!;
check('completed 是结束状态', completedNode.data.final === true);

// ---- 解释器：无可用转换停止 ----
const stuck = runEventStep({
  machine: sample, currentState: 'draft', eventName: 'NOPE',
  eventIndex: 0, remainingEvents: 0, stepIndex: 1, context: ctx,
});
check('无转换停止', stuck.outcome === 'no-transition' && stuck.stopped === true);

// ---- 解释器：守卫全部 false 停止 ----
const guardReject = runEventStep({
  machine: sample, currentState: 'draft', eventName: 'SUBMIT',
  eventIndex: 0, remainingEvents: 0, stepIndex: 1, context: { amount: 0 },
});
check('守卫全不通过停止', guardReject.outcome === 'no-transition');
check('候选收集了守卫结果', guardReject.candidates.length === 2 && guardReject.candidates.every((c) => c.result.ok));

// ---- 解释器：歧义停止（不随机选择）----
const amb = runEventStep({
  machine: sample, currentState: 'pending_pay', eventName: 'TIMEOUT',
  eventIndex: 0, remainingEvents: 0, stepIndex: 1, context: ctx,
});
check('歧义命中多条停止', amb.outcome === 'ambiguous' && amb.stopped);
check('歧义不选择任何边', amb.takenEdgeId === null && amb.stateAfter === 'pending_pay');
check('歧义候选为两条', amb.candidates.length === 2);

// ---- 解释器：守卫语法错误停止 ----
const badGuard = runEventStep({
  machine: sample, currentState: 'shipped', eventName: 'RETURN',
  eventIndex: 0, remainingEvents: 0, stepIndex: 1, context: ctx,
});
check('守卫错误停止', badGuard.outcome === 'guard-error' && badGuard.stopped);

// ---- 结束状态不处理事件 ----
const atFinal = runEventStep({
  machine: sample, currentState: 'rejected', eventName: 'PAY',
  eventIndex: 0, remainingEvents: 0, stepIndex: 1, context: ctx,
});
check('结束状态停止', atFinal.outcome === 'final-state' && atFinal.stopped);

// 唯一守卫命中
const payOk = runEventStep({
  machine: sample, currentState: 'pending_pay', eventName: 'PAY',
  eventIndex: 0, remainingEvents: 0, stepIndex: 1, context: { amount: 100, paidAmount: 100, vip: false },
});
check('唯一通过守卫转换', payOk.outcome === 'transitioned' && payOk.stateAfter === 'paid');

// 多初始禁止调试
const twoInitMachine = withFlags(sample, { paid: { initial: true } });
check('多初始无法开始', findInitial(twoInitMachine).error !== undefined);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
