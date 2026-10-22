// 企業の詳細パネル（スマホ：下から出るシート / PC：右側パネル）
import { esc, formatValue, isDesktop } from './util.js';
import { RELATION_TYPES } from './data.js';

const sheet = document.getElementById('sheet');
let handlers = { onClose: () => {}, onSelect: () => {} };
let lastFocus = null;

export function initSheet(h) {
  handlers = h;
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return handlers.onClose();
    const go = e.target.closest('[data-goto]');
    if (go) handlers.onSelect(go.dataset.goto);
  });
  setupDrag();
}

function safeUrl(u) {
  return /^https?:\/\//i.test(u || '') ? u : '';
}

function relationRows(sector, c) {
  const rows = [];
  for (const r of sector.relations) {
    if (r.from !== c.id && r.to !== c.id) continue;
    const otherId = r.from === c.id ? r.to : r.from;
    const other = sector.companyMap.get(otherId);
    if (!other) continue;
    const t = RELATION_TYPES[r.type];
    // 自分が from（親・出資元）なら相手は「子会社・出資先」、自分が to なら相手は「親会社・出資元」
    const role = r.from === c.id ? t.child : t.parent;
    rows.push({ other, role, rel: r });
  }
  return rows;
}

export function renderSheet(sector, c) {
  const g = sector.groupMap.get(c.group);
  const metrics = sector.metrics.filter((m) => typeof c.values[m.key] === 'number');
  const rels = relationRows(sector, c);
  const url = safeUrl(c.url);
  const sub = [c.code && `${c.region === 'overseas' ? 'ティッカー' : '証券コード'} ${c.code}`, c.fy && `${c.fy}`].filter(Boolean).join(' ・ ');

  sheet.innerHTML = `
    <div class="sheet-grab">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-headrow">
        <div>
          <div class="sheet-kicker">
            <span class="grp" style="--g:${g.color}">${esc(g.name)}</span>
            <span class="tag-ov">${c.region === 'overseas' ? esc(c.country || '海外') : esc(c.country || '日本')}</span>
          </div>
          <h2 id="sheetTitle">${esc(c.name)}</h2>
          ${sub ? `<div class="sheet-sub">${esc(sub)}</div>` : ''}
        </div>
        <button type="button" class="icon-btn" data-close aria-label="閉じる">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <div class="sheet-body">
      ${c.tagline || c.description ? `<p class="desc">${esc(c.description || c.tagline)}</p>` : ''}
      ${metrics.length ? `<section><h3>数字</h3><div class="metrics">${metrics
        .map((m) => {
          const meta = c.valueMeta[m.key] || {};
          const v = c.values[m.key];
          const note = [meta.period, meta.note].filter(Boolean).join('・');
          return `<div class="metric"><div class="k">${esc(m.label)}</div><div class="v${v < 0 ? ' is-neg' : ''}">${esc(formatValue(v, m, meta))}</div>${note ? `<div class="n">${esc(note)}</div>` : ''}</div>`;
        })
        .join('')}</div></section>` : ''}
      ${c.brands.length ? `<section><h3>主なブランド・業態</h3><div class="chips">${c.brands
        .map((b) => `<span class="chip"${b.note ? ` title="${esc(b.note)}"` : ''}>${esc(b.name)}${b.note ? `<span class="muted">（${esc(b.note)}）</span>` : ''}</span>`)
        .join('')}</div></section>` : ''}
      ${c.points.length ? `<section><h3>ポイント</h3><ul class="points">${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>` : ''}
      ${rels.length ? `<section><h3>つながり</h3><ul class="rels">${rels
        .map(({ other, role, rel }) => `
          <li><button type="button" class="rel-btn" data-goto="${esc(other.id)}">
            <span class="rel-type${rel.type === 'alliance' ? ' is-alliance' : ''}">${esc(role)}</span>
            <span class="rel-main">
              <span class="rel-name">${esc(other.name)}${other.region === 'overseas' ? ` <span class="tag-ov">${esc(other.country || '海外')}</span>` : ''}</span>
              ${rel.label || rel.note ? `<span class="rel-label">${esc([rel.label, rel.note].filter(Boolean).join(' / '))}</span>` : ''}
            </span>
            <svg class="rel-go" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button></li>`)
        .join('')}</ul></section>` : ''}
      ${c.facts.length ? `<section><h3>メモ</h3><table class="facts"><tbody>${c.facts
        .map((f) => `<tr><th>${esc(f.label)}</th><td>${esc(f.value ?? '')}</td></tr>`)
        .join('')}</tbody></table></section>` : ''}
      ${url ? `<p><a class="ext" href="${esc(url)}" target="_blank" rel="noopener">公式サイト <span aria-hidden="true">↗</span></a></p>` : ''}
    </div>`;
  sheet.querySelector('.sheet-body').scrollTop = 0;
}

export function openSheet() {
  if (!sheet.classList.contains('is-open')) lastFocus = document.activeElement;
  sheet.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  // フォーカスを移す（スクロール位置は動かさない）
  sheet.querySelector('[data-close]')?.focus({ preventScroll: true });
}

export function closeSheet() {
  if (!sheet.classList.contains('is-open')) return;
  sheet.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  lastFocus = null;
}

/** スマホ：つまみを下にスワイプで閉じる */
function setupDrag() {
  let startY = 0;
  let dy = 0;
  let dragging = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (isDesktop() || !e.target.closest('.sheet-grab') || e.target.closest('button')) return;
    dragging = true;
    startY = e.clientY;
    dy = 0;
    sheet.classList.add('is-dragging');
    sheet.setPointerCapture(e.pointerId);
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    sheet.style.transform = '';
    if (dy > 90) handlers.onClose();
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}
