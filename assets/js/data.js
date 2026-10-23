// データ読み込み（data/index.json と data/sectors/*.json）
import { resolveColor } from './util.js';

export const RELATION_TYPES = {
  subsidiary: { label: '子会社・傘下', parent: '親会社', child: '子会社・傘下' },
  equity: { label: '出資', parent: '出資元', child: '出資先' },
  alliance: { label: '提携・FC', parent: '提携', child: '提携' },
  other: { label: '関係', parent: '関係', child: '関係' },
};

const DATA_ROOT = 'data/';
const cache = new Map();
let indexPromise = null;

async function fetchJson(path) {
  let res;
  try {
    res = await fetch(path, { cache: 'no-cache' });
  } catch (e) {
    throw new DataError(`「${path}」を読み込めませんでした。`, 'network', e);
  }
  if (!res.ok) throw new DataError(`「${path}」が見つかりません（${res.status}）。`, 'notfound');
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new DataError(`「${path}」のJSONの書き方に誤りがあります：${e.message}`, 'parse', e);
  }
}

export class DataError extends Error {
  constructor(message, kind, cause) {
    super(message);
    this.kind = kind;
    this.cause = cause;
  }
}

export function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetchJson(`${DATA_ROOT}index.json`).then((raw) => {
      const sectors = (Array.isArray(raw.sectors) ? raw.sectors : [])
        .filter((s) => s && s.id && s.hidden !== true)
        .map((s) => ({
          id: String(s.id),
          name: s.name || s.id,
          icon: s.icon || '📁',
          category: s.category || 'その他',
          description: s.description || '',
          file: s.file || `sectors/${s.id}.json`,
        }));
      return { title: raw.title || '業界地図', sectors };
    });
    indexPromise.catch(() => { indexPromise = null; });
  }
  return indexPromise;
}

export async function loadSector(meta) {
  if (cache.has(meta.id)) return cache.get(meta.id);
  const p = fetchJson(DATA_ROOT + meta.file).then((raw) => normalizeSector(raw, meta));
  cache.set(meta.id, p);
  p.catch(() => cache.delete(meta.id));
  return p;
}

export function loadAllSectors(index) {
  return Promise.allSettled(index.sectors.map((m) => loadSector(m)));
}

/** 指標の値： 数値 または { "value": 数値, "approx": true, "note": "…" } */
function normalizeValue(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v, meta: {} };
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/,/g, '')))) {
    return { value: Number(v.replace(/,/g, '')), meta: {} };
  }
  if (v && typeof v === 'object' && typeof v.value === 'number') {
    return { value: v.value, meta: { approx: !!v.approx, note: v.note || '', period: v.period || '' } };
  }
  return null;
}

function normalizeRegion(r) {
  const s = String(r ?? 'jp').toLowerCase();
  return ['overseas', 'global', 'world', 'foreign', '海外'].includes(s) ? 'overseas' : 'jp';
}

/** 入力JSONをアプリで使いやすい形に整え、気になる点を warnings に集める */
export function normalizeSector(raw, meta) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') raw = {};

  const metrics = (Array.isArray(raw.metrics) && raw.metrics.length ? raw.metrics : [{ key: 'revenue', label: '売上高', unit: '億円' }])
    .filter((m) => m && m.key)
    .map((m) => ({ key: String(m.key), label: m.label || m.key, unit: m.unit ?? '', order: m.order === 'asc' ? 'asc' : 'desc', decimals: m.decimals, description: m.description || '' }));
  const metricMap = new Map(metrics.map((m) => [m.key, m]));
  const sizeBy = metricMap.has(raw.sizeBy) ? raw.sizeBy : metrics[0].key;

  // groups
  const groups = [];
  const groupMap = new Map();
  (Array.isArray(raw.groups) ? raw.groups : []).forEach((g, i) => {
    if (!g || !g.id) { warnings.push(`groups[${i}] に id がありません`); return; }
    if (groupMap.has(g.id)) { warnings.push(`グループ id「${g.id}」が重複しています`); return; }
    const sb = g.sizeBy && metricMap.has(g.sizeBy) ? g.sizeBy : null;
    if (g.sizeBy && !sb) warnings.push(`グループ「${g.id}」の sizeBy「${g.sizeBy}」は metrics にありません`);
    const scale = typeof g.scale === 'number' && g.scale > 0 && g.scale <= 1 ? g.scale : 1;
    const group = { id: String(g.id), name: g.name || g.id, short: g.short || '', section: g.section || '', description: g.description || '', color: resolveColor(g.color, i), sizeBy: sb, scale };
    groups.push(group);
    groupMap.set(group.id, group);
  });

  // companies
  const companies = [];
  const companyMap = new Map();
  (Array.isArray(raw.companies) ? raw.companies : []).forEach((c, i) => {
    if (!c || (!c.id && !c.name)) { warnings.push(`companies[${i}] に id / name がありません`); return; }
    const id = String(c.id || c.name);
    if (!c.id) warnings.push(`「${c.name}」に id がないため名前を id として使っています`);
    if (companyMap.has(id)) { warnings.push(`企業 id「${id}」が重複しています（2件目を無視）`); return; }

    let groupId = c.group;
    if (!groupMap.has(groupId)) {
      if (groupId) warnings.push(`「${c.name || id}」のグループ「${groupId}」が groups にありません（「その他」に表示）`);
      groupId = '__other';
      if (!groupMap.has(groupId)) {
        const g = { id: groupId, name: 'その他', short: '', section: '', description: '', color: resolveColor('gray'), sizeBy: null, scale: 1 };
        groups.push(g);
        groupMap.set(groupId, g);
      }
    }

    const values = {};
    const valueMeta = {};
    for (const [k, v] of Object.entries(c.metrics || {})) {
      const nv = normalizeValue(v);
      if (!nv) { warnings.push(`「${c.name || id}」の指標「${k}」が数値ではありません`); continue; }
      if (!metricMap.has(k)) warnings.push(`「${c.name || id}」の指標「${k}」は metrics に定義がありません（表示されません）`);
      values[k] = nv.value;
      valueMeta[k] = nv.meta;
    }

    const company = {
      id,
      name: c.name || id,
      short: c.short || '',
      group: groupId,
      region: normalizeRegion(c.region),
      country: c.country || '',
      code: c.code || '',
      fy: c.fy || '',
      tagline: c.tagline || '',
      description: c.description || '',
      values,
      valueMeta,
      brands: (Array.isArray(c.brands) ? c.brands : [])
        .map((b) => (typeof b === 'string' ? { name: b } : b && b.name ? { name: b.name, note: b.note || '' } : null))
        .filter(Boolean),
      points: Array.isArray(c.points) ? c.points.filter(Boolean) : [],
      facts: (Array.isArray(c.facts) ? c.facts : []).filter((f) => f && f.label),
      url: typeof c.url === 'string' ? c.url : '',
      tags: Array.isArray(c.tags) ? [...new Set(c.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()))] : [],
    };
    companies.push(company);
    companyMap.set(id, company);
  });

  // relations
  const relations = [];
  (Array.isArray(raw.relations) ? raw.relations : []).forEach((r, i) => {
    if (!r || !r.from || !r.to) { warnings.push(`relations[${i}] に from / to がありません`); return; }
    if (!companyMap.has(r.from)) { warnings.push(`関係の from「${r.from}」が companies にありません`); return; }
    if (!companyMap.has(r.to)) { warnings.push(`関係の to「${r.to}」が companies にありません`); return; }
    const type = RELATION_TYPES[r.type] ? r.type : 'other';
    if (r.type && !RELATION_TYPES[r.type]) warnings.push(`関係の type「${r.type}」は不明です（subsidiary / equity / alliance / other）`);
    relations.push({ from: r.from, to: r.to, type, label: r.label || '', note: r.note || '' });
  });

  const market = {};
  for (const key of ['jp', 'global']) {
    const m = raw.market?.[key];
    if (m && m.value) market[key] = { label: m.label || (key === 'jp' ? '国内市場' : '世界市場'), value: String(m.value), period: m.period || '', note: m.note || '', source: m.source || '', url: m.url || '' };
  }

  // タグ（絞り込み用）。tagGroups で見出しと並び順を決められる。書かれていないタグは「その他」に入る
  const allTags = [...new Set(companies.flatMap((c) => c.tags))];
  const tagGroups = [];
  const placed = new Set();
  (Array.isArray(raw.tagGroups) ? raw.tagGroups : []).forEach((tg) => {
    if (!tg || !Array.isArray(tg.tags)) return;
    const tags = tg.tags.filter((t) => allTags.includes(t) && !placed.has(t));
    tags.forEach((t) => placed.add(t));
    if (tags.length) tagGroups.push({ label: tg.label || 'タグ', tags });
  });
  const rest = allTags.filter((t) => !placed.has(t));
  if (rest.length) tagGroups.push({ label: tagGroups.length ? 'その他' : 'タグ', tags: rest });

  const VERDICTS = { yes: '○ おおむね正しい', partly: '△ 一部正しい', no: '× 違う', open: '？ 検討中' };
  const insights = (Array.isArray(raw.insights) ? raw.insights : [])
    .filter((x) => x && (x.title || x.hypothesis))
    .map((x) => ({
      title: x.title || '考察',
      date: x.date || '',
      hypothesis: x.hypothesis || '',
      verdict: VERDICTS[x.verdict] ? x.verdict : 'open',
      verdictLabel: VERDICTS[x.verdict] || VERDICTS.open,
      sections: (Array.isArray(x.sections) ? x.sections : [])
        .filter((s) => s && s.label && Array.isArray(s.items) && s.items.length)
        .map((s) => ({ label: s.label, items: s.items.filter(Boolean) })),
      conclusion: x.conclusion || '',
      tag: typeof x.tag === 'string' ? x.tag : '',
    }));

  return {
    id: meta.id,
    name: raw.name || meta.name,
    icon: raw.icon || meta.icon,
    category: raw.category || meta.category,
    updated: raw.updated || '',
    summary: raw.summary || '',
    market,
    metrics,
    metricMap,
    sizeBy,
    rankBy: metricMap.has(raw.rankBy) ? raw.rankBy : sizeBy,
    groups: groups.filter((g) => companies.some((c) => c.group === g.id)),
    groupMap,
    companies,
    companyMap,
    relations,
    breakdowns: (Array.isArray(raw.breakdowns) ? raw.breakdowns : [])
      .filter((b) => b && Array.isArray(b.items) && b.items.length)
      .map((b) => ({
        title: b.title || '内訳',
        unit: b.unit ?? '',
        period: b.period || '',
        note: b.note || '',
        source: b.source || '',
        url: b.url || '',
        items: b.items.filter((it) => it && it.label && typeof it.value === 'number').map((it) => ({ label: it.label, value: it.value, share: typeof it.share === 'number' ? it.share : null, note: it.note || '' })),
      })),
    trends: (Array.isArray(raw.trends) ? raw.trends : []).map((t) => (typeof t === 'string' ? { title: t, text: '' } : t)).filter((t) => t && t.title),
    timeline: (Array.isArray(raw.timeline) ? raw.timeline : []).filter((t) => t && t.text),
    notes: Array.isArray(raw.notes) ? raw.notes.filter(Boolean) : [],
    sources: (Array.isArray(raw.sources) ? raw.sources : []).map((s) => (typeof s === 'string' ? { title: s, url: '' } : s)).filter((s) => s && (s.title || s.url)),
    tagGroups,
    insights,
    warnings,
  };
}

/** 地域フィルター */
export function visibleCompanies(sector, region) {
  return region === 'world' ? sector.companies : sector.companies.filter((c) => c.region === 'jp');
}
