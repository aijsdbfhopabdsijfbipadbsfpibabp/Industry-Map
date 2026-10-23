// 概要表示：市場規模・トレンド・年表・出典
import { esc, formatValue } from '../util.js';

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

  for (const x of sector.insights) {
    parts.push(`<section class="card span2 insight">
      <h2>考察メモ：${esc(x.title)}${x.date ? `<span class="muted small">（${esc(x.date)}）</span>` : ''}</h2>
      ${x.hypothesis ? `<div class="ins-hyp"><span class="ins-k">仮説</span><p>${esc(x.hypothesis)}</p><span class="ins-v is-${x.verdict}">${esc(x.verdictLabel)}</span></div>` : ''}
      <div class="ins-grid">${x.sections
        .map((s) => `<div class="ins-sec"><h3>${esc(s.label)}</h3><ul>${s.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></div>`)
        .join('')}</div>
      ${x.conclusion ? `<p class="ins-concl"><b>いまの結論</b>${esc(x.conclusion)}</p>` : ''}
      ${x.tag ? `<button type="button" class="ins-tag" data-tag="${esc(x.tag)}">マップで「#${esc(x.tag)}」を光らせる →</button>` : ''}
    </section>`);
  }

  const markets = [];
  if (sector.market.jp) markets.push(marketItemHtml(sector.market.jp, false));
  if (sector.market.global && showWorld) markets.push(marketItemHtml(sector.market.global, true));
  if (markets.length) {
    const hint = sector.market.global && !showWorld ? '<p class="small muted" style="margin-top:8px">右上を「世界」にすると世界市場も表示します。</p>' : '';
    parts.push(`<section class="card span2"><h2>市場規模</h2><div class="market">${markets.join('')}</div>${hint}</section>`);
  }

  for (const b of sector.breakdowns) {
    const max = Math.max(...b.items.map((it) => it.value), 0) || 1;
    const total = b.items.reduce((t, it) => t + it.value, 0);
    const url = safeUrl(b.url);
    const src = b.source ? (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(b.source)}</a>` : esc(b.source)) : '';
    parts.push(`<section class="card span2"><h2>${esc(b.title)}${b.period ? `<span class="muted small">（${esc(b.period)}）</span>` : ''}</h2>
      <ul class="bd">${b.items
        .map((it) => {
          const share = it.share ?? (total ? (it.value / total) * 100 : 0);
          return `<li><span class="bd-label">${esc(it.label)}</span><span class="bd-bar"><i style="width:${((it.value / max) * 100).toFixed(1)}%"></i></span><span class="bd-val">${esc(formatValue(it.value, { unit: b.unit }))}<small>${share.toFixed(1)}%</small></span>${it.note ? `<span class="bd-note">${esc(it.note)}</span>` : ''}</li>`;
        })
        .join('')}</ul>
      ${b.note || src ? `<p class="small muted" style="margin-top:8px">${esc(b.note)}${b.note && src ? ' ／ ' : ''}${src ? `出典：${src}` : ''}</p>` : ''}
    </section>`);
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
  root.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => ctx.onShowTag(b.dataset.tag)));
}
