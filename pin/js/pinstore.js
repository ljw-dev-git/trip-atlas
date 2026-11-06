// pintrip 전용 상태(콘텐츠·쿠폰·가격 알림·채팅). 여행/일정/지출은 Trip Atlas 저장소(src/store.js)를 그대로 공유한다.
import { uid, todayISO } from '../../src/util.js';
import { HOTELS, priceHistory, priceStats } from './data.js';

const KEY = 'pintrip:v1';
const listeners = new Set();
const blank = () => ({
  region: 'all', member: { name: '여행자', no: '' }, regionTipSeen: false,
  favCoupons: [], myCoupons: [], usedCoupons: [],
  watches: [], alerts: [], flightAlerts: [],
  folders: [{ id: 'f-default', name: '저장한 핫플' }], contents: [],
  chat: [],
});

let st = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return Object.assign(blank(), JSON.parse(raw)); } catch (e) { console.warn(e); }
  return blank();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { console.error('저장 실패', e); } listeners.forEach(f => f(st)); }

if (!st.member.no) { st.member.no = 'PT-' + String(Math.floor(Math.random() * 9e7 + 1e7)); save(); }

export const pin = () => st;
export const onPin = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function setPin(mut, { silent = false } = {}) { mut(st); if (silent) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} } else save(); }

export function pushAlert(title, body, link = '') {
  st.alerts.unshift({ id: uid(), title, body, link, time: Date.now(), read: false });
  st.alerts = st.alerts.slice(0, 50);
  save();
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch {}
}

// 앱 진입 시: 감시 중인 숙소가 목표가 이하로 떨어졌으면 하루 한 번 알림
export function checkWatches() {
  const today = todayISO();
  st.watches.forEach(w => {
    const h = HOTELS.find(x => x.id === w.hotelId); if (!h || !w.on) return;
    const { now } = priceStats(priceHistory(h, w.checkIn));
    if (now.price <= w.target && w.lastAlert !== today) {
      w.lastAlert = today;
      pushAlert('호텔 가격 알림', `[${h.name}] 가격이 목표가(₩${w.target.toLocaleString('ko-KR')}) 이하로 떨어졌어요! 현재 ₩${now.price.toLocaleString('ko-KR')}/박`, `#/hotels/${h.id}`);
    }
  });
}

export function platformOf(url = '') {
  if (/instagram\.com/.test(url)) return 'instagram';
  if (/youtu\.?be/.test(url)) return 'youtube';
  if (/tiktok\.com/.test(url)) return 'tiktok';
  if (/blog\.naver|tistory|brunch|medium/.test(url)) return 'blog';
  if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(url)) return 'map';
  return url ? 'web' : 'memo';
}
export const PLATFORM = {
  instagram: { label: 'Instagram', color: '#d6249f' }, youtube: { label: 'YouTube', color: '#e62117' },
  tiktok: { label: 'TikTok', color: '#111' }, blog: { label: '블로그', color: '#03a94d' },
  map: { label: '지도', color: '#1a73e8' }, web: { label: '웹', color: '#6b7280' }, memo: { label: '메모', color: '#6b7280' },
};
export function youtubeThumb(url = '') {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : '';
}
