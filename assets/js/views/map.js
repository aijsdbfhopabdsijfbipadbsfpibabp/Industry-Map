// マップ表示：グループごとのカードに、規模に応じた大きさのタイルを並べ、資本関係を線で結ぶ
import { esc, formatValue } from '../util.js';
import { RELATION_TYPES } from '../data.js';

/** sqrt(値 / 最大値) でタイルの大きさの段階を決める（面積がおおむね規模に比例） */
function sizeLevel(v, max) {
  if (!(v > 0) || !(max > 0)) return 'chip';
  const s = Math.sqrt(v / max);
  if (s >= 0.8) return 'xl';
  if (s >= 0.55) return 'l';
  if (s >= 0.38) return 'm';
  if (s >= 0.2) return 's';
  return 'xs';
}

const LEVEL_ORDER = { xl: 0, l: 1, m: 2, s: 3, xs: 4, chip: 5 };

function legendHtml(types) {
  const items = [];
  if (types.has('subsidiary')) items.push(`<span><svg width="30" height="10"><path d="M2 5H24" stroke="#8090b5" stroke-width="2"/><path d="M22 1.5L28 5L22 8.5z" fill="#8090b5"/></svg>子会社・傘下</span>`);
  if (types.has('equity')) items.push(`<span><svg width="30" height="10"><path d="M2 5H28" stroke="#8090b5" stroke-width="2" stroke-dasharray="6 4"/></svg>出資</span>`);
  if (types.has('alliance')) items.push(`<span><svg width="30" height="10"><path d="M2 5H28" stroke="#d9809e" stroke-width="2" stroke-dasharray="1.5 4" stroke-linecap="round"/></svg>提携・FC</span>`);
  if (types.has('other')) items.push(`<span><svg width="30" height="10"><path d="M2 5H28" stroke="#8f94a3" stroke-width="1.5" stroke-dasharray="3 3"/></svg>その他</span>`);
  return items.length ? `<div class="legend" aria-label="線の凡例">${items.join('')}</div>` : '';
}

export function renderMap(root, ctx) {
  const { sector, state, visible } = ctx;
  const override = state.sizeMetric[sector.id] || '';
  const visibleIds = new Set(visible.map((c) => c.id));

  // 指標ごとの最大値（表示中の企業のみ）
  const maxBy = {};
  for (const m of sector.metrics) {
    maxBy[m.key] = visible.reduce((mx, c) => (c.values[m.key] > mx ? c.values[m.key] : mx), 0);
  }

  const relTypes = new Set(sector.relations.filter((r) => visibleIds.has(r.from) && visibleIds.has(r.to)).map((r) => r.type));

  const groupsHtml = sector.groups
    .map((g) => {
      const items = visible.filter((c) => c.group === g.id);
      if (!items.length) return '';
      const key = override || g.sizeBy || sector.sizeBy;
      const metric = sector.metricMap.get(key);
      const relCount = (id) => sector.relations.filter((r) => (r.from === id || r.to === id) && visibleIds.has(r.from) && visibleIds.has(r.to)).length;
      const tiles = items
        .map((c, i) => ({ c, i, v: c.values[key], lvl: sizeLevel(c.values[key], maxBy[key]) }))
        .sort((a, b) => LEVEL_ORDER[a.lvl] - LEVEL_ORDER[b.lvl] || (b.v ?? -Infinity) - (a.v ?? -Infinity) || a.i - b.i)
        .map(({ c, v, lvl }) => tileHtml(c, lvl, metric, v, g, relCount(c.id)))
        .join('');
      const overseasOnly = items.every((c) => c.region === 'overseas');
      const sized = items.some((c) => c.values[key] > 0);
      return `
        <section class="group" style="--g:${g.color}" aria-label="${esc(g.name)}">
          <div class="group-head">
            <span class="group-dot" aria-hidden="true"></span>
            <h3>${esc(g.name)}</h3>
            ${overseasOnly ? '<span class="group-badge">海外</span>' : ''}
            <span class="group-meta">${items.length}社${sized ? `・大きさ=${esc(metric?.label ?? '')}` : ''}</span>
          </div>
          ${g.description ? `<p class="group-desc">${esc(g.description)}</p>` : ''}
          <div class="tiles">${tiles}</div>
        </section>`;
    })
    .join('');

  root.innerHTML = `
    <div class="toolbar">
      <label class="select">
        <span>大きさ</span>
        <select id="sizeSel" aria-label="タイルの大きさの基準">
          <option value="">おまかせ</option>
          ${sector.metrics.map((m) => `<option value="${esc(m.key)}"${override === m.key ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}
        </select>
      </label>
      ${relTypes.size ? `<button type="button" class="chip-toggle" id="linesBtn" aria-pressed="${state.showLines}" title="オフのときは、ほかのグループをまたぐ長い線を省略します"><span class="sw" aria-hidden="true"></span>線をすべて表示</button>` : ''}
    </div>
    ${legendHtml(relTypes)}
    <div class="map" id="map">
      <div class="map-groups">${groupsHtml || '<p class="empty">表示できる企業がありません。</p>'}</div>
      <svg class="map-lines" aria-hidden="true"></svg>
      <div class="map-labels" aria-hidden="true"></div>
    </div>
    <p class="hint">タイルをタップすると詳細と、その会社のつながり（線）を表示します。大きさは規模の目安（面積比）です。</p>`;

  root.querySelector('#sizeSel')?.addEventListener('change', (e) => ctx.onSizeMetric(e.target.value));
  root.querySelector('#linesBtn')?.addEventListener('click', () => ctx.onToggleLines());
  root.querySelector('#map').addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (tile) ctx.onSelect(tile.dataset.id);
    else if (ctx.state.companyId) ctx.onSelect(null); // 余白をタップで選択解除
  });
}

function tileHtml(c, lvl, metric, value, group, rels) {
  const big = lvl === 'xl' || lvl === 'l' || lvl === 'm';
  const name = !big && c.short ? c.short : c.name;
  const val = typeof value === 'number' ? formatValue(value, metric, c.valueMeta[metric.key]) : '';
  const brands = c.brands.slice(0, 5).map((b) => b.name).join(' / ');
  const flag = c.region === 'overseas' ? `<span class="tile-flag">${esc(c.country || '海外')}</span>` : '';
  const label = [c.name, val && `${metric.label} ${val}`, c.region === 'overseas' && (c.country || '海外'), rels && `つながり${rels}件`].filter(Boolean).join('、');
  let extra = '';
  if (big) {
    if (brands) extra = `<span class="tile-brands">${esc(brands)}</span>`;
    else if (c.tagline) extra = `<span class="tile-tag">${esc(c.tagline)}</span>`;
  } else if (!val && c.tagline && lvl === 's') {
    extra = `<span class="tile-tag">${esc(c.tagline)}</span>`;
  }
  const link = rels
    ? `<span class="tile-link" aria-hidden="true"><svg viewBox="0 0 16 16" width="11" height="11"><path d="M6.5 9.5l3-3M5.2 7.3L4 8.5a2.5 2.5 0 003.5 3.5l1.2-1.2M10.8 8.7L12 7.5A2.5 2.5 0 008.5 4L7.3 5.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>${rels}</span>`
    : '';
  return `<button type="button" class="tile sz-${lvl}" data-id="${esc(c.id)}" style="--g:${group.color}" aria-label="${esc(label)}">
      <span class="tile-top"><span class="tile-name">${esc(name)}</span>${flag}</span>
      ${val ? `<span class="tile-val">${esc(val)}</span>` : ''}
      ${extra}
      ${link}
    </button>`;
}

/** 選択状態の反映（再描画せずクラスだけ切り替える） */
export function applyMapSelection(root, sector, selectedId, showLines) {
  const map = root.querySelector('#map');
  if (!map) return;
  const related = new Set();
  if (selectedId) {
    for (const r of sector.relations) {
      if (r.from === selectedId) related.add(r.to);
      if (r.to === selectedId) related.add(r.from);
    }
  }
  map.querySelectorAll('.tile').forEach((t) => {
    const id = t.dataset.id;
    t.classList.toggle('is-selected', id === selectedId);
    t.classList.toggle('is-related', related.has(id));
    t.classList.toggle('is-dim', !!selectedId && id !== selectedId && !related.has(id));
  });
  drawLines(map, sector, selectedId, showLines);
}

/** 線分 p-q が長方形 r（内側に inset だけ縮める）と交わるか（Liang–Barsky） */
function segmentHitsRect(p, q, r, inset = 0) {
  const x0 = r.x + inset, y0 = r.y + inset, x1 = r.x + r.w - inset, y1 = r.y + r.h - inset;
  if (x1 <= x0 || y1 <= y0) return false;
  const dx = q.x - p.x, dy = q.y - p.y;
  let t0 = 0, t1 = 1;
  const clip = (pp, qq) => {
    if (pp === 0) return qq >= 0;
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, p.x - x0) && clip(dx, x1 - p.x) && clip(-dy, p.y - y0) && clip(dy, y1 - p.y) && t0 <= t1;
}

/** 長方形の中心から相手方向へ伸ばした線と、長方形の辺との交点 */
function edgePoint(r, tx, ty, pad = 3) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (r.w / 2 + pad) / Math.abs(dx) : Infinity;
  const sy = dy ? (r.h / 2 + pad) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function drawLines(map, sector, selectedId, enabled) {
  const svg = map.querySelector('.map-lines');
  const labels = map.querySelector('.map-labels');
  if (!svg || !labels) return;
  const W = map.clientWidth;
  const H = map.scrollHeight;
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  labels.innerHTML = '';

  const base = map.getBoundingClientRect();
  const toLocal = (r) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
  const rects = new Map();
  const groupOf = new Map();
  const groupRects = [];
  map.querySelectorAll('.group').forEach((gEl, gi) => {
    groupRects.push(toLocal(gEl.getBoundingClientRect()));
    gEl.querySelectorAll('.tile').forEach((el) => {
      rects.set(el.dataset.id, toLocal(el.getBoundingClientRect()));
      groupOf.set(el.dataset.id, gi);
    });
  });
  // 2社のあいだに別のグループのカードを横切るか（横切る線は既定では省略して見やすくする）
  const crossesOtherGroup = (p, q, ga, gb) =>
    groupRects.some((r, gi) => gi !== ga && gi !== gb && segmentHitsRect(p, q, r, 6));

  let paths = '';
  const lbls = [];
  // 同じ2社の間に複数の関係がある場合は少しずつ曲げ方を変える
  const pairCount = new Map();

  for (const rel of sector.relations) {
    const a = rects.get(rel.from);
    const b = rects.get(rel.to);
    if (!a || !b || rel.from === rel.to) continue;
    const hi = !!selectedId && (rel.from === selectedId || rel.to === selectedId);
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    if (!hi) {
      if (selectedId) continue; // 選択中は、その会社の線だけを表示
      if (!enabled && crossesOtherGroup(ac, bc, groupOf.get(rel.from), groupOf.get(rel.to))) continue;
    }
    const st = selectedId ? 'hi' : 'base';

    const p0 = edgePoint(a, bc.x, bc.y);
    const p2 = edgePoint(b, ac.x, ac.y);
    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const dist = Math.hypot(dx, dy) || 1;
    const key = [rel.from, rel.to].sort().join('|');
    const n = pairCount.get(key) || 0;
    pairCount.set(key, n + 1);
    const bend = Math.min(46, dist * 0.18) * (n % 2 ? -1 : 1) * (1 + Math.floor(n / 2) * 0.6);
    const c = { x: (p0.x + p2.x) / 2 - (dy / dist) * bend, y: (p0.y + p2.y) / 2 + (dx / dist) * bend };
    const marker = rel.type === 'subsidiary' ? ` marker-end="url(#arr-${st === 'hi' ? 'hi' : 'base'})"` : '';
    paths += `<path class="ln ln-${rel.type} ln-${st}" d="M${p0.x.toFixed(1)},${p0.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}"${marker}/>`;

    if (hi) {
      const mx = 0.25 * p0.x + 0.5 * c.x + 0.25 * p2.x;
      const my = 0.25 * p0.y + 0.5 * c.y + 0.25 * p2.y;
      lbls.push({ x: mx, y: my, text: rel.label || RELATION_TYPES[rel.type].label, type: rel.type });
    }
  }

  svg.innerHTML = `
    <defs>
      <marker id="arr-base" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0.5 L10,5 L0,9.5 z" fill="#8090b5"/></marker>
      <marker id="arr-hi" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M0,0.5 L10,5 L0,9.5 z" fill="#3d4a6b"/></marker>
    </defs>${paths}`;

  labels.innerHTML = lbls
    .map((l) => `<span class="ln-label${l.type === 'alliance' ? ' is-alliance' : ''}" style="left:${l.x.toFixed(1)}px;top:${l.y.toFixed(1)}px">${esc(l.text)}</span>`)
    .join('');
}
