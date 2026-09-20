import { chromium } from 'playwright-core';

const exe = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const errors: string[] = [];

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-flow__node', { timeout: 10000 });

const nodeCount = await page.locator('.react-flow__node').count();
const edgeCount = await page.locator('.react-flow__edge').count();
console.log('nodes:', nodeCount, 'edges:', edgeCount);
if (nodeCount < 10) throw new Error('示例节点渲染不足');

const issueItems = await page.locator('.issue-item').count();
console.log('issue items:', issueItems);
if (issueItems < 5) throw new Error('问题列表数量异常');

// 点击第一个问题：应定位并选中某元素
await page.locator('.issue-item').first().click();
await page.waitForTimeout(600);
const selected = await page.locator('.react-flow__node.selected, .react-flow__edge.selected').count();
console.log('after issue click selected:', selected);
if (selected < 1) throw new Error('点击问题后未选中元素');

// 选中一个节点 -> 属性面板出现
await page.locator('.react-flow__node').first().click({ force: true });
await page.waitForTimeout(200);
const labelInput = page.locator('.inspector-form .field-input').first();
await labelInput.waitFor({ timeout: 3000 });
const initialValue = await labelInput.inputValue();
console.log('selected node label:', JSON.stringify(initialValue));
const stateDump = await page.evaluate(() => {
  const ls = localStorage.getItem('state-machine-debugger:v1');
  return ls ? JSON.parse(ls).machine.nodes.find((n:any)=>n.id==='manual_review') : null;
});
console.log('persisted selected at start:', JSON.stringify(stateDump));

// 改名称 -> 撤销 -> 恢复
await labelInput.fill('测试改名状态');
await labelInput.blur();
await page.waitForTimeout(200);
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
const restoredList = await page.locator('.state-node-label').allInnerTexts();
const restored = restoredList.find((x) => x.includes('人工审核') || x.includes('测试改名')) ?? '';
console.log('after undo label:', restored);
if (!restored.includes('废弃-人工审核')) throw new Error('撤销未恢复名称: ' + restored);

// 点击一条边的标签 -> edge inspector（先缩放到全图保证在视口内）
await page.locator('.fit-view-btn').click();
await page.waitForTimeout(500);
await page.locator('.transition-edge-label').first().click({ force: true });
await page.waitForTimeout(200);
const edgeEventVisible = await page.locator('.edge-route').count();
console.log('edge route panel:', edgeEventVisible);
if (edgeEventVisible !== 1) throw new Error('点击边标签未打开转换属性');

// 开始调试
await page.getByRole('button', { name: /开始调试/ }).click();
await page.waitForTimeout(300);
const initTrace = await page.locator('.trace-item').count();
console.log('init trace items:', initTrace);
if (initTrace !== 1) throw new Error('开始调试后应只有初始化步骤');

// 前进步数直到停止或事件耗尽
let guard = 0;
while (guard < 10) {
  const forward = page.getByRole('button', { name: '前进' });
  const disabled = await forward.isDisabled();
  if (disabled) break;
  await forward.click();
  await page.waitForTimeout(450);
  guard += 1;
}
const steps = await page.locator('.trace-item').count();
const stopTags = await page.locator('.trace-tag-stop').count();
const successTags = await page.locator('.trace-tag-success').count();
const activeNode = await page.locator('.state-node.is-active').count();
console.log('steps:', steps, 'stop tags:', stopTags, 'success tags:', successTags, 'active node:', activeNode);
if (steps !== 7) throw new Error('步进执行数量异常（预期初始化 + 5 事件 + 完成）');
if (activeNode < 1) throw new Error('当前状态未高亮');
if (successTags < 6) throw new Error('成功步骤数异常');

// 调试模式工具栏撤销应禁用
const undoDisabled = await page.getByRole('button', { name: /撤销/ }).isDisabled();
console.log('undo disabled in debug:', undoDisabled);
if (!undoDisabled) throw new Error('调试模式下撤销应禁用');

// 回退 2 步
await page.getByRole('button', { name: '回退' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: '回退' }).click();
await page.waitForTimeout(300);
const afterBack = await page.locator('.trace-item.is-active').count();
console.log('active after back:', afterBack);
if (afterBack !== 1) throw new Error('回退后应有一个活动步骤');

// 重新开始
await page.getByRole('button', { name: '重新开始' }).click();
await page.waitForTimeout(300);
const restartSteps = await page.locator('.trace-item').count();
console.log('after restart steps:', restartSteps);
if (restartSteps !== 1) throw new Error('重新开始后应只剩初始化');

// 退出调试
await page.getByRole('button', { name: '退出调试' }).click();
await page.waitForTimeout(300);
const traceGone = await page.locator('.trace-item').count();
console.log('trace after exit:', traceGone);

// 自动布局
await page.getByRole('button', { name: /自动布局/ }).click();
await page.waitForTimeout(500);

// 导出 JSON 触发下载
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /导出 JSON/ }).click(),
]);
console.log('download suggested:', download.suggestedFilename());

// 保存到本地
await page.getByRole('button', { name: /本地保存/ }).click();
await page.waitForTimeout(200);
const savedText = await page.locator('.save-ok').count();
console.log('save indicator:', savedText);
const localStorageRaw = await page.evaluate(() => localStorage.getItem('state-machine-debugger:v1'));
if (!localStorageRaw) throw new Error('本地保存未写入 localStorage');
const parsed = JSON.parse(localStorageRaw);
console.log('persisted nodes:', parsed.machine.nodes.length);

if (errors.length) {
  console.error('\n--- console/page errors ---');
  errors.slice(0, 20).forEach((e) => console.error(e));
  throw new Error('页面存在运行时错误');
}
console.log('\nUI TEST PASSED');
await browser.close();
