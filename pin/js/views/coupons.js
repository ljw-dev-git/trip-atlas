// 쇼핑 쿠폰 + 멤버십 카드
import { esc } from '../../../src/util.js';
import { getState } from '../../../src/store.js';
import { ic } from '../icons.js';
import { pin, setPin } from '../pinstore.js';
import { COUPONS, COUPON_TABS } from '../data.js';
import { subHeader, sheet, closeSheet, toast, sample, formData } from '../ui.js';
import { GMAPS_KEY, getGmapsKey, getUserGmapsKey, usingSiteKey, resetMapEngine } from '../mapkit.js';

let tab = 'all', term = '';

export function renderCoupons(root) {
  const s = pin();
  const t = term.trim();
  const list = COUPONS.filter(c => (tab === 'all' || (tab === 'mine' ? s.myCoupons.includes(c.id) : c.tab === tab)) && (!t || [c.brand, c.cat, COUPON_TABS.find(x => x.id === c.tab)?.label].join(' ').includes(t)))
    .sort((a, b) => s.favCoupons.includes(b.id) - s.favCoupons.includes(a.id));
  root.innerHTML = `${subHeader('쇼핑 쿠폰')}
  <label class="search">${ic('search')}<input id="q" value="${esc(term)}" placeholder="쿠폰명·브랜드·지역명으로 검색"></label>
  <div class="ctabs">${COUPON_TABS.map(x => `<button class="${x.id === tab ? 'on' : ''}" data-t="${x.id}">${x.label}${x.id === 'mine' && s.myCoupons.length ? ` ${s.myCoupons.length}` : ''}</button>`).join('')}</div>
  <p class="muted small" style="margin:4px 4px 10px">${sample('샘플 제휴처')} 가상의 브랜드로 만든 예시 쿠폰이에요.</p>
  <div class="cp-list">${list.map(c => { const fav = s.favCoupons.includes(c.id), mine = s.myCoupons.includes(c.id); return `<article class="cp">
      <div class="cp-l"><span class="logo-mark lg" style="--c:${c.color}">${esc(c.mark)}</span><div><b>${esc(c.brand)}</b><small>${esc(c.cat)}</small></div>
        <div class="cp-act"><button class="heart ${fav ? 'on' : ''}" data-fav="${c.id}" aria-label="찜">${ic('heart')}</button><button class="get ${mine ? 'on' : ''}" data-get="${c.id}" aria-label="${mine ? '쿠폰 사용' : '쿠폰 받기'}">${ic(mine ? 'check' : 'ticket')}</button></div></div>
      <button class="cp-r" data-use="${c.id}"><small>최대</small><strong>${c.max}%</strong><small>할인</small></button></article>`; }).join('') || `<p class="muted pad center">${tab === 'mine' ? '받은 쿠폰이 없어요' : '검색 결과가 없어요'}</p>`}</div>`;

  const qi = root.querySelector('#q');
  qi.oninput = () => { term = qi.value; const pos = qi.selectionStart; renderCoupons(root); const n = root.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); };
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; renderCoupons(root); });
  root.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => setPin(p => { const id = b.dataset.fav; p.favCoupons = p.favCoupons.includes(id) ? p.favCoupons.filter(x => x !== id) : [...p.favCoupons, id]; }));
  root.querySelectorAll('[data-get]').forEach(b => b.onclick = () => { const id = b.dataset.get; if (pin().myCoupons.includes(id)) return useCoupon(id); setPin(p => p.myCoupons.push(id)); toast('쿠폰을 받았어요. 내 쿠폰에서 볼 수 있어요'); });
  root.querySelectorAll('[data-use]').forEach(b => b.onclick = () => useCoupon(b.dataset.use));
}

function useCoupon(id) {
  const c = COUPONS.find(x => x.id === id); const m = pin().member;
  const mine = pin().myCoupons.includes(id);
  const sh = sheet(`<div class="use-cp"><span class="logo-mark lg" style="--c:${c.color}">${esc(c.mark)}</span><h3>${esc(c.brand)}</h3><p class="big">최대 ${c.max}% 할인</p>
    <div class="code">${code(m.no)}</div><p class="muted small">${esc(m.name)} · ${esc(m.no)}</p>
    <p class="muted small">결제 전에 이 화면을 직원에게 보여주세요. 제휴처마다 할인 조건이 달라요. ${sample()}</p>
    ${mine ? '' : '<button class="btn primary block" id="get">쿠폰 받기</button>'}</div>`, { title: '쿠폰 사용' });
  const g = sh.querySelector('#get'); if (g) g.onclick = () => { setPin(p => p.myCoupons.push(id)); closeSheet(); toast('쿠폰을 받았어요'); };
}

// 회원번호로 만든 바코드 모양(표시용, 실제 스캔 규격 아님)
function code(no) {
  let bars = ''; let x = 0;
  for (const ch of (no + no).replace(/\D/g, '')) { const n = +ch; bars += `<rect x="${x}" y="0" width="${1 + n % 3}" height="48"/>`; x += 2 + n % 4; }
  return `<svg viewBox="0 0 ${x} 48" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}

export function renderMembership(root) {
  const s = pin(); const m = s.member;
  const trips = getState().trips.length;
  root.innerHTML = `${subHeader('멤버십')}
  <section class="mcard"><div class="mc-top"><span class="logo">pintrip<i></i></span><span class="tier">TRAVEL MEMBER</span></div>
    <b class="mc-name">${esc(m.name)}</b><span class="mc-no">${esc(m.no)}</span><div class="code light">${code(m.no)}</div>
    <small>제휴처에서 이 화면을 보여주면 할인·추가 혜택을 받을 수 있어요</small></section>
  <div class="stat3"><a href="#/coupons"><b>${s.myCoupons.length}</b><small>내 쿠폰</small></a><a href="#/contents"><b>${s.contents.length}</b><small>저장 콘텐츠</small></a><a href="#/plan"><b>${trips}</b><small>여행</small></a></div>
  <div class="menu-list">
    <button id="name">${ic('users')} 이름 바꾸기 ${ic('chevron')}</button>
    <button id="gmap">${ic('map')} 지도 설정 <em class="mv">${getGmapsKey() ? '구글 지도' : 'OpenStreetMap'}</em>${ic('chevron')}</button>
    <a href="#/alerts">${ic('bell')} 알림함 ${ic('chevron')}</a>
    <a href="#/hotels">${ic('hotel')} 숙소 가격 알림 ${ic('chevron')}</a>
    <a href="../#/settings">${ic('folder')} 백업·복원 (Trip Atlas) ${ic('chevron')}</a>
    <a href="../">${ic('map')} Trip Atlas 데스크톱 화면 ${ic('chevron')}</a>
  </div>
  <p class="foot-note">pintrip은 기기 안에만 데이터를 저장해요. 일정·지출은 Trip Atlas와 함께 쓰고, 백업 파일도 Trip Atlas 설정에서 만들 수 있어요.</p>`;
  root.querySelector('#name').onclick = () => {
    const sh = sheet(`<form class="form" id="f"><label>멤버십에 표시할 이름<input name="n" value="${esc(m.name)}" required></label><button class="btn primary block">저장</button></form>`, { title: '이름 바꾸기' });
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
