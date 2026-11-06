// 지도 엔진: 구글 지도 API 키가 있으면 구글 지도, 없거나 거부·로딩 실패면 Leaflet(OpenStreetMap)
// 키는 Trip Atlas와 같은 localStorage 항목을 쓴다 (한쪽에서 넣으면 양쪽 모두 구글 지도)
import { esc } from '../../src/util.js';
import { toast } from './ui.js';

// src/views/map.js 의 GMAPS_KEY 와 같은 값. 그 모듈은 forms.js → app.js 를 끌고 와 Trip Atlas 앱을 부팅하므로 import 하지 않는다
export const GMAPS_KEY = 'trip-atlas:gmaps-key';
// 배포 사이트 기본 키: Maps JavaScript API 전용 + ljw-dev-git.github.io/* 리퍼러 제한 + 하루 지도 로드 300회 할당량(무료 범위)
// 리퍼러 제한 때문에 다른 호스트(localhost 등)에서는 거부되므로 배포 호스트에서만 쓴다
const SITE_KEY = 'AIzaSyAPIuRB_PdKrPoK_gAW6tAC9Pa4IF2FZuo';
const SITE_HOST = 'ljw-dev-git.github.io';
const userKey = () => (localStorage.getItem(GMAPS_KEY) || '').trim();
export const usingSiteKey = () => !userKey() && location.hostname === SITE_HOST;
export const getGmapsKey = () => userKey() || (location.hostname === SITE_HOST ? SITE_KEY : '');
export const getUserGmapsKey = userKey;
const PRI = '#5b5ceb';
let gLoading = null, gFailed = false;
const failWatchers = new Set();

function failGoogle(msg) {
  if (gFailed) return;
  gFailed = true;
  toast(`${msg} · OpenStreetMap으로 표시합니다`);
  failWatchers.forEach(fn => fn());
}

function loadGoogle(key) {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (gLoading) return gLoading;
  gLoading = new Promise((resolve, reject) => {
    const cb = '__pintripGmaps';
    window[cb] = () => { delete window[cb]; resolve(); };
    window.gm_authFailure = () => failGoogle('구글 지도 API 키가 거부되었어요 (키·허용 사이트·결제 확인)');
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=ko&region=KR&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => { gLoading = null; s.remove(); reject(new Error('구글 지도를 불러오지 못했어요')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.google?.maps?.Map) { gLoading = null; reject(new Error('구글 지도 로딩 시간이 초과됐어요')); } }, 15000);
  });
  return gLoading;
}

export const mapEngineName = () => (getGmapsKey() && !gFailed ? 'google' : 'osm');

/**
 * el에 지도를 띄우고 draw(eng)로 그린다. 구글 실패 시 같은 draw로 OSM에 다시 그린다.
 * eng: num(ll, n, title) · dot(ll, color, title, big, popupHtml?) · deal(ll, text, color, popupHtml) · emoji(ll, emoji, ringColor, title, popupHtml) · line(lls) · fit(lls) · view(ll, z)
 * 반환값의 destroy()로 정리.
 */
export function mountMap(el, draw) {
  let eng = null, dead = false;
  const useOSM = () => { if (dead || !el.isConnected) return; eng && eng.destroy(); eng = makeLeaflet(el); draw(eng); };
  failWatchers.add(useOSM);
  if (mapEngineName() === 'google') {
    loadGoogle(getGmapsKey()).then(() => {
      if (dead || !el.isConnected || gFailed) return;
      eng = makeGoogle(el); draw(eng);
    }).catch(e => { gFailed = true; toast(`${e.message} · OpenStreetMap으로 표시합니다`); useOSM(); });
  } else useOSM();
  return { destroy() { dead = true; failWatchers.delete(useOSM); eng && eng.destroy(); eng = null; } };
}

// 구글 키를 바꾸면 다시 시도할 수 있게
export function resetMapEngine() { gFailed = false; }

// 구글 지도 스크립트가 준비되면 resolve (구글 엔진을 못 쓰면 reject)
export function googleReady() {
  if (mapEngineName() !== 'google') return Promise.reject(new Error('구글 지도 키가 없거나 거부되었어요'));
  return loadGoogle(getGmapsKey());
}

/* ---------- Leaflet + OSM ---------- */
function makeLeaflet(el) {
  if (!window.L) return makeNone(el);
  const map = L.map(el, { zoomControl: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  return {
    num(ll, n, title) { L.marker(ll, { icon: L.divIcon({ className: 'num-pin', html: `<span>${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map).bindTooltip(esc(title)); },
    dot(ll, color, title, big, popup) { const c = L.circleMarker(ll, { radius: big ? 8 : 6, color: '#fff', weight: big ? 3 : 2, fillColor: color, fillOpacity: 1 }).addTo(map); popup ? c.bindPopup(popup, { className: 'pp', closeButton: false, maxWidth: 260 }) : c.bindTooltip(esc(title)); },
    emoji(ll, emo, ring, title, popup) { L.marker(ll, { title, icon: L.divIcon({ className: 'emo-pin', html: `<span style="--c:${ring}">${emo}</span>`, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] }) }).addTo(map).bindPopup(popup, { className: 'pp', closeButton: false, maxWidth: 260 }); },
    deal(ll, text, color, popup) { L.marker(ll, { icon: L.divIcon({ className: 'deal-pin', html: `<span style="--c:${color}">${esc(text)}</span>`, iconSize: [44, 26], iconAnchor: [22, 26] }) }).addTo(map).bindPopup(popup); },
    line(lls) { L.polyline(lls, { color: PRI, weight: 3, dashArray: '6 6' }).addTo(map); },
    fit(lls) { if (lls.length === 1) map.setView(lls[0], 14); else map.fitBounds(lls, { padding: [28, 28] }); },
    view(ll, z) { map.setView(ll, z); },
    destroy() { map.remove(); },
  };
}

function makeNone(el) {
  el.innerHTML = '<p>지도를 불러오지 못했어요</p>';
  const n = () => {};
  return { num: n, dot: n, deal: n, emoji: n, line: n, fit: n, view: n, destroy() { el.innerHTML = ''; } };
}

/* ---------- Google Maps JavaScript API ---------- */
const svgIcon = (svg, w, h, ax, ay) => ({ url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(w, h), anchor: new google.maps.Point(ax, ay) });

function makeGoogle(el) {
  el.innerHTML = '';
  const g = google.maps;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const map = new g.Map(el, {
    center: { lat: 35, lng: 138.4 }, zoom: 10, disableDefaultUI: true, zoomControl: false, clickableIcons: false, gestureHandling: 'greedy',
    styles: dark ? [{ elementType: 'geometry', stylers: [{ color: '#1c1d24' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#9a9cab' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#1c1d24' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b2d38' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#11172a' }] }] : [],
  });
  const iw = new g.InfoWindow({ maxWidth: 260, headerDisabled: true });
  map.addListener('click', () => iw.close());
  const items = [];
  const toLL = ll => ({ lat: ll[0], lng: ll[1] });
  const add = o => { items.push(o); return o; };
  return {
    num(ll, n, title) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle cx="15" cy="15" r="12" fill="${PRI}" stroke="#fff" stroke-width="2.5"/><text x="15" y="19.5" text-anchor="middle" font-family="Pretendard,system-ui,sans-serif" font-size="12.5" font-weight="800" fill="#fff">${n}</text></svg>`;
      add(new g.Marker({ map, position: toLL(ll), title, icon: svgIcon(svg, 30, 30, 15, 15), zIndex: 10 }));
    },
    dot(ll, color, title, big, popup) {
      const m = add(new g.Marker({ map, position: toLL(ll), title, icon: { path: g.SymbolPath.CIRCLE, scale: big ? 8 : 6, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: big ? 3 : 2 }, zIndex: big ? 20 : 1 }));
      if (popup) m.addListener('click', () => { iw.setContent(popup); iw.open({ map, anchor: m }); });
    },
    deal(ll, text, color, popup) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="30"><rect x="2" y="2" width="44" height="22" rx="11" fill="${color}" stroke="#fff" stroke-width="2"/><path d="M19 24 L24 29 L29 24Z" fill="${color}"/><text x="24" y="17.5" text-anchor="middle" font-family="Pretendard,system-ui,sans-serif" font-size="12" font-weight="800" fill="#fff">${esc(text)}</text></svg>`;
      const m = add(new g.Marker({ map, position: toLL(ll), icon: svgIcon(svg, 48, 30, 24, 29), zIndex: 5 }));
      m.addListener('click', () => { iw.setContent(popup); iw.open({ map, anchor: m }); });
    },
    emoji(ll, emo, ring, title, popup) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="13.5" fill="#fff" stroke="${ring}" stroke-width="2.5"/><text x="16" y="21.5" text-anchor="middle" font-size="15" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emo}</text></svg>`;
      const m = add(new g.Marker({ map, position: toLL(ll), title, icon: svgIcon(svg, 30, 30, 15, 15), zIndex: 5 }));
      m.addListener('click', () => { iw.setContent(popup); iw.open({ map, anchor: m }); });
    },
    line(lls) {
      add(new g.Polyline({ map, path: lls.map(toLL), strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: .9, strokeColor: PRI, scale: 3 }, offset: '0', repeat: '12px' }] }));
    },
    fit(lls) {
      if (lls.length === 1) { map.setCenter(toLL(lls[0])); map.setZoom(14); return; }
      const b = new g.LatLngBounds(); lls.forEach(ll => b.extend(toLL(ll))); map.fitBounds(b, 28);
    },
    view(ll, z) { map.setCenter(toLL(ll)); map.setZoom(z); },
    destroy() { iw.close(); items.forEach(o => o.setMap(null)); el.innerHTML = ''; },
  };
}
