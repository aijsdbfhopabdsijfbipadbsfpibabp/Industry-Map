// ランキング表示：指標を選んで棒グラフで比較
import { esc, formatValue } from '../util.js';

export function renderRanking(root, ctx) {
  const { sector, state, visible } = ctx;
  const key = sector.metricMap.has(state.rankMetric[sector.id]) ? state.rankMetric[sector.id] : sector.rankBy;
  const metric = sector.metricMap.get(key);

  const withValue = visible.filter((c) => typeof c.values[key] === 'number');
  const groupOptions = sector.groups.filter((g) => withValue.some((c) => c.group === g.id));
  const groupFilter = groupOptions.some((g) => g.id === state.rankGroup[sector.id]) ? state.rankGroup[sector.id] : '';
  const rows = groupFilter ? withValue.filter((c) => c.group === groupFilter) : withValue.slice();
  rows.sort((a, b) => (metric.order === 'asc' ? a.values[key] - b.values[key] : b.values[key] - a.values[key]));
  const max = rows.reduce((m, c) => Math.max(m, Math.abs(c.values[key])), 0) || 1;
  const missing = visible.filter((c) => typeof c.values[key] !== 'number' && (!groupFilter || c.group === groupFilter));

  const listHtml = rows
    .map((c, i) => {
      const v = c.values[key];
      const meta = c.valueMeta[key] || {};
      const g = sector.groupMap.get(c.group);
      const pct = Math.max(1.5, (Math.abs(v) / max) * 100);
      const neg = v < 0;
      const metaBits = [
        `<span class="grp" style="--g:${g.color}">${esc(g.name)}</span>`,
        c.region === 'overseas' ? `<span class="tag-ov">${esc(c.country || '海外')}</span>` : '',
        meta.period || c.fy ? `<span>${esc(meta.period || c.fy)}</span>` : '',
        meta.note ? `<span>${esc(meta.note)}</span>` : '',
      ].filter(Boolean).join('');
      return `
        <li class="rank-row">
          <button type="button" class="rank-btn" data-id="${esc(c.id)}">
            <span class="rank-no">${i + 1}</span>
            <span class="rank-body">
              <span class="rank-top">
                <span class="rank-name">${esc(c.name)}</span>
                <span class="rank-val${neg ? ' is-neg' : ''}">${esc(formatValue(v, metric, meta))}</span>
              </span>
              <span class="rank-bar${neg ? ' is-neg' : ''}" style="--g:${g.color}"><i style="width:${pct.toFixed(1)}%"></i></span>
              <span class="rank-meta">${metaBits}</span>
            </span>
          </button>
        </li>`;
    })
    .join('');

  root.innerHTML = `
    <div class="seg seg-scroll" role="group" aria-label="比べる指標">
      ${sector.metrics.map((m) => `<button type="button" class="seg-btn" data-metric="${esc(m.key)}" aria-pressed="${m.key === key}">${esc(m.label)}</button>`).join('')}
    </div>
    ${groupOptions.length > 1 ? `<div class="toolbar rank-filter"><label class="select"><span>グループ</span><select id="rankGroupSel" aria-label="グループで絞り込み">
      <option value="">すべて（${withValue.length}社）</option>
      ${groupOptions.map((g) => `<option value="${esc(g.id)}"${g.id === groupFilter ? ' selected' : ''}>${esc(g.name)}（${withValue.filter((c) => c.group === g.id).length}社）</option>`).join('')}
    </select></label></div>` : ''}
    ${metric.description ? `<p class="rank-note">${esc(metric.description)}</p>` : ''}
    <div class="rank-wrap">
      ${rows.length ? `<ol class="rank">${listHtml}</ol>` : '<p class="empty">この指標のデータはまだありません。</p>'}
    </div>
    ${metric.order === 'asc' ? '<p class="rank-note">※ 小さい順に並べています。</p>' : ''}
    ${missing.length ? `<details class="rank-missing"><summary>データなし ${missing.length}社</summary>${missing.map((c) => esc(c.name)).join('、')}</details>` : ''}`;

  root.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => ctx.onRankMetric(b.dataset.metric)));
  root.querySelector('#rankGroupSel')?.addEventListener('change', (e) => ctx.onRankGroup(e.target.value));
  root.querySelector('.rank')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.rank-btn');
    if (btn) ctx.onSelect(btn.dataset.id);
  });
}
