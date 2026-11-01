// 공통 유틸리티: 포맷, 날짜, HTML 이스케이프, Google Maps URL 파싱

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const html = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (i < vals.length ? (Array.isArray(vals[i]) ? vals[i].join('') : vals[i] ?? '') : ''), '');

export function todayISO() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

export function dateRange(start, end) {
  const out = [];
  if (!start) return out;
  const n = end ? Math.max(0, daysBetween(start, end)) : 0;
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDate(iso, opt = {}) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const w = WEEK[new Date(iso + 'T00:00:00').getDay()];
  if (opt.short) return `${m}.${d} (${w})`;
  if (opt.long) return `${y}년 ${m}월 ${d}일 ${w}요일`;
  return `${m}월 ${d}일 (${w})`;
}

export function fmtRange(a, b) {
  if (!a) return '날짜 미정';
  if (!b || a === b) return fmtDate(a, { long: true });
  const [ya, ma] = a.split('-'); const [yb, mb] = b.split('-');
  const nights = daysBetween(a, b);
  const left = `${ya}.${ma}.${a.slice(8)}`;
  const right = ya === yb ? `${mb}.${b.slice(8)}` : `${yb}.${mb}.${b.slice(8)}`;
  return `${left} – ${right} · ${nights}박 ${nights + 1}일`;
}

export const CURRENCIES = {
  KRW: { symbol: '₩', name: '원', digits: 0 },
  JPY: { symbol: '¥', name: '엔', digits: 0 },
  USD: { symbol: '$', name: '달러', digits: 2 },
  EUR: { symbol: '€', name: '유로', digits: 2 },
  TWD: { symbol: 'NT$', name: '대만달러', digits: 0 },
  THB: { symbol: '฿', name: '바트', digits: 0 },
  VND: { symbol: '₫', name: '동', digits: 0 },
  CNY: { symbol: '¥', name: '위안', digits: 0 },
  GBP: { symbol: '£', name: '파운드', digits: 2 },
  SGD: { symbol: 'S$', name: '싱가포르달러', digits: 2 },
};

export function fmtMoney(amount, currency = 'KRW', opt = {}) {
  const c = CURRENCIES[currency] || { symbol: currency + ' ', digits: 0 };
  const n = Number(amount) || 0;
  const s = n.toLocaleString('ko-KR', { minimumFractionDigits: opt.digits ?? c.digits, maximumFractionDigits: opt.digits ?? c.digits });
  return opt.plain ? s : `${c.symbol}${s}`;
}

export function fmtNum(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }

// Google Maps URL에서 좌표 추출: !3d{lat}!4d{lng} 또는 @{lat},{lng} 또는 q=lat,lng 또는 query=lat,lng
export function parseLatLng(text) {
  if (!text) return null;
  const s = String(text).trim();
  let m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: +m[1], lng: +m[2] };
  m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: +m[1], lng: +m[2] };
  m = s.match(/[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)[,%2C]+(-?\d+(?:\.\d+)?)/i);
  if (m) return { lat: +m[1], lng: +m[2] };
  m = s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (m) return { lat: +m[1], lng: +m[2] };
  return null;
}

export const isGoogleShortLink = s => /maps\.app\.goo\.gl|goo\.gl\/maps/.test(String(s || ''));

// Google Maps 열기 링크 (장소)
export function gmapsPlaceUrl(p) {
  if (p.url && /google\.[a-z.]+\/maps/.test(p.url)) return p.url;
  const q = p.localName || p.name || '';
  if (p.lat != null && p.lng != null) {
    return q
      ? `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${p.lat},${p.lng},17z`
      : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// Google Maps 길찾기 링크 (하루 경로 전체). 경유지는 최대 9개까지 지원.
export function gmapsRouteUrl(points, mode = 'walking') {
  const pts = points.filter(p => p.lat != null && p.lng != null);
  if (pts.length < 2) return pts.length === 1 ? gmapsPlaceUrl(pts[0]) : '';
  const f = p => `${p.lat},${p.lng}`;
  const origin = f(pts[0]);
  const dest = f(pts[pts.length - 1]);
  const way = pts.slice(1, -1).slice(0, 9).map(f).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${way ? '&waypoints=' + encodeURIComponent(way) : ''}&travelmode=${mode}`;
}

export function haversineKm(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function download(filename, content, type = 'application/octet-stream') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const PLACE_CATEGORIES = {
  sight: { label: '관광', icon: '' },
  food: { label: '식당', icon: '' },
  cafe: { label: '카페', icon: '' },
  shop: { label: '쇼핑', icon: '' },
  stay: { label: '숙소', icon: '' },
  transit: { label: '교통', icon: '' },
  other: { label: '기타', icon: '' },
};

export const EXPENSE_CATEGORIES = [
  { id: 'flight', label: '항공', icon: '' },
  { id: 'stay', label: '숙박', icon: '' },
  { id: 'transport', label: '교통', icon: '' },
  { id: 'food', label: '식비', icon: '' },
  { id: 'cafe', label: '카페·간식', icon: '' },
  { id: 'sight', label: '관광·입장', icon: '' },
  { id: 'shop', label: '쇼핑', icon: '' },
  { id: 'etc', label: '기타', icon: '' },
];
export const expenseCat = id => EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES[7];

export const PAY_METHODS = { cash: '현금', card: '카드', transit: '교통카드', other: '기타' };
export const TRANSPORT_MODES = { walk: '도보', transit: '전철·JR', bus: '버스', taxi: '택시', car: '자동차', bike: '자전거', flight: '항공', ship: '배' };
