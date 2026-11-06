// 급락 항공: 출발·도착·날짜 검색, 정렬, 할인율 표시, 노선 알림, 바로 일정 만들기
import { esc, fmtDate } from '../../../src/util.js';
import { ic } from '../icons.js';
import { pin, setPin } from '../pinstore.js';
import { FLIGHTS, AIRPORTS, pctOff } from '../data.js';
import { subHeader, won, sample, toast } from '../ui.js';
import { newTripSheet } from './plan.js';

let q = { from: 'ICN', to: '', out: '', back: '', sort: 'price' };
const CUR = { KIX: 'JPY', NRT: 'JPY', FSZ: 'JPY', FUK: 'JPY', CTS: 'JPY', OKA: 'JPY', MYJ: 'JPY', DAD: 'VND', CXR: 'VND', BKK: 'THB', CEB: 'USD', TPE: 'TWD', HKG: 'USD', TAO: 'CNY' };

export function renderFlights(root) {
  const s = pin();
  const term = q.to.trim();
  let list = FLIGHTS.filter(f => (q.from === 'ALL' || f.from === q.from) && (!term || AIRPORTS[f.to].includes(term) || f.to.includes(term.toUpperCase())) && (!q.out || f.out >= q.out) && (!q.back || f.back <= q.back));
  list = list.sort(q.sort === 'price' ? (a, b) => a.now - b.now : q.sort === 'pct' ? (a, b) => pctOff(b) - pctOff(a) : (a, b) => a.out.localeCompare(b.out));
  const watching = s.flightAlerts.includes(term || '*');

  root.innerHTML = `${subHeader('급락 항공', `<button class="icon-btn ${watching ? 'acc' : ''}" id="bell" aria-label="노선 알림">${ic('bell')}</button>`)}
  <form class="search-box" id="f"><h2>항공편 검색</h2>
    <div class="sb-row"><label class="in">${ic('plane')}<select name="from" aria-label="출발지">${['ALL', 'ICN', 'GMP'].map(a => `<option value="${a}" ${a === q.from ? 'selected' : ''}>${a === 'ALL' ? '전체 출발' : `${AIRPORTS[a]} (${a})`}</option>`).join('')}</select></label>
      <span class="swap">${ic('swap')}</span><label class="in">${ic('pin')}<input name="to" value="${esc(q.to)}" placeholder="도착지" aria-label="도착지" list="dest"></label></div>
    <datalist id="dest">${[...new Set(FLIGHTS.map(f => AIRPORTS[f.to]))].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="sb-row"><label class="in">${ic('calendar')}<input type="date" name="out" value="${q.out}" aria-label="가는 날"></label><label class="in">${ic('calendar')}<input type="date" name="back" value="${q.back}" aria-label="오는 날"></label></div>
    <button class="btn primary block">검색하기</button></form>
  <div class="list-hd"><span>총 <b>${list.length}</b>개 ${sample()}</span><select id="sort" aria-label="정렬"><option value="price" ${q.sort === 'price' ? 'selected' : ''}>최저가순</option><option value="pct" ${q.sort === 'pct' ? 'selected' : ''}>할인율순</option><option value="date" ${q.sort === 'date' ? 'selected' : ''}>출발일순</option></select></div>
  <div class="fl-list">${list.map(f => `<article class="fl">
    <div class="fl-l"><div class="route"><div><b>${AIRPORTS[f.from]}</b><small>${f.from}</small></div><span class="line">${ic('plane')}</span><div class="r"><b>${AIRPORTS[f.to]}</b><small>${f.to}</small></div></div>
      <div class="when">${f.nights >= 5 ? '<span class="hot">특가</span>' : '<span class="dash">—</span>'} 왕복 ${f.nights}박 · ${fmtDate(f.out, { short: true })}~${fmtDate(f.back, { short: true })} · ${esc(f.carrier)}</div></div>
    <div class="fl-r"><s>${won(f.was).slice(1)}원</s><strong>${f.now.toLocaleString('ko-KR')}<small>원~</small></strong><em>${pctOff(f)}%↓</em><button class="mini acc" data-plan="${f.id}">일정 만들기</button></div></article>`).join('') || '<p class="muted pad center">조건에 맞는 항공권이 없어요. 날짜를 비우고 다시 찾아보세요.</p>'}</div>`;

  const f = root.querySelector('#f');
  f.onsubmit = e => { e.preventDefault(); q = Object.assign(q, { from: f.from.value, to: f.to.value, out: f.out.value, back: f.back.value }); renderFlights(root); };
  root.querySelector('#sort').onchange = e => { q.sort = e.target.value; renderFlights(root); };
  root.querySelector('#bell').onclick = async () => {
    const key = term || '*';
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
    setPin(p => { p.flightAlerts = watching ? p.flightAlerts.filter(x => x !== key) : [...p.flightAlerts, key]; });
    toast(watching ? '노선 알림을 껐어요' : `${term || '전체 노선'} 가격이 내려가면 알려드릴게요`);
  };
  root.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => {
    const fl = FLIGHTS.find(x => x.id === b.dataset.plan);
    newTripSheet({ title: `${AIRPORTS[fl.to]} 여행`, destination: AIRPORTS[fl.to], startDate: fl.out, endDate: fl.back, currency: CUR[fl.to] || 'KRW' });
  });
}
