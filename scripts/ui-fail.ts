import { chromium } from 'playwright-core';

const exe = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const errors: string[] = [];
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-flow__node');

// 设置事件序列：SUBMIT, APPROVE, TIMEOUT （TIMEOUT 在 pending_pay 上命中两条无守卫转换）
const eventBox = page.locator('.debug-textarea').nth(1);
await eventBox.fill('SUBMIT\nAPPROVE\nTIMEOUT');
await page.getByRole('button', { name: /开始调试/ }).click();
await page.waitForTimeout(200);

for (let i = 0; i < 3; i++) {
  const fwd = page.getByRole('button', { name: '前进' });
  if (await fwd.isDisabled()) break;
  await fwd.click();
  await page.waitForTimeout(400);
}
const stopTags = await page.locator('.trace-tag-stop').count();
const stopText = await page.locator('.trace-item.is-active').innerText();
console.log('stop tags:', stopTags);
console.log('active trace:', stopText.replace(/\n/g, ' | ').slice(0, 200));
if (!stopText.includes('同时命中 2 条')) throw new Error('未按歧义停止');
if (!stopText.includes('待支付')) throw new Error('歧义时状态不应改变');
// 前进按钮必须禁用
const fwdDisabled = await page.getByRole('button', { name: '前进' }).isDisabled();
if (!fwdDisabled) throw new Error('停止后前进按钮应禁用');
// 回退到歧义步骤之前后，又可以前进（回退不破坏后续行为）
await page.getByRole('button', { name: '回退' }).click();
await page.waitForTimeout(200);
const fwdEnabledAfterBack = !(await page.getByRole('button', { name: '前进' }).isDisabled());
console.log('forward enabled after back:', fwdEnabledAfterBack);
if (!fwdEnabledAfterBack) throw new Error('回退后应可再次前进');

// 上下文 JSON 非法时阻止开始
await page.getByRole('button', { name: '退出调试' }).click();
await page.waitForTimeout(200);
await page.locator('.debug-textarea').first().fill('{ not json');
await page.getByRole('button', { name: /开始调试/ }).click();
await page.waitForTimeout(200);
const errBanner = await page.locator('.debug-input-error').count();
console.log('json error banner:', errBanner);
if (errBanner !== 1) throw new Error('非法 JSON 应给出错误提示');

// 导入一个最小合法 JSON（用文件 chooser 不便于构造，直接走 store 不方便；验证无效 JSON 报错）
await page.locator('.debug-textarea').first().fill('{}');
if (errors.length) {
  console.error(errors);
  throw new Error('运行时错误');
}
console.log('FAIL-PATH UI TEST PASSED');
await browser.close();
