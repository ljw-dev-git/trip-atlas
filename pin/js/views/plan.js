// 일정: 여행 목록 → 여행 상세(지도 동선, Day 탭, 드래그 순서 변경, 이동시간, 장소별 비용) → 가계부·정산
import { getState, getTrip, updateTrip, addTrip, tripStatus, toHome } from '../../../src/store.js';
import { imgUrl } from '../../../src/images.js';
import { esc, uid, fmtDate, fmtRange, fmtMoney, todayISO, daysBetween, parseLatLng, gmapsPlaceUrl, gmapsRouteUrl, PLACE_CATEGORIES, EXPENSE_CATEGORIES, expenseCat, CURRENCIES, TRANSPORT_MODES } from '../../../src/util.js';
import { ic } from '../icons.js';
import { pin, setPin } from '../pinstore.js';
import { sheet, closeSheet, toast, won, avatar, subHeader, formData } from '../ui.js';
import { members, ensureMembers, addMember, settle, legEstimate, fmtMin } from '../money.js';
import { encodeShare, shareableTrip } from '../share.js';

const dayIdx = {}; // 여행별 선택된 Day
let map = null;

/* ---------- 여행 목록 ---------- */
export function renderPlanList(root) {
  const trips = getState().trips.slice().sort((a, b) => (a.startDate || '9').localeCompare(b.startDate || '9'));
  const groups = [['ongoing', '여행 중'], ['upcoming', '다가오는 여행'], ['draft', '날짜 미정'], ['done', '다녀온 여행']];
  root.innerHTML = `<div class="page-title"><h1>내 일정</h1><button class="btn primary sm" id="new-trip">${ic('plus')} 새 여행</button></div>
    ${trips.length ? groups.map(([k, label]) => { const list = trips.filter(t => tripStatus(t) === k); return list.length ? `<h3 class="grp">${label}</h3>${list.map(tripRow).join('')}` : ''; }).join('') : `<div class="empty pad"><strong>아직 여행이 없어요</strong>새 여행을 만들고 장소를 순서대로 담아 보세요.</div>`}`;
  root.querySelector('#new-trip').onclick = () => newTripSheet();
}
function tripRow(t) {
  const dd = t.startDate ? daysBetween(todayISO(), t.startDate) : null;
  const st = tripStatus(t);
  return `<a class="card trip-row" href="#/plan/${encodeURIComponent(t.id)}"><span class="tc-img" style="${t.coverImage ? `background-image:url('${esc(imgUrl(t.coverImage, 'thumb'))}')` : ''}">${t.coverImage ? '' : esc(t.emoji || '✈')}</span>
    <div class="tc-body"><b>${esc(t.title)}</b><small>${esc(fmtRange(t.startDate, t.endDate))}</small><small>${esc(t.destination || '')}</small></div>
    <span class="badge ${st}">${st === 'upcoming' && dd != null ? `D-${dd}` : st === 'ongoing' ? '여행 중' : st === 'done' ? '완료' : '미정'}</span></a>`;
}

export function newTripSheet(pre = {}) {
  const sh = sheet(`<form class="form" id="f">
    <label>여행 이름<input name="title" required value="${esc(pre.title || '')}" placeholder="예: 오사카 먹방 여행"></label>
    <label>여행지<input name="destination" value="${esc(pre.destination || '')}" placeholder="예: 오사카, 일본"></label>
    <div class="two"><label>가는 날<input type="date" name="startDate" value="${esc(pre.startDate || '')}"></label><label>오는 날<input type="date" name="endDate" value="${esc(pre.endDate || '')}"></label></div>
    <div class="two"><label>현지 통화<select name="currency">${Object.keys(CURRENCIES).map(c => `<option ${c === (pre.currency || 'JPY') ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>인원<input type="number" name="travelers" min="1" value="${pre.travelers || 2}"></label></div>
    <label>예산 (원)<input type="number" name="budget" min="0" step="10000" inputmode="numeric" placeholder="예: 1000000"></label>
    <button class="btn primary block">만들기</button></form>`, { title: '새 여행' });
  sh.querySelector('#f').onsubmit = e => {
    e.preventDefault(); const v = formData(e.target);
    if (v.endDate && v.startDate && v.endDate < v.startDate) return toast('오는 날이 가는 날보다 빠를 수 없어요');
    const t = addTrip({ title: v.title, destination: v.destination, startDate: v.startDate, endDate: v.endDate || v.startDate, currency: v.currency, travelers: +v.travelers || 1, budget: { amount: +v.budget || 0, currency: 'KRW' }, emoji: '✈' });
    closeSheet(); location.hash = `#/plan/${encodeURIComponent(t.id)}`;
  };
}

/* ---------- 여행 상세(일정) ---------- */
export function renderPlan(root, id) {
  const trip = getTrip(id);
  if (!trip) { root.innerHTML = `${subHeader('일정')}<div class="empty pad"><strong>여행을 찾을 수 없어요</strong><a class="btn" href="#/plan">목록으로</a></div>`; return; }
  if (pin().tripId !== id) setPin(p => { p.tripId = id; }, { silent: true });
  const ms = ensureMembers(trip);
  const di = Math.min(dayIdx[id] ?? defaultDay(trip), Math.max(0, trip.days.length - 1));
  const day = trip.days[di];
  const P = pid => trip.places.find(p => p.id === pid) || {};
  const stops = day ? day.stops : [];
  const pts = stops.map(s => P(s.placeId)).filter(p => p.lat != null);
  const dayCost = day ? trip.expenses.filter(e => !e.planned && e.date === day.date).reduce((s, e) => s + (toHome(trip, e.amount, e.currency) || 0), 0) : 0;
  let total = 0;

  root.innerHTML = `${subHeader(trip.title, `<button class="icon-btn" id="share" aria-label="일정 공유">${ic('share')}</button>`)}
  <div class="plan-hd">
    <div><small>${esc(fmtRange(trip.startDate, trip.endDate))}</small><div class="members">${ms.map((m, i) => avatar(m.name, i)).join('')}<button class="av add" id="invite" aria-label="동행 초대">${ic('plus')}</button></div></div>
    <div class="seg"><a class="on" href="#/plan/${encodeURIComponent(id)}">일정</a><a href="#/plan/${encodeURIComponent(id)}/money">가계부·정산</a></div>
  </div>
  <div class="plan-map" id="pmap">${pts.length ? '' : '<p>좌표가 있는 장소를 넣으면 동선이 지도에 표시돼요</p>'}</div>
  <div class="days" id="days">${trip.days.map((d, i) => `<button class="${i === di ? 'on' : ''}" data-i="${i}"><b>Day ${i + 1}</b><small>${fmtDate(d.date, { short: true })}</small></button>`).join('') || '<span class="muted">여행 날짜를 정하면 Day 탭이 생겨요</span>'}</div>
  ${day ? `<div class="day-hd"><div><b>${esc(day.title || `Day ${di + 1}`)}</b>${day.note ? `<p>${esc(day.note)}</p>` : ''}</div>
    <div class="day-meta">${stops.length}곳 · 지출 ${won(dayCost)}${pts.length > 1 ? ` · <a href="${esc(gmapsRouteUrl(pts, 'transit'))}" target="_blank" rel="noopener">구글 지도 경로 ${ic('external')}</a>` : ''}</div></div>
  <ol class="stops" id="stops">${stops.map((s, i) => {
    const p = P(s.placeId); const prev = i ? P(stops[i - 1].placeId) : null;
    const leg = prev ? legEstimate(prev, p, s.mode) : null; if (leg) total += leg.min;
    const cost = trip.expenses.filter(e => e.placeId && e.placeId === s.placeId && e.date === day.date && !e.planned);
    const costSum = cost.reduce((a, e) => a + (toHome(trip, e.amount, e.currency) || 0), 0);
    const modeIc = { walk: 'walk', car: 'car', taxi: 'car', bus: 'car', transit: 'train' }[s.mode] || 'walk';
    return `${i ? `<li class="leg">${ic(modeIc)}<span>${esc(TRANSPORT_MODES[s.mode] || '이동')}${leg ? ` · 약 ${fmtMin(leg.min)} · ${leg.km < 1 ? Math.round(leg.km * 1000) + 'm' : leg.km.toFixed(1) + 'km'}` : s.transport ? ` · ${esc(s.transport)}` : ''}</span></li>` : ''}
    <li class="stop" data-id="${s.id}">
      <span class="num">${i + 1}</span>
      <div class="sb"><div class="st"><b>${esc(s.title || p.name || '장소')}</b>${p.category ? `<span class="chip sm">${esc(PLACE_CATEGORIES[p.category]?.label || '')}</span>` : ''}</div>
        ${s.time || s.memo ? `<p>${s.time ? `<em>${esc(s.time)}</em> ` : ''}${esc(s.memo || '')}</p>` : ''}
        <div class="sa"><button class="mini" data-cost="${s.id}">${ic('wallet')} ${costSum ? won(costSum) : '비용 추가'}</button>${p.name ? `<a class="mini" href="${esc(gmapsPlaceUrl(p))}" target="_blank" rel="noopener">${ic('map')} 지도</a>` : ''}<button class="mini" data-edit="${s.id}">편집</button></div></div>
      <button class="grip" aria-label="순서 바꾸기 (끌어서 이동)">${ic('grip')}</button></li>`;
  }).join('')}</ol>
  ${stops.length > 1 && total ? `<p class="muted small center">이동 시간 합계 약 ${fmtMin(total)} (직선거리 기반 어림값)</p>` : ''}
  <button class="btn block dashed" id="add-stop">${ic('plus')} 장소 추가</button>` : ''}`;

  // 지도
  if (map) { map.remove(); map = null; }
  if (pts.length && window.L) {
    map = L.map('pmap', { zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const ll = pts.map(p => [p.lat, p.lng]);
    stops.forEach((s, i) => { const p = P(s.placeId); if (p.lat == null) return; L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'num-pin', html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map).bindTooltip(esc(p.name)); });
    L.polyline(ll, { color: '#5b5ceb', weight: 3, dashArray: '6 6' }).addTo(map);
    if (ll.length === 1) map.setView(ll[0], 14); else map.fitBounds(ll, { padding: [28, 28] });
  }

  root.querySelectorAll('#days [data-i]').forEach(b => b.onclick = () => { dayIdx[id] = +b.dataset.i; renderPlan(root, id); });
  root.querySelector('#invite').onclick = () => inviteSheet(trip);
  root.querySelector('#share').onclick = () => shareTrip(trip);
  const add = root.querySelector('#add-stop'); if (add) add.onclick = () => addStopSheet(trip, di);
  root.querySelectorAll('[data-cost]').forEach(b => b.onclick = () => { const s = stops.find(x => x.id === b.dataset.cost); expenseSheet(trip, { placeId: s.placeId, date: day.date, note: s.title || P(s.placeId).name || '' }); });
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editStopSheet(trip, di, b.dataset.edit));
  if (day) dragSort(root.querySelector('#stops'), order => updateTrip(id, t => { const d = t.days[di]; d.stops = order.map(x => d.stops.find(s => s.id === x)).filter(Boolean); }));
}

function defaultDay(trip) {
  const i = trip.days.findIndex(d => d.date === todayISO());
  return i >= 0 ? i : 0;
}

// 손잡이를 끌어 순서 바꾸기(마우스·터치 공용)
function dragSort(list, commit) {
  list.querySelectorAll('.grip').forEach(g => g.addEventListener('pointerdown', e => {
    // DOM 안에서 항목을 옮기면 포인터 캡처가 풀리므로 이벤트는 window에서 받는다
    const item = g.closest('.stop'); e.preventDefault();
    document.body.dataset.hold = '1'; item.classList.add('dragging'); list.classList.add('sorting');
    const move = ev => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.stop');
      if (!over || over === item) return;
      const r = over.getBoundingClientRect();
      over.parentNode.insertBefore(item, ev.clientY < r.top + r.height / 2 ? over : over.nextSibling);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      delete document.body.dataset.hold; item.classList.remove('dragging'); list.classList.remove('sorting');
      commit([...list.querySelectorAll('.stop')].map(x => x.dataset.id));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }));
}

function addStopSheet(trip, di) {
  const used = new Set(trip.days[di].stops.map(s => s.placeId));
  const mine = trip.places.filter(p => !used.has(p.id));
  const saved = pin().contents.filter(c => c.placeName);
  const sh = sheet(`<div class="seg w" id="tab"><button class="on" data-t="a">내 장소 ${mine.length}</button><button data-t="b">저장한 핫플 ${saved.length}</button><button data-t="c">직접 입력</button></div>
    <div data-p="a" class="pick">${mine.map(p => `<button class="pick-row" data-pid="${p.id}"><b>${esc(p.name)}</b><small>${esc(PLACE_CATEGORIES[p.category]?.label || '')}${p.address ? ' · ' + esc(p.address) : ''}</small>${ic('plus')}</button>`).join('') || '<p class="muted pad">이 여행의 장소를 모두 넣었어요</p>'}</div>
    <div data-p="b" class="pick" hidden>${saved.map(c => `<button class="pick-row" data-cid="${c.id}"><b>${esc(c.placeName)}</b><small>${esc(c.title)}</small>${ic('plus')}</button>`).join('') || '<p class="muted pad">콘텐츠 탭에서 SNS 핫플을 저장하면 여기서 바로 넣을 수 있어요</p>'}</div>
    <form data-p="c" class="form" hidden id="nf"><label>장소 이름<input name="name" required placeholder="예: 구로몬 시장"></label>
      <label>구글 지도 링크 또는 좌표 (선택)<input name="loc" placeholder="https://www.google.com/maps/... 또는 34.66, 135.50"></label>
      <div class="two"><label>분류<select name="category">${Object.entries(PLACE_CATEGORIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label><label>시간<input name="time" placeholder="예: 10:30"></label></div>
      <button class="btn primary block">추가</button></form>`, { title: `Day ${di + 1}에 장소 추가` });
  sh.querySelector('#tab').onclick = e => { const b = e.target.closest('button'); if (!b) return; sh.querySelectorAll('#tab button').forEach(x => x.classList.toggle('on', x === b)); sh.querySelectorAll('[data-p]').forEach(p => p.hidden = p.dataset.p !== b.dataset.t); };
  const push = (placeId, extra = {}) => updateTrip(trip.id, t => t.days[di].stops.push(Object.assign({ id: uid(), time: '', placeId, title: '', memo: '', transport: '', mode: 'walk', status: 'plan' }, extra)));
  sh.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => { push(b.dataset.pid); closeSheet(); toast('일정에 추가했어요'); });
  sh.querySelectorAll('[data-cid]').forEach(b => b.onclick = () => { const c = pin().contents.find(x => x.id === b.dataset.cid); addPlaceFromContent(trip, c, di); closeSheet(); toast('핫플을 일정에 추가했어요'); });
  sh.querySelector('#nf').onsubmit = e => {
    e.preventDefault(); const v = formData(e.target); const ll = parseLatLng(v.loc);
    const pid = uid();
    updateTrip(trip.id, t => { t.places.push({ id: pid, name: v.name, category: v.category, lat: ll?.lat ?? null, lng: ll?.lng ?? null, url: /^https?:/.test(v.loc) ? v.loc : '' }); });
    push(pid, { time: v.time }); closeSheet(); toast(ll ? '장소를 추가했어요' : '장소를 추가했어요 (좌표 없음: 지도에는 표시되지 않아요)');
  };
}

export function addPlaceFromContent(trip, c, di) {
  let pid = trip.places.find(p => p.name === c.placeName)?.id;
  updateTrip(trip.id, t => {
    if (!pid) { pid = uid(); t.places.push({ id: pid, name: c.placeName, category: c.category === '카페' ? 'cafe' : c.category === '맛집' ? 'food' : c.category === '쇼핑' ? 'shop' : 'sight', lat: c.lat ?? null, lng: c.lng ?? null, url: c.url || '', memo: c.title }); }
    const day = t.days[Math.max(0, Math.min(di, t.days.length - 1))];
    if (day) day.stops.push({ id: uid(), time: '', placeId: pid, title: '', memo: c.title, transport: '', mode: 'walk', status: 'plan' });
  });
}

function editStopSheet(trip, di, sid) {
  const s = trip.days[di].stops.find(x => x.id === sid); if (!s) return;
  const p = trip.places.find(x => x.id === s.placeId) || {};
  const sh = sheet(`<form class="form" id="f"><label>표시 이름<input name="title" value="${esc(s.title)}" placeholder="${esc(p.name || '')}"></label>
    <div class="two"><label>시간<input name="time" value="${esc(s.time)}"></label><label>여기까지 이동<select name="mode">${Object.entries(TRANSPORT_MODES).map(([k, v]) => `<option value="${k}" ${k === s.mode ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <label>메모<textarea name="memo" rows="3">${esc(s.memo)}</textarea></label>
    <label>다른 날로 옮기기<select name="day">${trip.days.map((d, i) => `<option value="${i}" ${i === di ? 'selected' : ''}>Day ${i + 1} · ${fmtDate(d.date, { short: true })}</option>`).join('')}</select></label>
    <div class="two"><button type="button" class="btn danger" id="del">${ic('trash')} 일정에서 빼기</button><button class="btn primary">저장</button></div></form>`, { title: '일정 편집' });
  sh.querySelector('#f').onsubmit = e => {
    e.preventDefault(); const v = formData(e.target);
    updateTrip(trip.id, t => { const from = t.days[di]; const st = from.stops.find(x => x.id === sid); Object.assign(st, { title: v.title, time: v.time, mode: v.mode, memo: v.memo }); const to = +v.day; if (to !== di) { from.stops = from.stops.filter(x => x.id !== sid); t.days[to].stops.push(st); } });
    closeSheet();
  };
  sh.querySelector('#del').onclick = () => { updateTrip(trip.id, t => { t.days[di].stops = t.days[di].stops.filter(x => x.id !== sid); }); closeSheet(); toast('일정에서 뺐어요 (장소 목록에는 남아 있어요)'); };
}

function inviteSheet(trip) {
  const ms = members(trip);
  const sh = sheet(`<div class="list">${ms.map((m, i) => `<div class="mem-row">${avatar(m.name, i)}<b>${esc(m.name)}</b>${m.id === 'me' ? '<small>나</small>' : ''}</div>`).join('')}</div>
    <form class="form row" id="f"><input name="name" placeholder="동행 이름" required><button class="btn">추가</button></form>
    <p class="muted small">함께 계획하려면 아래 링크를 보내 주세요. 받은 사람의 앱에 이 일정이 복사됩니다(서버 없이 링크에 담아 전달).</p>
    <button class="btn primary block" id="link">${ic('share')} 일정 공유 링크 보내기</button>`, { title: '동행·초대' });
  sh.querySelector('#f').onsubmit = e => { e.preventDefault(); const n = formData(e.target).name; if (!n) return; addMember(getTrip(trip.id), n); closeSheet(); inviteSheet(getTrip(trip.id)); };
  sh.querySelector('#link').onclick = () => shareTrip(getTrip(trip.id));
}

async function shareTrip(trip) {
  const data = await encodeShare(shareableTrip(trip));
  const url = `${location.origin}${location.pathname}#/join/${data}`;
  try {
    if (navigator.share) { await navigator.share({ title: trip.title, text: `${trip.title} 일정을 함께 봐요`, url }); return; }
    await navigator.clipboard.writeText(url); toast(`공유 링크를 복사했어요 (${Math.round(url.length / 1024)}KB)`);
  } catch (e) { if (e.name !== 'AbortError') sheet(`<textarea class="share-url" rows="5" readonly>${esc(url)}</textarea>`, { title: '공유 링크' }); }
}

/* ---------- 지출 입력(장소별·빠른 입력 공용) ---------- */
export function expenseSheet(trip, pre = {}, existing = null) {
  const ms = members(trip); const e0 = existing || {};
  const cur = e0.currency || pre.currency || trip.currency;
  const split = new Set(e0.split && e0.split.length ? e0.split : ms.map(m => m.id));
  const cat = e0.category || pre.category || 'food';
  const curs = [trip.currency, trip.homeCurrency].filter((c, i, a) => a.indexOf(c) === i);
  const sh = sheet(`<form class="form" id="f">
    <div class="amount-in"><input name="amount" type="number" step="any" min="0" inputmode="decimal" placeholder="0" required value="${e0.amount ?? ''}"><select name="currency">${curs.map(c => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <p class="conv muted small" id="conv"></p>
    <div class="chips" id="cats">${EXPENSE_CATEGORIES.map(c => `<button type="button" class="chip ${c.id === cat ? 'on' : ''}" data-c="${c.id}">${c.label}</button>`).join('')}</div><input type="hidden" name="category" value="${cat}">
    <label>내용<input name="note" value="${esc(e0.note ?? pre.note ?? '')}" placeholder="예: 라멘 2그릇"></label>
    <div class="two"><label>결제한 사람<select name="payer">${ms.map(m => `<option value="${m.id}" ${m.id === (e0.payer || ms[0].id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label>날짜<select name="date">${trip.days.map((d, i) => `<option value="${d.date}" ${d.date === (e0.date || pre.date) ? 'selected' : ''}>Day ${i + 1} · ${fmtDate(d.date, { short: true })}</option>`).join('')}</select></label></div>
    <fieldset class="split"><legend>나눌 사람 (N분의 1)</legend>${ms.map((m, i) => `<label class="ck">${avatar(m.name, i)}<input type="checkbox" name="split" value="${m.id}" ${split.has(m.id) ? 'checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</fieldset>
    <div class="two">${existing ? `<button type="button" class="btn danger" id="del">${ic('trash')} 삭제</button>` : '<span></span>'}<button class="btn primary">${existing ? '저장' : '기록하기'}</button></div></form>`, { title: existing ? '지출 수정' : '비용 추가' });
  const f = sh.querySelector('#f');
  const showConv = () => { const v = toHome(trip, +f.amount.value || 0, f.currency.value); sh.querySelector('#conv').textContent = f.currency.value === trip.homeCurrency ? '' : v == null ? '환율이 없어요. 가계부에서 오늘 환율을 가져오세요.' : `≈ ${fmtMoney(v, trip.homeCurrency)} (자동 환산)`; };
  f.amount.oninput = showConv; f.currency.onchange = showConv; showConv();
  sh.querySelector('#cats').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; sh.querySelectorAll('#cats .chip').forEach(x => x.classList.toggle('on', x === b)); f.category.value = b.dataset.c; };
  f.onsubmit = e => {
    e.preventDefault();
    const amount = Number(f.amount.value); if (!amount) return toast('금액을 입력하세요');
    const sp = [...f.querySelectorAll('[name=split]:checked')].map(x => x.value);
    if (!sp.length) return toast('나눌 사람을 한 명 이상 고르세요');
    const rec = { amount, currency: f.currency.value, category: f.category.value, note: f.note.value.trim(), payer: f.payer.value, date: f.date.value || trip.startDate, split: sp.length === ms.length ? [] : sp, method: e0.method || 'card', planned: false, placeId: e0.placeId ?? pre.placeId ?? '' };
    updateTrip(trip.id, t => { if (existing) Object.assign(t.expenses.find(x => x.id === existing.id), rec); else t.expenses.push(Object.assign({ id: uid() }, rec)); });
    closeSheet(); toast(`${fmtMoney(amount, rec.currency)} ${existing ? '수정' : '기록'}했어요`);
  };
  const del = sh.querySelector('#del'); if (del) del.onclick = () => { updateTrip(trip.id, t => { t.expenses = t.expenses.filter(x => x.id !== existing.id); }); closeSheet(); toast('삭제했어요'); };
}

/* ---------- 가계부·정산 ---------- */
export function renderMoney(root, id) {
  const trip = getTrip(id);
  if (!trip) { location.hash = '#/plan'; return; }
  const ms = ensureMembers(trip); const H = trip.homeCurrency, C = trip.currency;
  const { total, rows, transfers, skipped } = settle(trip);
  const budget = trip.budget.amount || 0; const left = budget - total; const pct = budget ? Math.min(100, Math.round(total / budget * 100)) : 0;
  const rate = C === H ? 1 : trip.fx[C];
  const list = trip.expenses.filter(e => !e.planned).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const mName = pid => (ms.find(m => m.id === pid) || ms[0]).name;
  const mIdx = pid => Math.max(0, ms.findIndex(m => m.id === pid));
  const byCat = EXPENSE_CATEGORIES.map(c => ({ c, v: list.filter(e => e.category === c.id).reduce((s, e) => s + (toHome(trip, e.amount, e.currency) || 0), 0) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);

  root.innerHTML = `${subHeader(trip.title)}
  <div class="plan-hd"><div><small>${esc(fmtRange(trip.startDate, trip.endDate))}</small><div class="members">${ms.map((m, i) => avatar(m.name, i)).join('')}</div></div>
    <div class="seg"><a href="#/plan/${encodeURIComponent(id)}">일정</a><a class="on" href="#/plan/${encodeURIComponent(id)}/money">가계부·정산</a></div></div>
  <section class="card budget">
    <div class="b-top"><span>총 지출</span><button class="link" id="set-budget">${budget ? `예산 ${won(budget)}` : '예산 설정'}</button></div>
    <strong class="b-amt">${won(total)}</strong>
    ${budget ? `<div class="meter"><i class="${left < 0 ? 'over' : ''}" style="width:${pct}%"></i></div><div class="b-left ${left < 0 ? 'over' : ''}">${left < 0 ? `예산 ${won(-left)} 초과` : `남은 예산 ${won(left)}`} · ${pct}%</div>` : '<div class="b-left">예산을 정하면 실시간 잔액을 보여드려요</div>'}
    <div class="fx-line">${C === H ? '원화 여행' : rate ? `100 ${C} = ${fmtMoney(rate * 100, H)}` : '<b class="neg">환율 미설정</b>'}${C !== H ? ` <button class="link" id="fx">오늘 환율 가져오기</button>` : ''}</div>
    ${skipped ? `<p class="neg small">환율이 없는 지출 ${skipped}건은 합계에서 빠졌어요</p>` : ''}
  </section>
  <button class="btn primary block" id="add-exp">${ic('plus')} 지출 기록</button>

  <section class="sec"><div class="sec-hd"><h2>N분의 1 정산</h2><span class="muted small">${ms.length}명</span></div>
    <div class="card settle">
      ${rows.map((r, i) => `<div class="set-row">${avatar(r.m.name, i)}<b>${esc(r.m.name)}</b><span class="muted small">낸 돈 ${won(r.paid)} · 부담 ${won(r.owe)}</span><em class="${r.net > 5 ? 'pos' : r.net < -5 ? 'neg' : ''}">${r.net > 5 ? '+' + won(r.net) : r.net < -5 ? '-' + won(-r.net) : '정산 끝'}</em></div>`).join('')}
      <div class="transfers">${transfers.length ? transfers.map(t => `<div class="tr">${avatar(t.from.name, mIdx(t.from.id))}<span><b>${esc(t.from.name)}</b> → <b>${esc(t.to.name)}</b></span><strong>${won(t.amount)}</strong></div>`).join('') + `<button class="btn sm block" id="copy-settle">정산 내용 복사</button>` : `<p class="muted small center">${ms.length < 2 ? '동행을 추가하면 누가 누구에게 보낼지 계산해 드려요' : '보낼 돈이 없어요'}</p>`}</div>
    </div></section>

  ${byCat.length ? `<section class="sec"><div class="sec-hd"><h2>분류별</h2></div><div class="card catbars">${byCat.map(x => `<div class="cb"><span>${x.c.label}</span><i style="--w:${Math.round(x.v / byCat[0].v * 100)}%"></i><b>${won(x.v)}</b></div>`).join('')}</div></section>` : ''}

  <section class="sec"><div class="sec-hd"><h2>지출 내역</h2><span class="muted small">${list.length}건</span></div>
    <div class="exp-list">${list.map(e => { const h = toHome(trip, e.amount, e.currency); const p = trip.places.find(x => x.id === e.placeId); return `<button class="exp" data-id="${e.id}">${avatar(mName(e.payer), mIdx(e.payer))}<div><b>${esc(e.note || expenseCat(e.category).label)}</b><small>${fmtDate(e.date, { short: true })} · ${expenseCat(e.category).label}${p ? ' · ' + esc(p.name) : ''} · ${esc(mName(e.payer))} 결제${e.split && e.split.length ? ` · ${e.split.length}명` : ''}</small></div><span class="amt">${fmtMoney(e.amount, e.currency)}${e.currency !== H ? `<small>${h == null ? '환율 없음' : '≈ ' + won(h)}</small>` : ''}</span></button>`; }).join('') || '<p class="muted pad center">아직 지출이 없어요. 일정의 장소에서 바로 비용을 넣을 수도 있어요.</p>'}</div></section>`;

  root.querySelector('#add-exp').onclick = () => expenseSheet(trip, { date: trip.days.some(d => d.date === todayISO()) ? todayISO() : trip.startDate });
  root.querySelectorAll('.exp').forEach(b => b.onclick = () => expenseSheet(trip, {}, trip.expenses.find(x => x.id === b.dataset.id)));
  root.querySelector('#set-budget').onclick = () => {
    const sh = sheet(`<form class="form" id="f"><label>여행 예산 (원)<input name="b" type="number" min="0" step="10000" inputmode="numeric" value="${budget || ''}"></label><button class="btn primary block">저장</button></form>`, { title: '예산 설정' });
    sh.querySelector('#f').onsubmit = e => { e.preventDefault(); updateTrip(id, t => { t.budget = { amount: +formData(e.target).b || 0, currency: H }; }); closeSheet(); };
  };
  const fx = root.querySelector('#fx');
  if (fx) fx.onclick = async () => {
    fx.textContent = '가져오는 중…';
    try { const j = await (await fetch(`https://api.frankfurter.app/latest?from=${C}&to=${H}`)).json(); const v = j.rates?.[H]; if (!v) throw 0; updateTrip(id, t => { t.fx[C] = v; t.fxNote = `ECB 기준 ${j.date} · 100 ${C} = ${fmtMoney(v * 100, H, { plain: true })} ${H} (frankfurter.app)`; }); toast('오늘 환율을 적용했어요'); }
    catch { toast('환율을 가져오지 못했어요'); fx.textContent = '오늘 환율 가져오기'; }
  };
  const cp = root.querySelector('#copy-settle');
  if (cp) cp.onclick = async () => {
    const txt = `[${trip.title}] 정산\n총 ${won(total)} / ${ms.length}명\n` + transfers.map(t => `${t.from.name} → ${t.to.name} ${won(t.amount)}`).join('\n');
    try { await navigator.clipboard.writeText(txt); toast('정산 내용을 복사했어요'); } catch { sheet(`<textarea class="share-url" rows="6" readonly>${esc(txt)}</textarea>`, { title: '정산 내용' }); }
  };
}
