// 左のメニュー：業界一覧と横断検索
import { esc, normalizeText, debounce } from './util.js';
import { loadAllSectors, loadSector } from './data.js';

const drawer = document.getElementById('drawer');
const backdrop = document.getElementById('drawerBackdrop');
const body = document.getElementById('drawerBody');
const input = document.getElementById('searchInput');
const menuBtn = document.getElementById('menuBtn');

let ctx = null; // { getState, onSector, onCompany }

export function initDrawer(c) {
  ctx = c;
  menuBtn.addEventListener('click', openDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  input.addEventListener('input', debounce(renderBody, 120));
  input.addEventListener('focus', () => loadAllSectors(ctx.getState().index), { once: true });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sector]');
    if (!b) return;
    closeDrawer();
    if (b.dataset.company) ctx.onCompany(b.dataset.sector, b.dataset.company);
    else ctx.onSector(b.dataset.sector);
  });
}

export function openDrawer() {
  renderBody();
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('is-on'));
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  menuBtn.setAttribute('aria-expanded', 'true');
  setTimeout(() => input.focus({ preventScroll: true }), 50);
}

export function closeDrawer() {
  if (!drawer.classList.contains('is-open')) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  menuBtn.setAttribute('aria-expanded', 'false');
  backdrop.classList.remove('is-on');
  setTimeout(() => { if (!drawer.classList.contains('is-open')) backdrop.hidden = true; }, 230);
  menuBtn.focus({ preventScroll: true });
}

export const isDrawerOpen = () => drawer.classList.contains('is-open');

function sectorItem(s, current) {
  return `<button type="button" class="dr-item" data-sector="${esc(s.id)}"${s.id === current ? ' aria-current="true"' : ''}>
    <span class="dr-ico">${esc(s.icon)}</span>
    <span class="dr-text"><span class="dr-name">${esc(s.name)}</span>${s.description ? `<span class="dr-sub">${esc(s.description)}</span>` : ''}</span>
  </button>`;
}

async function renderBody() {
  const { index, sectorId } = ctx.getState();
  const q = normalizeText(input.value);

  if (!q) {
    const cats = new Map();
    for (const s of index.sectors) {
      if (!cats.has(s.category)) cats.set(s.category, []);
      cats.get(s.category).push(s);
    }
    body.innerHTML = [...cats]
      .map(([cat, list]) => `<div class="dr-cat">${esc(cat)}</div>${list.map((s) => sectorItem(s, sectorId)).join('')}`)
      .join('');
    return;
  }

  const sectorHits = index.sectors.filter((s) => normalizeText(`${s.name}${s.kana}${s.category}${s.description}`).includes(q));
  const companyHits = [];
  await loadAllSectors(index);
  if (normalizeText(input.value) !== q) return; // 入力が変わっていたら破棄
  for (const meta of index.sectors) {
    let sector;
    try { sector = await loadSector(meta); } catch { continue; }
    for (const c of sector.companies) {
      const brandHit = c.brands.find((b) => normalizeText(b.name).includes(q));
      if (normalizeText(`${c.name}${c.short}${c.kana}${c.tags.join('')}`).includes(q) || brandHit) {
        companyHits.push({ meta, c, brand: brandHit && !normalizeText(c.name).includes(q) ? brandHit.name : '' });
      }
    }
  }

  let html = '';
  if (sectorHits.length) html += `<div class="dr-cat">業界</div>${sectorHits.map((s) => sectorItem(s, sectorId)).join('')}`;
  if (companyHits.length) {
    html += `<div class="dr-cat">企業・ブランド</div>${companyHits
      .slice(0, 60)
      .map(({ meta, c, brand }) => `<button type="button" class="dr-item" data-sector="${esc(meta.id)}" data-company="${esc(c.id)}">
          <span class="dr-ico">${esc(meta.icon)}</span>
          <span class="dr-text"><span class="dr-name">${esc(c.name)}</span><span class="dr-sub">${esc(meta.name)}${brand ? ` ・ ${esc(brand)}` : ''}${c.region === 'overseas' ? ' ・ 海外' : ''}</span></span>
        </button>`)
      .join('')}`;
  }
  body.innerHTML = html || `<p class="dr-empty">「${esc(input.value)}」に一致する業界・企業はありません。</p>`;
}
