import type { Machine, StateNode, TransitionEdge } from '../types';

function node(
  id: string,
  label: string,
  x: number,
  y: number,
  flags: { initial?: boolean; final?: boolean } = {},
): StateNode {
  return {
    id,
    type: 'state',
    position: { x, y },
    data: { label, initial: Boolean(flags.initial), final: Boolean(flags.final) },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  event: string,
  guard = '',
): TransitionEdge {
  return {
    id,
    type: 'transition',
    source,
    target,
    data: { event, guard },
  };
}

export function createSampleMachine(): Machine {
  const nodes: StateNode[] = [
    node('draft', '草稿', 0, 180, { initial: true }),
    node('submitted', '已提交', 270, 180),
    node('pending_pay', '待支付', 540, 60),
    node('rejected', '已驳回（结束）', 540, 320, { final: true }),
    node('risk_review', '风控审核', 540, 470),
    node('paid', '已支付', 810, 60),
    node('archived', '已归档（结束）', 810, 220, { final: true }),
    node('shipped', '已发货', 1080, 60),
    node('refund_review', '退款审核', 1080, 240),
    node('completed', '已完成（结束）', 1350, 60, { final: true }),
    node('refunded', '已退款（结束）', 1350, 240, { final: true }),
    node('legacy_cancelled', '废弃-已取消（结束）', 540, 620, { final: true }),
    node('manual_review', '废弃-人工审核', 1080, 440),
  ];

  const edges: TransitionEdge[] = [
    edge('e_submit_ok', 'draft', 'submitted', 'SUBMIT', 'amount > 0'),
    edge('e_submit_big', 'draft', 'rejected', 'SUBMIT', 'amount > 10000'),
    edge('e_approve', 'submitted', 'pending_pay', 'APPROVE'),
    edge('e_reject', 'submitted', 'rejected', 'REJECT'),
    edge('e_risk', 'submitted', 'risk_review', 'RISK'),
    edge('e_pay_ok', 'pending_pay', 'paid', 'PAY', 'paidAmount >= amount'),
    edge('e_pay_low', 'pending_pay', 'rejected', 'PAY', 'paidAmount < amount'),
    edge('e_timeout_1', 'pending_pay', 'rejected', 'TIMEOUT'),
    edge('e_timeout_2', 'pending_pay', 'risk_review', 'TIMEOUT'),
    edge('e_cancel', 'pending_pay', 'archived', 'CANCEL'),
    edge('e_ship', 'paid', 'shipped', 'SHIP'),
    edge('e_empty_event', 'paid', 'archived', ''),
    edge('e_refund', 'paid', 'refund_review', 'REFUND'),
    edge('e_refund_approve', 'refund_review', 'refunded', 'APPROVE', 'vip === true'),
    edge('e_refund_reject', 'refund_review', 'paid', 'REJECT', 'vip !== true'),
    edge('e_confirm', 'shipped', 'completed', 'CONFIRM'),
    edge('e_return_bad', 'shipped', 'refund_review', 'RETURN', 'vip ==='),
  ];

  return { nodes, edges };
}

export const SAMPLE_CONTEXT = `{
  "amount": 299,
  "paidAmount": 299,
  "vip": false,
  "couponCount": 2
}`;

export const SAMPLE_EVENTS = ['SUBMIT', 'APPROVE', 'PAY', 'SHIP', 'CONFIRM'].join('\n');
