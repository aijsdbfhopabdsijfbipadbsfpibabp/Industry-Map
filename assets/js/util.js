// 小さな共通ヘルパー

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** HTML エスケープ */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** グループ色の名前 → 色コード（淡いトーンで統一） */
export const PALETTE = {
  pink: '#eea4bc',
  navy: '#8d9bc2',
  lavender: '#b7a8d9',
  sky: '#98bfdc',
  peach: '#f1b89b',
  sage: '#a6c8b4',
  rose: '#e39fae',
  lemon: '#e3cf86',
  gray: '#b8bcc8',
};
export const AUTO_COLORS = ['pink', 'navy', 'lavender', 'sky', 'peach', 'sage', 'rose', 'lemon', 'gray'];

export function resolveColor(color, index = 0) {
  if (typeof color === 'string') {
    if (PALETTE[color]) return PALETTE[color];
    if (/^#([0-9a-f]{3}){1,2}$/i.test(color)) return color;
  }
  return PALETTE[AUTO_COLORS[index % AUTO_COLORS.length]];
}

/** 数値の表示。単位が「億円」のときは 1兆2,345億円 のように整形 */
export function formatValue(value, metric = {}, meta = {}) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  const unit = metric.unit ?? '';
  const neg = value < 0;
  const abs = Math.abs(value);
  const digits = Number.isInteger(metric.decimals) ? metric.decimals : (Number.isInteger(abs) ? 0 : 1);
  const fmt = (n) => n.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  let body;
  if (unit === '億円' && abs >= 10000) {
    const cho = Math.floor(abs / 10000);
    const oku = Math.round(abs - cho * 10000);
    body = `${cho}兆${oku > 0 ? `${oku.toLocaleString('ja-JP')}億` : ''}円`;
  } else {
    body = `${fmt(abs)}${unit}`;
  }
  return `${meta.approx ? '約' : ''}${neg ? '▲' : ''}${body}`;
}

/** localStorage（使えない環境でも落ちないように） */
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`industry-map:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`industry-map:${key}`, JSON.stringify(value));
    } catch {
      /* 保存できなくても動作は続ける */
    }
  },
};

/** 検索用の正規化（全角/半角・大文字小文字・カタカナ/ひらがなをそろえる） */
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･\-‐ー－]/g, '');
}

export function debounce(fn, ms = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;
