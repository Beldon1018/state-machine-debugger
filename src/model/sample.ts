import type { Machine } from './types';

/** 内置示例：故意带有不可达状态、死胡同、非确定性转换的订单履约流程。 */
export function buildSampleMachine(): Machine {
  return {
    name: '订单履约流程（含典型问题示例）',
    context: { score: 75, amount: 1200, vip: false, stock: 8 },
    states: [
      { id: 's_draft',     name: '草稿',     x: 0,    y: 220, initial: true,  final: false },
      { id: 's_review',    name: '待审核',   x: 240,  y: 220, initial: false, final: false },
      { id: 's_approved',  name: '审核通过', x: 480,  y: 120, initial: false, final: false },
      { id: 's_rejected',  name: '审核拒绝', x: 480,  y: 330, initial: false, final: false },
      { id: 's_pay',       name: '待支付',   x: 720,  y: 120, initial: false, final: false },
      { id: 's_paid',      name: '支付成功', x: 960,  y: 60,  initial: false, final: false },
      { id: 's_payfail',   name: '支付失败', x: 960,  y: 210, initial: false, final: false },
      { id: 's_ship',      name: '发货中',   x: 1200, y: 60,  initial: false, final: false },
      { id: 's_signed',    name: '已签收',   x: 1440, y: 60,  initial: false, final: false },
      { id: 's_done',      name: '已完成',   x: 1680, y: 60,  initial: false, final: true  },
      { id: 's_cancel',    name: '已取消',   x: 720,  y: 330, initial: false, final: true  },
      { id: 's_archive',   name: '已归档',   x: 1440, y: 330, initial: false, final: false },
      { id: 's_exception', name: '异常处理', x: 1200, y: 210, initial: false, final: false },
    ],
    transitions: [
      { id: 't1',  from: 's_draft',     to: 's_review',    event: '提交',         guard: '' },
      { id: 't2',  from: 's_review',    to: 's_approved',  event: '审核',         guard: 'score >= 60' },
      { id: 't3',  from: 's_review',    to: 's_rejected',  event: '审核',         guard: 'score < 60' },
      { id: 't4',  from: 's_rejected',  to: 's_draft',     event: '修改',         guard: '' },
      // 非确定性（必然冲突）：两条“支付”转换都没有守卫
      { id: 't5',  from: 's_pay',       to: 's_paid',      event: '支付',         guard: '' },
      { id: 't6',  from: 's_pay',       to: 's_exception', event: '支付',         guard: '' },
      // 非确定性（潜在冲突）：vip 且 amount>10000 时两个守卫同时为真
      { id: 't7',  from: 's_approved',  to: 's_pay',       event: '下单',         guard: 'amount <= 10000' },
      { id: 't8',  from: 's_approved',  to: 's_exception', event: '下单',         guard: 'vip == true' },
      { id: 't9',  from: 's_approved',  to: 's_cancel',    event: '取消',         guard: '' },
      { id: 't10', from: 's_paid',      to: 's_ship',      event: '发货',         guard: 'stock > 0' },
      { id: 't11', from: 's_ship',      to: 's_signed',    event: '签收',         guard: '' },
      { id: 't12', from: 's_signed',    to: 's_done',      event: '完成',         guard: '' },
      { id: 't13', from: 's_pay',       to: 's_cancel',    event: '取消',         guard: '' },
      { id: 't14', from: 's_exception', to: 's_pay',       event: '重试',         guard: '' },
      // 死胡同：支付失败没有任何出向转换
      { id: 't15', from: 's_pay',       to: 's_payfail',   event: '支付失败回调', guard: '' },
      // 不可达：已归档没有任何入边
      { id: 't16', from: 's_archive',   to: 's_done',      event: '恢复',         guard: '' },
    ],
  };
}

/** 演示用事件序列：走到“待支付”后触发非确定性而停止。 */
export const SAMPLE_EVENTS = ['提交', '审核', '下单', '支付', '发货', '签收', '完成', '退款'];
