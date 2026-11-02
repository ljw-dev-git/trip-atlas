// 앱 진입점: 라우터, 테마, 전체 렌더
import { getState, subscribe, getTrip, importSeed, collectImageIds } from './store.js';
import { initImages, gcImages } from './images.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTrip } from './views/trip.js';
import { renderSettings } from './views/settings.js';
import { esc } from './util.js';
import { SKINS, getSkin, applySkin, applySkinFromURL } from './skins.js';

const app = document.getElementById('app');
const topnav = document.getElementById('topnav');
const tabbar = document.getElementById('tabbar');

// ----- 테마 -----
const THEME_KEY = 'trip-atlas:theme';
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme(localStorage.getItem(THEME_KEY) || 'auto');
document.getElementById('theme-toggle').onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
};

// ----- 디자인 버전 -----
applySkinFromURL();
applySkin(getSkin(), { persist: false });
const skinBtn = document.getElementById('skin-btn'), skinMenu = document.getElementById('skin-menu');
function drawSkinMenu() {
  const cur = getSkin();
  skinMenu.innerHTML = `<div class="sm-title">디자인 버전</div>` + SKINS.map(s => `<button type="button" data-skin-id="${s.id}" class="${s.id === cur ? 'on' : ''}"><span class="sw" style="--a:${s.sw[0]};--b:${s.sw[1]};--c:${s.sw[2]}"></span><span><b>${s.name}</b><small>${esc(s.ref)}</small></span><span class="chk">${s.id === cur ? '✓' : ''}</span></button>`).join('') + `<a class="sm-more" href="#/settings">설명과 미리보기 →</a>`;
}
skinBtn.onclick = e => { e.stopPropagation(); if (skinMenu.hidden) drawSkinMenu(); skinMenu.hidden = !skinMenu.hidden; };
skinMenu.onclick = e => { const b = e.target.closest('[data-skin-id]'); if (!b) return; applySkin(b.dataset.skinId); drawSkinMenu(); };
document.addEventListener('click', e => { if (!e.target.closest('.skin-wrap')) skinMenu.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') skinMenu.hidden = true; });

// ----- 라우터 -----
export function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (!parts.length) return { page: 'home' };
  if (parts[0] === 'settings') return { page: 'settings' };
  if (parts[0] === 'trip' && parts[1]) return { page: 'trip', tripId: parts[1], tab: parts[2] || 'overview', sub: parts[3] || '' };
  return { page: 'home' };
}
export const navigate = hash => { location.hash = hash; };

let lastKey = '';
function render() {
  const route = parseRoute();
  const key = JSON.stringify(route);
  const routeChanged = key !== lastKey;
  lastKey = key;
  if (routeChanged) window.scrollTo({ top: 0 });

  topnav.innerHTML = `<a href="#/" class="${route.page === 'home' ? 'active' : ''}">내 여행</a><a href="#/settings" class="${route.page === 'settings' ? 'active' : ''}">백업·설정</a>`;
  tabbar.innerHTML = '';

  if (route.page === 'trip') {
    const trip = getTrip(route.tripId);
    if (!trip) {
      app.innerHTML = `<div class="empty" style="margin-top:40px"><strong>여행을 찾을 수 없습니다</strong><a href="#/">목록으로 돌아가기</a></div>`;
      return;
    }
    document.title = `${trip.title} · Trip Atlas`;
    renderTrip(app, trip, route, { routeChanged });
    const tabs = [['overview', '개요', '◎'], ['itinerary', '일정', '≡'], ['map', '지도', '⌖'], ['ledger', '가계부', '¥'], ['journal', '기록', '✎']];
    tabbar.innerHTML = tabs.map(([id, label, ic]) => `<a href="#/trip/${esc(trip.id)}/${id}" class="${route.tab === id ? 'active' : ''}"><span class="ic">${ic}</span>${label}</a>`).join('');
    return;
  }
  if (route.page === 'settings') { document.title = '백업·설정 · Trip Atlas'; renderSettings(app); return; }
  document.title = 'Trip Atlas · 여행 수첩';
  renderDashboard(app);
}

// 이미지 저장소를 먼저 올린 뒤 렌더 (동기 렌더에서 이미지 URL을 바로 쓰기 위해)
await initImages();

// 첫 실행: 예시 여행(시즈오카) 자동 로드
const st = getState();
if (!st.settings.seeded && !st.trips.length) importSeed();

window.addEventListener('hashchange', render);
subscribe(render);
render();

// 참조가 끊긴 업로드 사진 정리
gcImages(collectImageIds()).then(n => { if (n) console.info(`사용하지 않는 사진 ${n}장을 정리했습니다`); });
