// つながり表示：会社を円の上に並べ、提携・特許・訴訟・出資などを線で結ぶ
import { esc } from '../util.js';
import { NET_TYPES } from '../data.js';

const R = 116; // 会社を並べる円の半径（viewBox の単位）
const HALF = 200; // viewBox の半分の大きさ
const LABEL_GAP = 10;
const LIST_LIMIT = 10; // 一覧ははじめ10本だけ出す

/** 業界ごとの表示状態（選択中の会社・線・見どころ、絞り込み） */
export function getNetState(state, sectorId) {
  if (!state.net[sectorId]) state.net[sectorId] = { focus: null, rivalsOnly: false, types: new Set(Object.keys(NET_TYPES)) };
  return state.net[sectorId];
}

/** 2023-12 → 2023年12月 */
function formatDate(d) {
  const m = /^(\d{4})(?:[-./](\d{1,2}))?/.exec(d || '');
  if (!m) return esc(d || '');
  return m[2] ? `${m[1]}年${Number(m[2])}月` : `${m[1]}年`;
}

function safeUrl(u) {
  return /^https?:\/\//i.test(u || '') ? u : '';
}

/* ---------------- 図の形 ---------------- */

function layout(net) {
  // ゾーンの切れ目に1つずつすき間を入れて、円周に等間隔で並べる
  const slots = [];
  net.zones.forEach((z) => {
    z.ids.forEach((id) => slots.push(id));
    slots.push(null);
  });
  const n = slots.length;
  const pos = new Map();
  slots.forEach((id, i) => {
    if (!id) return;
    const ang = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
    pos.set(id, { x: R * Math.cos(ang), y: R * Math.sin(ang), ang });
  });
  return { pos, step: (Math.PI * 2) / n };
}

function curve(p, q, offset) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const chord = Math.hypot(dx, dy) || 1;
  // 近い会社どうしは浅く、向かい合う会社どうしは中心近くを通る弧にする
  const k = 0.8 * (1 - Math.min(1, chord / (2 * R)));
  let cx = ((p.x + q.x) / 2) * k;
  let cy = ((p.y + q.y) / 2) * k;
  if (offset) {
    cx += (-dy / chord) * offset;
    cy += (dx / chord) * offset;
  }
  const f = (v) => v.toFixed(1);
  return `M${f(p.x)},${f(p.y)} Q${f(cx)},${f(cy)} ${f(q.x)},${f(q.y)}`;
}

function arc(r, a0, a1) {
  const p = (a) => `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
  return `M${p(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

function svgHtml(net) {
  const { pos, step } = layout(net);

  const zones = net.zones
    .map((z) => {
      const a0 = pos.get(z.ids[0]).ang - step * 0.4;
      const a1 = pos.get(z.ids[z.ids.length - 1]).ang + step * 0.4;
      return `<path class="nz" d="${arc(R - 11, a0, a1)}" style="--z:${z.color}"/>`;
    })
    .join('');

  // 同じ2社のあいだに線が何本もあるときは、少しずらして並べる
  const pairCount = new Map();
  const pairIndex = new Map();
  const pairKey = (l) => [l.a, l.b].sort().join('|');
  for (const l of net.links) pairCount.set(pairKey(l), (pairCount.get(pairKey(l)) || 0) + 1);
  const links = net.links
    .map((l) => {
      const key = pairKey(l);
      const idx = pairIndex.get(key) || 0;
      pairIndex.set(key, idx + 1);
      const offset = (idx - (pairCount.get(key) - 1) / 2) * 14;
      const [p, q] = l.a < l.b ? [pos.get(l.a), pos.get(l.b)] : [pos.get(l.b), pos.get(l.a)];
      const d = curve(p, q, offset);
      return `<g class="nl t-${l.type}${l.rivals ? ' is-rival' : ''}" data-link="${esc(l.id)}">${l.rivals ? `<path class="nl-halo" d="${d}"/>` : ''}<path class="nl-path" d="${d}"/><path class="nl-hit" d="${d}"/></g>`;
    })
    .join('');

  const nodes = [...net.nodeMap.values()]
    .map((n) => {
      const p = pos.get(n.id);
      if (!p) return '';
      const r = 3.6 + Math.min(n.links.length, 8) * 0.45;
      const flip = Math.cos(p.ang) < -1e-6;
      const deg = (p.ang * 180) / Math.PI + (flip ? 180 : 0);
      const lx = (R + LABEL_GAP) * Math.cos(p.ang);
      const ly = (R + LABEL_GAP) * Math.sin(p.ang);
      const label = `${n.display}のつながり ${n.links.length}本`;
      return `<g class="nn${n.company ? '' : ' is-extra'}" data-node="${esc(n.id)}" role="button" tabindex="0" aria-label="${esc(label)}">
        <circle class="nn-hit" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="11"/>
        <circle class="nn-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" style="--z:${n.zone.color}"/>
        <text class="nn-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" dy=".35em" text-anchor="${flip ? 'end' : 'start'}" transform="rotate(${deg.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})">${esc(n.label)}</text>
      </g>`;
    })
    .join('');

  return `<svg class="net-svg" viewBox="${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}" role="group" aria-label="会社どうしのつながりの図">
    <g class="net-zones">${zones}</g>
    <g class="net-links">${links}</g>
    <g class="net-nodes">${nodes}</g>
  </svg>`;
}

/* ---------------- カード ---------------- */

function linkCard(net, l) {
  const a = net.nodeMap.get(l.a);
  const b = net.nodeMap.get(l.b);
  const co = (n) => `<button type="button" class="nc-co" data-node="${esc(n.id)}">${esc(n.display)}</button>`;
  const sources = l.sources
    .map((s) => {
      const url = safeUrl(s.url);
      return url
        ? `<a class="nc-src" href="${esc(url)}" target="_blank" rel="noopener">出典：${esc(s.title)}<span aria-hidden="true"> ↗</span></a>`
        : `<span class="nc-src">出典：${esc(s.title)}</span>`;
    })
    .join('');
  return `<li class="nc t-${l.type}${l.rivals ? ' is-rival' : ''}" data-card="${esc(l.id)}">
    <div class="nc-top">
      ${l.date ? `<time class="nc-date">${formatDate(l.date)}</time>` : ''}
      <span class="nc-type t-${l.type}"><i aria-hidden="true"></i>${esc(NET_TYPES[l.type].label)}</span>
      ${l.rivals ? `<span class="nc-rival">表は競合${l.rivalNote ? `：${esc(l.rivalNote)}` : ''}</span>` : ''}
    </div>
    <div class="nc-pair">${co(a)}<span class="nc-x" aria-hidden="true">×</span>${co(b)}</div>
    ${l.title ? `<h3 class="nc-title">${esc(l.title)}</h3>` : ''}
    ${l.text ? `<p class="nc-text">${esc(l.text)}</p>` : ''}
    ${l.status || sources ? `<div class="nc-foot">${l.status ? `<span class="nc-status">${esc(l.status)}</span>` : ''}${sources}</div>` : ''}
  </li>`;
}

const byDateDesc = (x, y) => (y.date || '').localeCompare(x.date || '');

/** いま光らせる線（focus がなければ null） */
function focusLinkIds(net, focus) {
  if (!focus) return null;
  if (focus.kind === 'node') return new Set((net.nodeMap.get(focus.id)?.links || []).map((l) => l.id));
  if (focus.kind === 'link') return new Set(net.linkMap.has(focus.id) ? [focus.id] : []);
  if (focus.kind === 'story') return new Set(net.stories.find((s) => s.id === focus.id)?.links || []);
  return null;
}

function validFocus(net, focus) {
  if (!focus) return null;
  if (focus.kind === 'node' && net.nodeMap.has(focus.id)) return focus;
  if (focus.kind === 'link' && net.linkMap.has(focus.id)) return focus;
  if (focus.kind === 'story' && net.stories.some((s) => s.id === focus.id)) return focus;
  return null;
}

function focusPanel(net, st, visible) {
  const f = st.focus;
  if (!f) return '';
  const ids = focusLinkIds(net, f);
  const all = net.links.filter((l) => ids.has(l.id));
  const shown = all.filter(visible).sort(byDateDesc);
  const hidden = all.length - shown.length;
  let kicker = '';
  let title = '';
  let body = '';
  let actions = '';
  if (f.kind === 'node') {
    const n = net.nodeMap.get(f.id);
    const rivals = all.filter((l) => l.rivals).length;
    kicker = `<span class="zdot" style="--z:${n.zone.color}"></span>${esc(n.zone.label)}${n.country ? ` ・ ${esc(n.country)}` : ''}`;
    title = esc(n.display);
    body = `${n.description ? `<p class="nf-desc">${esc(n.description)}</p>` : ''}<p class="nf-count">つながり <b>${all.length}</b>本${rivals ? `（うち競合どうし <b>${rivals}</b>本）` : ''}</p>`;
    actions = n.company
      ? `<button type="button" class="nf-open" data-open="${esc(n.id)}">会社の詳細を見る</button>`
      : `<span class="nf-extra">この会社は業界地図（マップ）には載せていません</span>`;
  } else if (f.kind === 'story') {
    const s = net.stories.find((x) => x.id === f.id);
    kicker = '見どころ';
    title = esc(s.title);
    body = `<p class="nf-desc">${esc(s.text)}</p>`;
  } else {
    const l = net.linkMap.get(f.id);
    kicker = 'つながり';
    title = `${esc(net.nodeMap.get(l.a).display)} × ${esc(net.nodeMap.get(l.b).display)}`;
  }
  return `<section class="card net-focus" aria-live="polite">
    <div class="nf-head">
      <div class="nf-titles"><div class="nf-kicker">${kicker}</div><h2>${title}</h2></div>
      <button type="button" class="icon-btn" data-clear aria-label="選択を解除">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    ${body}
    ${actions ? `<div class="nf-actions">${actions}</div>` : ''}
    ${shown.length ? `<ul class="nc-list">${shown.map((l) => linkCard(net, l)).join('')}</ul>` : ''}
    ${hidden ? `<p class="nf-hidden">絞り込みで ${hidden}本を隠しています。<button type="button" class="link-btn" data-reset>すべて表示</button></p>` : ''}
  </section>`;
}

function storiesHtml(net) {
  if (!net.stories.length) return '';
  return `<section class="card net-stories">
    <h2>見どころ</h2>
    <div class="ns-grid">${net.stories
      .map((s) => {
        const names = [];
        for (const id of s.links) {
          const l = net.linkMap.get(id);
          for (const nid of [l.a, l.b]) {
            const name = net.nodeMap.get(nid).label;
            if (!names.includes(name)) names.push(name);
          }
        }
        return `<article class="ns-card" data-story-card="${esc(s.id)}">
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.text)}</p>
          <div class="ns-who">${names.slice(0, 6).map((x) => `<span>${esc(x)}</span>`).join('')}${names.length > 6 ? `<span>ほか${names.length - 6}社</span>` : ''}</div>
          <button type="button" class="ns-btn" data-story="${esc(s.id)}">図で見る（${s.links.length}本）</button>
        </article>`;
      })
      .join('')}</div>
  </section>`;
}

/* ---------------- 描画 ---------------- */

export function renderNetwork(root, ctx) {
  const net = ctx.sector.network;
  const st = getNetState(ctx.state, ctx.sector.id);
  st.focus = validFocus(net, st.focus);
  const rivalCount = net.links.filter((l) => l.rivals).length;
  const typeCount = (t) => net.links.filter((l) => l.type === t).length;
  const types = Object.keys(NET_TYPES).filter((t) => typeCount(t));

  root.innerHTML = `<div class="net">
    <section class="card net-intro">
      <h2>${esc(net.title)}</h2>
      ${net.lead ? `<p>${esc(net.lead)}</p>` : ''}
      <p class="net-stats"><b>${net.links.length}</b>本のつながり<span aria-hidden="true">・</span>うち<b class="is-rival">${rivalCount}</b>本は表向きは競合どうし<span aria-hidden="true">・</span><b>${net.nodeMap.size}</b>社（海外を含む）</p>
    </section>
    <div class="net-tools" role="group" aria-label="絞り込み">
      <button type="button" class="chip-toggle net-rivals" data-rivals aria-pressed="false">表は競合どうしだけ<span class="sw" aria-hidden="true"></span></button>
      ${types
        .map((t) => `<button type="button" class="tchip t-${t}" data-type="${t}" aria-pressed="true"><i aria-hidden="true"></i>${esc(NET_TYPES[t].label)}<span>${typeCount(t)}</span></button>`)
        .join('')}
    </div>
    <div class="net-cols">
      <div class="net-left">
        <section class="card net-graph">
          ${svgHtml(net)}
          <div class="net-legend">
            ${net.zones.map((z) => `<span><i class="zdot" style="--z:${z.color}"></i>${esc(z.label)}</span>`).join('')}
            <span><i class="lg-rival" aria-hidden="true"></i>ピンクの光＝表向きは競合どうし</span>
            <span><i class="lg-extra" aria-hidden="true"></i>点線の丸＝マップに未掲載の会社</span>
          </div>
          <p class="hint">会社名か線をタップすると、そのつながりだけが光ります。</p>
        </section>
      </div>
      <div class="net-right">
        <div class="net-focus-slot"></div>
        ${storiesHtml(net)}
        <section class="card net-all">
          <h2>つながり一覧<span class="muted small net-all-count"></span></h2>
          <ul class="nc-list net-all-list"></ul>
          ${net.note ? `<p class="net-note">${esc(net.note)}</p>` : ''}
        </section>
      </div>
    </div>
  </div>`;

  const svg = root.querySelector('.net-svg');
  const graph = root.querySelector('.net-graph');

  const scrollToGraph = () => {
    const top = document.querySelector('.tabs').getBoundingClientRect().bottom + 8;
    const r = graph.getBoundingClientRect();
    if (r.top < top - 1 || r.top > window.innerHeight * 0.5) window.scrollTo({ top: window.scrollY + r.top - top, behavior: 'smooth' });
  };

  const twoCols = () => getComputedStyle(root.querySelector('.net-cols')).gridTemplateColumns.split(' ').length > 1;

  const setFocus = (focus, { scroll = false } = {}) => {
    const cur = st.focus;
    st.focus = focus && cur && cur.kind === focus.kind && cur.id === focus.id ? null : focus; // 同じものをもう一度押すと解除
    update();
    if (!st.focus) return;
    if (twoCols()) {
      // PC：図は左に止まっているので、右の説明が見える位置まで戻す
      const panel = root.querySelector('.net-focus');
      const top = document.querySelector('.tabs').getBoundingClientRect().bottom + 8;
      const r = panel.getBoundingClientRect();
      if (r.top < top - 1 || r.top > window.innerHeight - 120) window.scrollTo({ top: window.scrollY + r.top - top, behavior: 'smooth' });
    } else if (scroll) {
      scrollToGraph();
    }
  };

  function update() {
    const visible = (l) => st.types.has(l.type) && (!st.rivalsOnly || l.rivals);
    const ids = focusLinkIds(net, st.focus);
    const hiNodes = new Set();
    if (ids) for (const id of ids) { const l = net.linkMap.get(id); if (visible(l)) { hiNodes.add(l.a); hiNodes.add(l.b); } }
    if (st.focus?.kind === 'node') hiNodes.add(st.focus.id);

    svg.classList.toggle('has-focus', !!ids);
    svg.querySelectorAll('.nl').forEach((g) => {
      const l = net.linkMap.get(g.dataset.link);
      const show = visible(l);
      g.classList.toggle('is-hidden', !show);
      g.classList.toggle('is-hi', show && !!ids && ids.has(l.id));
    });
    svg.querySelectorAll('.nn').forEach((g) => {
      const n = net.nodeMap.get(g.dataset.node);
      g.classList.toggle('is-idle', !n.links.some(visible));
      g.classList.toggle('is-hi', hiNodes.has(n.id));
      g.classList.toggle('is-focus', st.focus?.kind === 'node' && st.focus.id === n.id);
      g.setAttribute('aria-pressed', String(st.focus?.kind === 'node' && st.focus.id === n.id));
    });
    // 光っている線を手前に出す
    const layer = svg.querySelector('.net-links');
    svg.querySelectorAll('.nl.is-hi').forEach((g) => layer.appendChild(g));

    root.querySelector('[data-rivals]').setAttribute('aria-pressed', String(st.rivalsOnly));
    root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(st.types.has(b.dataset.type))));
    root.querySelectorAll('[data-story]').forEach((b) => b.closest('.ns-card').classList.toggle('is-on', st.focus?.kind === 'story' && st.focus.id === b.dataset.story));

    root.querySelector('.net-focus-slot').innerHTML = focusPanel(net, st, visible);
    const list = net.links.filter(visible).sort(byDateDesc);
    const shown = st.showAll ? list : list.slice(0, LIST_LIMIT);
    root.querySelector('.net-all-count').textContent = `（${list.length}本${list.length < net.links.length ? ` / 全${net.links.length}本` : ''}・新しい順）`;
    root.querySelector('.net-all-list').innerHTML = list.length
      ? shown.map((l) => linkCard(net, l)).join('') +
        (shown.length < list.length ? `<li class="nc-more"><button type="button" class="ns-btn" data-showall>残り${list.length - shown.length}本を表示</button></li>` : '')
      : '<li class="empty">条件に合うつながりがありません。</li>';
  }

  root.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('a')) return;
    const node = t.closest('[data-node]');
    if (node) {
      const inGraph = !!node.closest('.net-svg');
      return setFocus({ kind: 'node', id: node.dataset.node }, { scroll: !inGraph });
    }
    const link = t.closest('.nl');
    if (link) return setFocus({ kind: 'link', id: link.dataset.link });
    const story = t.closest('[data-story]');
    if (story) return setFocus({ kind: 'story', id: story.dataset.story }, { scroll: true });
    const open = t.closest('[data-open]');
    if (open) return ctx.onSelect(open.dataset.open);
    if (t.closest('[data-clear]')) return setFocus(null);
    if (t.closest('[data-showall]')) {
      st.showAll = true;
      return update();
    }
    if (t.closest('[data-reset]')) {
      st.rivalsOnly = false;
      st.types = new Set(Object.keys(NET_TYPES));
      return update();
    }
    if (t.closest('[data-rivals]')) {
      st.rivalsOnly = !st.rivalsOnly;
      return update();
    }
    const type = t.closest('[data-type]');
    if (type) {
      const k = type.dataset.type;
      // 全部オンのときに押したら「その種類だけ」、それ以外はオン・オフの切り替え
      if (types.every((x) => st.types.has(x))) st.types = new Set([k]);
      else if (st.types.has(k)) st.types.delete(k);
      else st.types.add(k);
      if (!types.some((x) => st.types.has(x))) st.types = new Set(Object.keys(NET_TYPES));
      return update();
    }
    // 図の何もないところを押したら選択を解除
    if (t.closest('.net-svg') && st.focus) setFocus(null);
  });

  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const node = e.target.closest('[data-node]');
    if (!node) return;
    e.preventDefault();
    setFocus({ kind: 'node', id: node.dataset.node });
  });

  update();
}

/** 指定した会社を選んだ状態にする（会社の詳細シートの「つながりマップで見る」から） */
export function focusNetworkNode(state, sectorId, nodeId) {
  getNetState(state, sectorId).focus = { kind: 'node', id: nodeId };
}
