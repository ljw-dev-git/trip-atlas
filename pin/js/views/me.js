// 내 정보: 이름, 지도 설정, 알림·가격 알림·백업 메뉴
import { esc } from '../../../src/util.js';
import { getState } from '../../../src/store.js';
import { ic } from '../icons.js';
import { pin, setPin } from '../pinstore.js';
import { subHeader, sheet, closeSheet, toast, formData } from '../ui.js';
import { SAMPLE_DEALS } from '../features.js';
import { GMAPS_KEY, getGmapsKey, getUserGmapsKey, usingSiteKey, resetMapEngine } from '../mapkit.js';

export function renderMembership(root) {
  const s = pin(); const m = s.member;
  const trips = getState().trips.length;
  root.innerHTML = `${subHeader('내 정보')}
  <section class="mcard"><div class="mc-top"><span class="logo">pintrip<i></i></span><span class="tier">TRAVELER</span></div>
    <b class="mc-name">${esc(m.name)}</b><small>여행 ${trips}개 · 저장한 핫플 ${s.contents.length}곳</small></section>
  <div class="stat3"><a href="#/plan"><b>${getState().trips.reduce((n, t) => n + t.expenses.filter(e => !e.planned).length, 0)}</b><small>지출 기록</small></a><a href="#/contents"><b>${s.contents.length}</b><small>저장 콘텐츠</small></a><a href="#/plan"><b>${trips}</b><small>여행</small></a></div>
  <div class="menu-list">
    <button id="name">${ic('users')} 이름 바꾸기 ${ic('chevron')}</button>
    <button id="gmap">${ic('map')} 지도 설정 <em class="mv">${getGmapsKey() ? '구글 지도' : 'OpenStreetMap'}</em>${ic('chevron')}</button>
    ${SAMPLE_DEALS ? `<a href="#/alerts">${ic('bell')} 알림함 ${ic('chevron')}</a>
    <a href="#/hotels">${ic('hotel')} 숙소 가격 알림 ${ic('chevron')}</a>` : ''}
    <a href="../#/settings">${ic('folder')} 백업·복원 (Trip Atlas) ${ic('chevron')}</a>
    <a href="../">${ic('map')} Trip Atlas 데스크톱 화면 ${ic('chevron')}</a>
  </div>
  <p class="foot-note">pintrip은 기기 안에만 데이터를 저장해요. 일정·지출은 Trip Atlas와 함께 쓰고, 백업 파일도 Trip Atlas 설정에서 만들 수 있어요.</p>`;
  root.querySelector('#name').onclick = () => {
    const sh = sheet(`<form class="form" id="f"><label>화면에 표시할 이름<input name="n" value="${esc(m.name)}" required></label><button class="btn primary block">저장</button></form>`, { title: '이름 바꾸기' });
    sh.querySelector('#f').onsubmit = e => { e.preventDefault(); setPin(p => { p.member.name = formData(e.target).n; }); closeSheet(); };
  };
  root.querySelector('#gmap').onclick = () => mapKeySheet(() => renderMembership(root));
}

// 구글 지도 API 키 (Trip Atlas와 같은 키를 함께 씀)
export function mapKeySheet(done) {
  const sh = sheet(`<form class="form" id="f">
    <p class="muted small">${usingSiteKey() ? '지금은 이 사이트에 들어 있는 기본 키로 구글 지도를 보여 주고 있어요(하루 지도 300회까지, 무료 범위). 내 키를 쓰려면 아래에 넣으세요.' : '구글 지도 JavaScript API 키를 넣으면 일정·내 주변 지도가 구글 지도로 바뀌어요. 비워 두면 OpenStreetMap을 써요.'} 키가 거부되거나 불러오지 못하면 자동으로 OpenStreetMap으로 돌아가요.</p>
    <label>API 키<input name="k" value="${esc(getUserGmapsKey())}" placeholder="${usingSiteKey() ? '비워 두면 기본 키 사용' : 'AIza…'}" autocomplete="off" spellcheck="false"></label>
    <p class="muted small">Google Cloud 콘솔 → API 및 서비스 → <b>Maps JavaScript API</b> 사용 설정 → 사용자 인증 정보에서 키를 만들고, 키 제한의 웹사이트에 <b>ljw-dev-git.github.io/*</b>를 넣으세요. 키는 이 기기에만 저장돼요.</p>
    <button class="btn primary block">저장</button></form>`, { title: '지도 설정' });
  sh.querySelector('#f').onsubmit = e => {
    e.preventDefault();
    const v = formData(e.target).k.trim();
    if (v && !/^AIza[0-9A-Za-z_-]{20,}$/.test(v)) { toast('구글 API 키 형식이 아니에요 (AIza로 시작)'); return; }
    if (v) localStorage.setItem(GMAPS_KEY, v); else localStorage.removeItem(GMAPS_KEY);
    resetMapEngine(); closeSheet();
    toast(v ? '구글 지도 키를 저장했어요' : getGmapsKey() ? '내 키를 지웠어요. 기본 키를 써요' : '키를 지웠어요. OpenStreetMap을 써요');
    if (window.google?.maps && !v) location.reload(); else done && done();
  };
}
