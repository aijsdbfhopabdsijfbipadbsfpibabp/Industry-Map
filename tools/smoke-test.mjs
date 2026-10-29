// 全業界の画面をざっと確認するテスト（Playwright）
//
// 使い方：
//   1) リポジトリのフォルダで   python3 -m http.server 8765
//   2) 別のターミナルで         node tools/smoke-test.mjs
//      （別のURLで確かめるとき  BASE_URL=http://localhost:8000/ node tools/smoke-test.mjs）
//
// 確かめること：
//   - スマホ幅（iPhone 13）とPC幅（1366px）で、横にはみ出していないか
//   - 「概要」の一番下に「データのチェック」（JSONの不整合）が出ていないか
//   - コンソールにエラーが出ていないか
//   - 「つながり」タブがある業界は、図が描けているか
// 画面写真は tools/screenshots/ に保存する（git には入れない）。

import { mkdirSync } from 'node:fs';

let pw;
try {
  pw = await import('playwright');
} catch {
  // Claude Code のクラウド環境では、ここに Playwright が入っていた
  pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
}
const { chromium, devices } = pw;

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765/';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];
const fail = (msg) => errors.push('FAIL: ' + msg);

const browser = await chromium.launch();

async function run(label, contextOptions) {
  const ctx = await browser.newContext({ ...contextOptions, locale: 'ja-JP' });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console error: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));

  await p.goto(BASE);
  await p.waitForSelector('.tab[data-sector]');
  const ids = await p.$$eval('.tab[data-sector]', (t) => t.map((x) => x.dataset.sector));
  console.log(`[${label}] 業界 ${ids.length}件: ${ids.join(', ')}`);

  for (const id of ids) {
    for (const region of ['jp', 'world']) {
      await p.goto(`${BASE}#/${id}/map`);
      await p.waitForSelector('#viewSwitch .seg-btn');
      await p.click(`[data-region="${region}"]`);
      await p.waitForTimeout(250);
      const views = await p.$$eval('#viewSwitch .seg-btn', (b) => b.map((x) => x.dataset.view));
      for (const v of views) {
        await p.click(`[data-view="${v}"]`);
        await p.waitForTimeout(300);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) fail(`[${label}] ${id} ${region} ${v}: 横にはみ出している`);
        if (v === 'info') {
          const warn = await p.$('.card.warn');
          if (warn) fail(`[${label}] ${id}: データのチェック → ${(await warn.textContent()).slice(0, 200)}`);
        }
        if (v === 'net') {
          const n = await p.$$eval('.net-svg .nl', (g) => g.length);
          if (!n) fail(`[${label}] ${id}: つながりの線が描けていない`);
        }
        if (region === 'world' && (v === 'map' || v === 'net')) {
          await p.screenshot({ path: `${OUT}${label}-${id}-${v}.png`, fullPage: v === 'map' });
        }
      }
    }
  }
  await ctx.close();
}

await run('mobile', devices['iPhone 13']);
await run('desktop', { viewport: { width: 1366, height: 900 } });
await browser.close();

console.log(errors.length ? errors.join('\n') : 'ALL CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
