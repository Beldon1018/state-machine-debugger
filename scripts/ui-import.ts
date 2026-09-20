import { chromium } from 'playwright-core';
const exe = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const toasts: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGEERR', m.text()); });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-flow__node');

// 导入文件
const fileChooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: /导入 JSON/ }).click();
const chooser = await fileChooser;
await chooser.setFiles('/tmp/test-machine.json');
await page.waitForTimeout(400);
const nodeCount = await page.locator('.react-flow__node').count();
const edgeCount = await page.locator('.react-flow__edge').count();
console.log('after import nodes/edges:', nodeCount, edgeCount);
if (nodeCount !== 2 || edgeCount !== 1) throw new Error('导入后图数量不对');
const issues = await page.locator('.issue-item').count();
console.log('issues on imported clean graph:', issues);
if (issues !== 0) throw new Error('干净图不应有问题');
const toast = await page.locator('.toast').first().innerText();
console.log('toast:', toast);
if (!toast.includes('导入成功')) throw new Error('缺少导入成功提示');

// 位置保留检查
const transform = await page.locator('.react-flow__node[data-id="n2"]').getAttribute('style');
console.log('n2 style:', transform);
if (!transform?.includes('transform: translate(400px, 100px)')) throw new Error('导入位置未保留');

// 自动布局后导出
await page.getByRole('button', { name: /自动布局/ }).click();
await page.waitForTimeout(400);
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /导出 JSON/ }).click(),
]);
const path = '/tmp/exported.json';
await download.saveAs(path);
const exported = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'));
console.log('exported:', exported.nodes.length, exported.edges.length, exported.nodes[0].label);

// 无效 JSON 文件导入
const invalidPath = '/tmp/bad.json';
(await import('node:fs')).writeFileSync(invalidPath, '{ broken');
const fc2 = page.waitForEvent('filechooser');
await page.getByRole('button', { name: /导入 JSON/ }).click();
(await fc2).setFiles(invalidPath);
await page.waitForTimeout(300);
const errToast = await page.locator('.toast-error').first().innerText();
console.log('import error toast:', errToast);
if (!errToast.includes('导入失败')) throw new Error('无效文件应提示失败');
console.log('IMPORT/EXPORT TEST PASSED');
await browser.close();
