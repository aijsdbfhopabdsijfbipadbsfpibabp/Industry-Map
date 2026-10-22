// 概要表示：市場規模・トレンド・年表・出典
import { esc } from '../util.js';

function safeUrl(u) {
  return /^https?:\/\//i.test(u || '') ? u : '';
}

export function marketItemHtml(m, world) {
  const url = safeUrl(m.url);
  const src = m.source ? (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(m.source)}</a>` : esc(m.source)) : '';
  return `
    <div class="market-item${world ? ' is-world' : ''}">
      <div class="k">${esc(m.label)}${m.period ? `（${esc(m.period)}）` : ''}</div>
      <div class="v">${esc(m.value)}</div>
      ${m.note ? `<div class="n">${esc(m.note)}</div>` : ''}
      ${src ? `<div class="n">出典：${src}</div>` : ''}
    </div>`;
}

export function renderOverview(root, ctx) {
  const { sector, state, visible } = ctx;
  const showWorld = state.region === 'world';
  const parts = [];

  if (sector.summary) {
    parts.push(`<section class="card span2"><h2>ざっくり言うと</h2>${sector.summary.split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}</section>`);
  }

  const markets = [];
  if (sector.market.jp) markets.push(marketItemHtml(sector.market.jp, false));
  if (sector.market.global && showWorld) markets.push(marketItemHtml(sector.market.global, true));
  if (markets.length) {
    const hint = sector.market.global && !showWorld ? '<p class="small muted" style="margin-top:8px">右上を「世界」にすると世界市場も表示します。</p>' : '';
    parts.push(`<section class="card span2"><h2>市場規模</h2><div class="market">${markets.join('')}</div>${hint}</section>`);
  }

  if (sector.trends.length) {
    parts.push(`<section class="card"><h2>トレンド・論点</h2><ul class="trends">${sector.trends
      .map((t) => `<li><b>${esc(t.title)}</b>${t.text ? `<span>${esc(t.text)}</span>` : ''}</li>`)
      .join('')}</ul></section>`);
  }

  if (sector.timeline.length) {
    parts.push(`<section class="card"><h2>年表</h2><ol class="timeline">${sector.timeline
      .map((t) => `<li><time>${esc(t.date ?? '')}</time><span>${esc(t.text)}</span></li>`)
      .join('')}</ol></section>`);
  }

  const counts = {
    jp: sector.companies.filter((c) => c.region === 'jp').length,
    ov: sector.companies.filter((c) => c.region === 'overseas').length,
  };
  const noteItems = [...sector.notes, `掲載：国内 ${counts.jp}社・海外 ${counts.ov}社（いま表示中 ${visible.length}社）`];
  parts.push(`<section class="card"><h2>メモ</h2><ul class="notes">${noteItems.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>${
    sector.updated ? `<p class="updated" style="margin-top:10px">データ更新：${esc(sector.updated)}</p>` : ''
  }</section>`);

  if (sector.sources.length) {
    parts.push(`<section class="card"><h2>出典・参考</h2><ul class="sources">${sector.sources
      .map((s) => {
        const url = safeUrl(s.url);
        return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(s.title || url)}</a>` : esc(s.title)}</li>`;
      })
      .join('')}</ul></section>`);
  }

  if (sector.warnings.length) {
    parts.push(`<section class="card warn span2"><h2>データのチェック（${sector.warnings.length}件）</h2><ul class="notes">${sector.warnings
      .map((w) => `<li>${esc(w)}</li>`)
      .join('')}</ul></section>`);
  }

  root.innerHTML = `<div class="ov">${parts.join('')}</div>`;
}
