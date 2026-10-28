// 業界地図 — エントリーポイント
// URL: #/<業界id>/<map|rank|info>/<企業id>
import { $, esc, store } from './util.js';
import { loadIndex, loadSector, visibleCompanies, DataError } from './data.js';
import { renderMap, applyMapSelection, drawLines } from './views/map.js';
import { renderRanking } from './views/ranking.js';
import { renderOverview } from './views/overview.js';
import { renderNetwork, focusNetworkNode } from './views/network.js';
import { initSheet, renderSheet, openSheet, closeSheet } from './sheet.js';
import { initDrawer, closeDrawer, isDrawerOpen } from './drawer.js';

// when：その業界にデータがあるときだけ出すタブ
const VIEWS = [
  { id: 'map', label: 'マップ' },
  { id: 'rank', label: 'ランキング' },
  { id: 'info', label: '概要' },
  { id: 'net', label: 'つながり', when: (s) => !!s.network },
];
const viewAvailable = (id, sector) => VIEWS.some((v) => v.id === id && (!v.when || (sector && v.when(sector))));

const state = {
  index: null,
  sector: null,
  sectorId: null,
  view: 'map',
  companyId: null,
  region: store.get('region', 'jp') === 'world' ? 'world' : 'jp',
  showLines: store.get('allLines', false) === true, // 「線をすべて表示」
  sizeMetric: {},
  rankMetric: {},
  rankGroup: {},
  tagFilter: {},
  net: {}, // つながりタブの選択・絞り込み（業界ごと）
};

let sheetPushed = false; // 詳細を開いたときに履歴を積んだか（戻るボタンで閉じるため）
let routeSeq = 0;
let pendingSectorId = null;

const els = {
  tabs: $('#sectorTabs'),
  hero: $('#hero'),
  viewSwitch: $('#viewSwitch'),
  view: $('#view'),
};

/* ---------------- routing ---------------- */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [sectorId = '', view = '', companyId = ''] = raw.split('/').map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  return {
    sectorId: sectorId || null,
    view: VIEWS.some((v) => v.id === view) ? view : 'map',
    companyId: companyId || null,
  };
}

function buildHash({ sectorId, view, companyId }) {
  let h = `#/${encodeURIComponent(sectorId)}/${view}`;
  if (companyId) h += `/${encodeURIComponent(companyId)}`;
  return h;
}

function navigate(patch, { replace = false } = {}) {
  const next = { sectorId: state.sectorId, view: state.view, companyId: state.companyId, ...patch };
  const url = buildHash(next);
  if (url !== location.hash) {
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }
  applyRoute();
}

async function applyRoute() {
  const seq = ++routeSeq;
  const r = parseHash();
  const metas = state.index.sectors;
  if (!metas.length) return renderFatal(new DataError('data/index.json に業界がひとつも登録されていません。', 'empty'));

  if (!r.sectorId || !metas.some((s) => s.id === r.sectorId)) {
    r.sectorId = metas[0].id;
    r.companyId = null;
    history.replaceState(null, '', buildHash(r));
  }

  // popstate と hashchange が続けて来ることがあるので、読み込み中でも最新の呼び出しが描画を引き継ぐ
  const sectorChanged = r.sectorId !== state.sectorId || !state.sector;

  if (sectorChanged) {
    if (pendingSectorId !== r.sectorId) {
      pendingSectorId = r.sectorId;
      state.sector = null; // 読み込み中は古い業界を描画しない
      renderTabs(r.sectorId);
      els.hero.innerHTML = '';
      els.viewSwitch.innerHTML = '';
      els.view.innerHTML = '<p class="loading">読み込み中…</p>';
      closeSheet();
    }
    let sector;
    try {
      sector = await loadSector(metas.find((s) => s.id === r.sectorId));
    } catch (e) {
      if (seq === routeSeq) {
        pendingSectorId = null;
        state.sectorId = r.sectorId;
        state.sector = null;
        renderSectorError(e);
      }
      return;
    }
    if (seq !== routeSeq) return; // もっと新しい呼び出しが処理する
    pendingSectorId = null;
    state.sectorId = r.sectorId;
    state.sector = sector;
    if (sector.warnings.length) console.warn(`[${sector.id}] データのチェック:`, sector.warnings);
  }

  // 「つながり」のように、データがない業界では出さないタブはマップに戻す
  if (!viewAvailable(r.view, state.sector)) {
    r.view = 'map';
    history.replaceState(null, '', buildHash(r));
  }
  const viewChanged = r.view !== state.view;
  state.view = r.view;

  let cid = r.companyId && state.sector.companyMap.has(r.companyId) ? r.companyId : null;
  // 海外企業が選ばれたのに「日本」表示なら、自動で「世界」に切り替える
  let regionChanged = false;
  if (cid && state.region === 'jp' && state.sector.companyMap.get(cid).region === 'overseas') {
    state.region = 'world';
    store.set('region', 'world');
    regionChanged = true;
  }
  if (!cid) sheetPushed = false;
  state.companyId = cid;

  if (sectorChanged || viewChanged || regionChanged) renderAll(sectorChanged);
  else syncSelection();
}

/* ---------------- render ---------------- */

function renderAll(scrollTop = false) {
  renderRegion();
  renderTabs();
  renderHero();
  renderViewSwitch();
  renderView();
  syncSelection();
  if (scrollTop) window.scrollTo({ top: 0 });
}

function renderRegion() {
  document.querySelectorAll('.region [data-region]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.region === state.region)));
}

function renderTabs(activeId = state.sectorId) {
  const html = state.index.sectors
    .map((s) => `<button type="button" class="tab" role="tab" data-sector="${esc(s.id)}" aria-selected="${s.id === activeId}"><span class="ico" aria-hidden="true">${esc(s.icon)}</span>${esc(s.name)}</button>`)
    .join('');
  els.tabs.innerHTML = `${html}<button type="button" class="tab tab-more" data-more aria-label="すべての業界・検索">＋ すべて・検索</button>`;
  els.tabs.setAttribute('role', 'tablist');
  const active = els.tabs.querySelector('[aria-selected="true"]');
  if (active) {
    const left = active.offsetLeft - (els.tabs.clientWidth - active.offsetWidth) / 2;
    els.tabs.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }
}

function renderHero() {
  const s = state.sector;
  const visible = visibleCompanies(s, state.region);
  const stats = [];
  if (s.market.jp) stats.push(statHtml(s.market.jp, false));
  if (s.market.global && state.region === 'world') stats.push(statHtml(s.market.global, true));
  stats.push(`<div class="stat"><span class="stat-k">掲載</span><span class="stat-v">${visible.length}社</span><span class="stat-s">${state.region === 'world' ? '日本＋海外' : '日本のみ'}</span></div>`);

  els.hero.innerHTML = `
    <div class="hero-top">
      <div class="hero-ico" aria-hidden="true">${esc(s.icon)}</div>
      <div>
        <div class="hero-cat">${esc(s.category)}</div>
        <h1>${esc(s.name)}</h1>
      </div>
    </div>
    ${s.summary ? `<p class="hero-summary">${esc(s.summary.split(/\n+/)[0])}</p>` : ''}
    <div class="stats">${stats.join('')}</div>
    ${s.focusWorld && state.region === 'jp' ? worldCallout(s) : ''}`;
}

/** 海外が中心の業界を「日本」表示で開いたときの案内 */
function worldCallout(s) {
  const ov = s.companies.filter((c) => c.region === 'overseas').length;
  return `<div class="hero-world">
    <p>この業界は<b>海外の会社が中心</b>です（海外${ov}社）。いまは日本の会社だけを表示しています。</p>
    <button type="button" class="hero-world-btn" data-set-region="world">世界で見る</button>
  </div>`;
}

function statHtml(m, world) {
  return `<div class="stat${world ? ' is-world' : ''}"><span class="stat-k">${esc(m.label)}</span><span class="stat-v">${esc(m.value)}</span>${m.period ? `<span class="stat-s">${esc(m.period)}</span>` : ''}</div>`;
}

function renderViewSwitch() {
  els.viewSwitch.innerHTML = VIEWS.filter((v) => viewAvailable(v.id, state.sector)).map(
    (v) => `<button type="button" class="seg-btn" role="tab" data-view="${v.id}" aria-selected="${v.id === state.view}">${v.label}</button>`,
  ).join('');
}

function viewContext() {
  return {
    sector: state.sector,
    state,
    visible: visibleCompanies(state.sector, state.region),
    onSelect: selectCompany,
    onSizeMetric: (key) => {
      state.sizeMetric[state.sector.id] = key;
      renderView();
      syncSelection();
    },
    onRankMetric: (key) => {
      state.rankMetric[state.sector.id] = key;
      renderView();
    },
    onRankGroup: (groupId) => {
      state.rankGroup[state.sector.id] = groupId;
      renderView();
    },
    onShowTag: (tag) => {
      state.tagFilter[state.sector.id] = tag;
      navigate({ view: 'map', companyId: null }, { replace: true });
      window.scrollTo({ top: 0 });
    },
    onTagFilter: (tag) => {
      state.tagFilter[state.sector.id] = tag;
      renderView();
      syncSelection();
    },
    onToggleLines: () => {
      state.showLines = !state.showLines;
      store.set('allLines', state.showLines);
      renderView();
      syncSelection();
    },
  };
}

function renderView() {
  const ctx = viewContext();
  if (state.view === 'map') renderMap(els.view, ctx);
  else if (state.view === 'rank') renderRanking(els.view, ctx);
  else if (state.view === 'net') renderNetwork(els.view, ctx);
  else renderOverview(els.view, ctx);
}

function syncSelection() {
  const s = state.sector;
  if (!s) return;
  const c = state.companyId ? s.companyMap.get(state.companyId) : null;
  if (c) {
    renderSheet(s, c);
    openSheet();
  } else {
    closeSheet();
  }
  if (state.view === 'map') {
    // シートの開閉で横幅が変わるので、レイアウト確定後に線を引き直す
    requestAnimationFrame(() => {
      applyMapSelection(els.view, s, state.companyId, state.showLines, state.tagFilter[s.id] || '');
      if (c) ensureTileVisible(c.id);
    });
  }
}

/** 選んだ企業のタイルが画面外（またはシートの裏）なら見える位置までスクロール */
function ensureTileVisible(id) {
  const tile = els.view.querySelector(`.tile[data-id="${CSS.escape(id)}"]`);
  if (!tile) return;
  const top = document.querySelector('.tabs').getBoundingClientRect().bottom + 10;
  const sheetEl = document.getElementById('sheet');
  const desktop = window.matchMedia('(min-width: 900px)').matches;
  // シートはアニメーション中なので、位置ではなく高さから最終的な上端を計算する
  const bottom = desktop ? window.innerHeight - 10 : window.innerHeight - sheetEl.offsetHeight - 10;
  const r = tile.getBoundingClientRect();
  if (r.top >= top && r.bottom <= bottom) return;
  const room = Math.max(0, bottom - top - r.height);
  window.scrollTo({ top: window.scrollY + r.top - top - Math.min(room / 2, 40), behavior: 'smooth' });
}

function redrawLines() {
  if (state.view !== 'map' || !state.sector) return;
  const map = els.view.querySelector('#map');
  if (map) drawLines(map, state.sector, state.companyId, state.showLines);
}

/* ---------------- actions ---------------- */

function selectCompany(id) {
  if (!id) return closeCompany();
  if (id === state.companyId) return;
  if (state.companyId) navigate({ companyId: id }, { replace: true });
  else {
    sheetPushed = true;
    navigate({ companyId: id });
  }
}

function closeCompany() {
  if (!state.companyId) return;
  if (sheetPushed) {
    sheetPushed = false;
    history.back();
  } else {
    navigate({ companyId: null }, { replace: true });
  }
}

/** 会社の詳細から「つながり」タブへ：その会社を選んだ状態で開く */
function openNetworkFor(id) {
  if (!state.sector?.network) return;
  focusNetworkNode(state, state.sectorId, id);
  const already = state.view === 'net';
  sheetPushed = false;
  navigate({ view: 'net', companyId: null }, { replace: true });
  if (already) renderView();
  window.scrollTo({ top: 0, behavior: already ? 'smooth' : 'auto' });
}

function setRegion(region) {
  if (region === state.region) return;
  state.region = region;
  store.set('region', region);
  // 「日本」に戻したとき、海外企業の詳細を開いていたら閉じる
  const c = state.companyId && state.sector?.companyMap.get(state.companyId);
  if (c && region === 'jp' && c.region === 'overseas') {
    state.companyId = null;
    if (sheetPushed) {
      sheetPushed = false;
      history.back();
    } else {
      history.replaceState(null, '', buildHash({ sectorId: state.sectorId, view: state.view, companyId: null }));
    }
  }
  if (state.sector) {
    renderRegion();
    renderHero();
    renderView();
    syncSelection();
  }
}

/* ---------------- errors ---------------- */

function errorHtml(e) {
  const isFile = location.protocol === 'file:';
  const hint = isFile || e?.kind === 'network'
    ? '<p style="margin-top:8px">HTMLファイルを直接開くとデータを読み込めません。GitHub Pages で開くか、フォルダで <code>python3 -m http.server</code> を実行して <code>http://localhost:8000</code> を開いてください。</p>'
    : '';
  return `<div class="error"><b>データを表示できませんでした</b>${esc(e?.message || String(e))}${hint}</div>`;
}

function renderFatal(e) {
  els.tabs.innerHTML = '';
  els.hero.innerHTML = '';
  els.viewSwitch.innerHTML = '';
  els.view.innerHTML = errorHtml(e);
}

function renderSectorError(e) {
  state.sector = null;
  els.hero.innerHTML = '';
  els.viewSwitch.innerHTML = '';
  els.view.innerHTML = errorHtml(e);
}

/* ---------------- boot ---------------- */

async function boot() {
  try {
    state.index = await loadIndex();
  } catch (e) {
    renderFatal(e);
    return;
  }
  document.title = state.index.title;

  els.tabs.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) return document.getElementById('menuBtn').click();
    const b = e.target.closest('[data-sector]');
    if (b && (b.dataset.sector !== state.sectorId || !state.sector)) {
      sheetPushed = false;
      navigate({ sectorId: b.dataset.sector, companyId: null });
    }
  });
  els.viewSwitch.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b && b.dataset.view !== state.view) navigate({ view: b.dataset.view }, { replace: true });
  });
  els.hero.addEventListener('click', (e) => {
    const b = e.target.closest('[data-set-region]');
    if (b) setRegion(b.dataset.setRegion);
  });
  document.querySelector('.region').addEventListener('click', (e) => {
    const b = e.target.closest('[data-region]');
    if (b) setRegion(b.dataset.region);
  });

  initSheet({ onClose: closeCompany, onSelect: selectCompany, onNetwork: openNetworkFor });
  initDrawer({
    getState: () => state,
    onSector: (id) => {
      sheetPushed = false;
      navigate({ sectorId: id, companyId: null });
    },
    onCompany: (sid, cid) => {
      sheetPushed = false;
      navigate({ sectorId: sid, view: 'map', companyId: cid });
    },
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isDrawerOpen()) closeDrawer();
    else if (state.companyId) closeCompany();
  });

  window.addEventListener('popstate', applyRoute);
  window.addEventListener('hashchange', applyRoute);

  // 画面サイズやレイアウトが変わったら線を引き直す
  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(redrawLines);
  };
  new ResizeObserver(schedule).observe(els.view);
  window.addEventListener('resize', schedule);
  document.fonts?.ready.then(schedule);

  await applyRoute();
}

boot();
