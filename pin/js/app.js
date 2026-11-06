// pintrip 진입점: 해시 라우터, 상단바, 하단 탭
import { getState, subscribe, importSeed, importTripJSON } from '../../src/store.js';
import { initImages } from '../../src/images.js';
import { pin, onPin, checkWatches } from './pinstore.js';
import { ic } from './icons.js';
import { closeSheet, toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderPlanList, renderPlan, renderMoney } from './views/plan.js';
import { renderChat } from './views/chat.js';
import { renderNearby } from './views/nearby.js';
import { renderContents } from './views/contents.js';
import { renderFlights } from './views/flights.js';
import { renderHotels, renderHotel } from './views/hotels.js';
import { renderCoupons, renderMembership } from './views/coupons.js';
import { renderAlerts } from './views/alerts.js';
import { decodeShare } from './share.js';

const hd = document.getElementById('hd'), main = document.getElementById('main'), tabs = document.getElementById('tabs');

const TABS = [['', '홈', 'home'], ['plan', '일정', 'calendar'], ['chat', 'AI 챗', 'spark'], ['nearby', '내 주변', 'pin'], ['contents', '콘텐츠', 'play']];

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { page: parts[0] || '', a: parts[1] || '', b: parts[2] || '' };
}

let lastKey = '';
async function render() {
  const r = route();
  const key = location.hash;
  const changed = key !== lastKey; lastKey = key;
  if (changed) { closeSheet(); main.scrollTop = 0; window.scrollTo(0, 0); }
  const tabPage = ['', 'plan', 'chat', 'nearby', 'contents'].includes(r.page) && !(r.page === 'plan' && r.a);
  document.body.dataset.page = r.page || 'home';

  // 상단바: 탭 화면에서만 로고형 헤더
  const unread = pin().alerts.filter(a => !a.read).length;
  hd.hidden = !tabPage;
  hd.innerHTML = tabPage ? `<a class="logo" href="#/" aria-label="pintrip 홈">pintrip<i></i></a>
    <div class="hd-r"><a class="icon-btn" href="#/alerts" aria-label="알림 ${unread}건">${ic('bell')}${unread ? `<b class="dot">${unread > 9 ? '9+' : unread}</b>` : ''}</a>
    <a class="icon-btn" href="#/membership" aria-label="멤버십과 설정">${ic('menu')}</a></div>` : '';
  tabs.hidden = !tabPage && !['flights', 'hotels', 'coupons'].includes(r.page);
  const activeTab = r.page === 'plan' ? 'plan' : r.page;
  tabs.innerHTML = TABS.map(([id, label, icon]) => `<a href="#/${id}" class="${activeTab === id ? 'on' : ''}">${ic(icon)}<span>${label}</span></a>`).join('');

  const views = {
    '': () => renderHome(main),
    plan: () => r.a ? (r.b === 'money' ? renderMoney(main, r.a) : renderPlan(main, r.a)) : renderPlanList(main),
    chat: () => renderChat(main),
    nearby: () => renderNearby(main, { changed }),
    contents: () => renderContents(main),
    flights: () => renderFlights(main),
    hotels: () => r.a ? renderHotel(main, r.a) : renderHotels(main),
    coupons: () => renderCoupons(main),
    membership: () => renderMembership(main),
    alerts: () => renderAlerts(main),
    join: async () => {
      try { const t = await importTripJSON(await decodeShare(r.a)); toast(`'${t.title}' 일정을 받았어요`); location.replace(`#/plan/${encodeURIComponent(t.id)}`); }
      catch (e) { console.error(e); main.innerHTML = `<div class="empty pad"><strong>공유 링크를 열 수 없어요</strong>링크가 잘렸거나 손상되었습니다.<a class="btn" href="#/">홈으로</a></div>`; }
    },
  };
  (views[r.page] || views[''])();
  document.title = r.page ? `${({ plan: '일정', chat: 'AI 챗', nearby: '내 주변', contents: '콘텐츠', flights: '급락 항공', hotels: '숙소 알림', coupons: '쇼핑 쿠폰', membership: '멤버십', alerts: '알림' })[r.page] || 'pintrip'} · pintrip` : 'pintrip · 여행 핀';
}

await initImages();
if (!getState().settings.seeded && !getState().trips.length) importSeed();
checkWatches();

window.addEventListener('hashchange', render);
// 같은 화면에서 데이터가 바뀌면 다시 그림(지도·입력 중인 화면은 뷰가 직접 처리)
let pending = false;
const rerender = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; if (!document.body.dataset.hold) render(); }); };
subscribe(rerender); onPin(rerender);
render();
