// 입력 폼 모달: 여행 / 장소 / 일정 항목 / 지출
import { esc, uid, todayISO, parseLatLng, isGoogleShortLink, CURRENCIES, PLACE_CATEGORIES, EXPENSE_CATEGORIES, PAY_METHODS, TRANSPORT_MODES, fmtDate, debounce } from './util.js';
import { openModal, closeModal, toast, formValues, option, confirmDialog } from './ui.js';
import { addTrip, updateTrip, deleteTrip, syncDays } from './store.js';
import { navigate } from './app.js';

const COVERS = ['sea', 'sunset', 'forest', 'night', 'sand', 'rose', 'slate'];

export function tripForm(trip) {
  const isNew = !trip;
  const t = trip || { title: '', destination: '', emoji: '✈', startDate: todayISO(), endDate: '', travelers: 2, currency: 'JPY', homeCurrency: 'KRW', budget: { amount: 0, currency: 'KRW' }, cover: 'sea', summary: '', fx: {} };
  const m = openModal(`
    <div class="modal-head"><div><h2>${isNew ? '새 여행 만들기' : '여행 정보 수정'}</h2><p>날짜를 바꾸면 일정 날짜가 자동으로 맞춰집니다. 기존 일정은 유지됩니다.</p></div></div>
    <form id="trip-form">
      <div class="form-grid">
        <div class="field"><label>이모지</label><input name="emoji" value="${esc(t.emoji)}" maxlength="4"></div>
        <div class="field"><label>여행 이름 *</label><input name="title" value="${esc(t.title)}" required placeholder="예: 시즈오카 2026"></div>
        <div class="field span2"><label>목적지</label><input name="destination" value="${esc(t.destination)}" placeholder="예: 시즈오카, 일본"></div>
        <div class="field"><label>출발일 *</label><input name="startDate" type="date" value="${esc(t.startDate)}" required></div>
        <div class="field"><label>귀국일</label><input name="endDate" type="date" value="${esc(t.endDate)}"></div>
        <div class="field"><label>인원</label><input name="travelers" type="number" min="1" value="${t.travelers}"></div>
        <div class="field"><label>현지 통화</label><select name="currency">${Object.keys(CURRENCIES).map(c => option(c, `${c} · ${CURRENCIES[c].name}`, c === t.currency)).join('')}</select></div>
        <div class="field"><label>예산</label><input name="budgetAmount" type="number" min="0" step="1" value="${t.budget.amount || ''}" placeholder="0"></div>
        <div class="field"><label>예산 통화 (기준 통화)</label><select name="homeCurrency">${Object.keys(CURRENCIES).map(c => option(c, `${c} · ${CURRENCIES[c].name}`, c === t.homeCurrency)).join('')}</select><span class="hint">가계부 합계는 이 통화로 환산해 보여줍니다.</span></div>
        <div class="field span2"><label>카드 색</label><div class="row" id="covers">${COVERS.map(c => `<button type="button" class="cover-pick cover-${c}${c === t.cover ? ' on' : ''}" data-c="${c}" title="${c}" style="width:34px;height:34px;border-radius:10px;border:2px solid ${c === t.cover ? 'var(--ink)' : 'transparent'}"></button>`).join('')}<input type="hidden" name="cover" value="${esc(t.cover)}"></div></div>
        <div class="field span2"><label>한 줄 소개</label><textarea name="summary" placeholder="이 여행은 어떤 여행인가요?">${esc(t.summary)}</textarea></div>
      </div>
      <div class="form-actions">
        <div>${isNew ? '' : '<button class="btn ghost danger" type="button" id="trip-del">여행 삭제</button>'}</div>
        <div><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">${isNew ? '만들기' : '저장'}</button></div>
      </div>
    </form>`);
  m.querySelectorAll('.cover-pick').forEach(b => b.onclick = () => {
    m.querySelectorAll('.cover-pick').forEach(x => x.style.borderColor = 'transparent');
    b.style.borderColor = 'var(--ink)'; m.querySelector('[name=cover]').value = b.dataset.c;
  });
  m.querySelector('#trip-form').onsubmit = e => {
    e.preventDefault();
    const v = formValues(e.target);
    if (v.endDate && v.endDate < v.startDate) { toast('귀국일이 출발일보다 빠릅니다', { err: true }); return; }
    const data = { title: v.title.trim(), destination: v.destination.trim(), emoji: v.emoji.trim() || '✈', startDate: v.startDate, endDate: v.endDate, travelers: v.travelers || 1, currency: v.currency, homeCurrency: v.homeCurrency, budget: { amount: v.budgetAmount || 0, currency: v.homeCurrency }, cover: v.cover, summary: v.summary.trim() };
    if (isNew) { const nt = addTrip(data); closeModal(); toast('새 여행을 만들었습니다'); navigate(`#/trip/${nt.id}`); }
    else { updateTrip(trip.id, x => { Object.assign(x, data); x.fx[x.homeCurrency] = 1; }); closeModal(); toast('저장했습니다'); }
  };
  const del = m.querySelector('#trip-del');
  if (del) del.onclick = async () => { if (await confirmDialog(`"${trip.title}" 여행과 모든 일정·지출·기록을 삭제합니다. 되돌릴 수 없습니다.`)) { deleteTrip(trip.id); closeModal(); toast('삭제했습니다'); navigate('#/'); } };
}

// ----- 장소 -----
export function placeForm(trip, place, { onSave } = {}) {
  const isNew = !place;
  const p = place || { id: uid(), name: '', localName: '', category: 'sight', lat: null, lng: null, url: '', address: '', memo: '', hours: '' };
  const m = openModal(`
    <div class="modal-head"><div><h2>${isNew ? '장소 추가' : '장소 수정'}</h2><p>구글 지도 링크를 붙여넣으면 좌표를 자동으로 읽습니다. 좌표가 있어야 지도에 표시됩니다.</p></div></div>
    <form id="place-form">
      <div class="form-grid">
        <div class="field span2"><label>구글 지도 링크 / 좌표 붙여넣기</label><input name="url" value="${esc(p.url)}" placeholder="https://www.google.com/maps/place/... 또는 35.02, 138.49"><span class="hint" id="url-hint">PC 구글 지도 주소창의 긴 URL을 추천합니다. 짧은 maps.app.goo.gl 링크는 좌표를 담고 있지 않습니다.</span></div>
        <div class="field"><label>이름 *</label><input name="name" value="${esc(p.name)}" required placeholder="예: 시미즈항 가시노이치"></div>
        <div class="field"><label>현지어 이름</label><input name="localName" value="${esc(p.localName)}" placeholder="예: 清水魚市場 河岸の市"><span class="hint">구글 지도 검색에 이 이름을 씁니다.</span></div>
        <div class="field"><label>분류</label><select name="category">${Object.entries(PLACE_CATEGORIES).map(([k, c]) => option(k, `${c.icon} ${c.label}`, k === p.category)).join('')}</select></div>
        <div class="field"><label>좌표 검색 (OpenStreetMap)</label><div class="row" style="flex-wrap:nowrap"><input class="input" id="geo-q" placeholder="장소명으로 검색"><button class="btn sm" type="button" id="geo-btn">검색</button></div><div id="geo-res" class="small"></div></div>
        <div class="field"><label>위도</label><input name="lat" type="number" step="any" value="${p.lat ?? ''}"></div>
        <div class="field"><label>경도</label><input name="lng" type="number" step="any" value="${p.lng ?? ''}"></div>
        <div class="field span2"><label>주소</label><input name="address" value="${esc(p.address)}"></div>
        <div class="field"><label>영업시간·휴무</label><input name="hours" value="${esc(p.hours)}"></div>
        <div class="field"><label>메모</label><input name="memo" value="${esc(p.memo)}" placeholder="왜 가고 싶은지, 주의할 점"></div>
      </div>
      <div class="form-actions">
        <div>${isNew ? '' : '<button class="btn ghost danger" type="button" id="place-del">삭제</button>'}</div>
        <div><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">저장</button></div>
      </div>
    </form>`);
  const f = m.querySelector('#place-form');
  const urlInput = f.url, hint = m.querySelector('#url-hint');
  const tryParse = () => {
    const v = urlInput.value.trim();
    const ll = parseLatLng(v);
    if (ll) { f.lat.value = ll.lat; f.lng.value = ll.lng; hint.textContent = `좌표를 읽었습니다: ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`; hint.style.color = 'var(--good)';
      if (!f.name.value) { const mm = v.match(/\/maps\/place\/([^/]+)/); if (mm) f.name.value = decodeURIComponent(mm[1]).replace(/\+/g, ' '); }
    } else if (isGoogleShortLink(v)) { hint.textContent = '짧은 링크입니다. 브라우저에서 열어 긴 주소를 복사해 주세요. 또는 아래에서 이름으로 검색하세요.'; hint.style.color = 'var(--danger)'; }
  };
  urlInput.addEventListener('input', debounce(tryParse, 200));
  urlInput.addEventListener('paste', () => setTimeout(tryParse, 10));
  const geo = async () => {
    const q = m.querySelector('#geo-q').value.trim() || f.localName.value || f.name.value;
    const res = m.querySelector('#geo-res');
    if (!q) return;
    res.textContent = '검색 중…';
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ko&q=${encodeURIComponent(q)}`);
      const list = await r.json();
      if (!list.length) { res.textContent = '결과가 없습니다. 현지어 이름으로 다시 시도해 보세요.'; return; }
      res.innerHTML = list.map((x, i) => `<button type="button" class="btn sm ghost" style="display:block;text-align:left;white-space:normal;margin-top:4px" data-i="${i}">${esc(x.display_name)}</button>`).join('');
      res.querySelectorAll('button').forEach(b => b.onclick = () => { const x = list[b.dataset.i]; f.lat.value = (+x.lat).toFixed(6); f.lng.value = (+x.lon).toFixed(6); if (!f.address.value) f.address.value = x.display_name; res.textContent = '좌표를 적용했습니다.'; });
    } catch (e) { res.textContent = '검색에 실패했습니다. 네트워크를 확인하세요.'; }
  };
  m.querySelector('#geo-btn').onclick = geo;
  m.querySelector('#geo-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); geo(); } });
  f.onsubmit = e => {
    e.preventDefault();
    const v = formValues(f);
    const data = { name: v.name.trim(), localName: v.localName.trim(), category: v.category, lat: v.lat, lng: v.lng, url: v.url.trim(), address: v.address.trim(), memo: v.memo.trim(), hours: v.hours.trim() };
    if ((data.lat == null) !== (data.lng == null)) { toast('위도와 경도를 모두 입력하세요', { err: true }); return; }
    let saved;
    updateTrip(trip.id, t => {
      if (isNew) { saved = Object.assign({ id: p.id, note: '' }, data); t.places.push(saved); }
      else { const x = t.places.find(q => q.id === place.id); Object.assign(x, data); saved = x; }
    });
    closeModal(); toast(isNew ? '장소를 추가했습니다' : '저장했습니다');
    onSave && onSave(saved);
  };
  const del = m.querySelector('#place-del');
  if (del) del.onclick = async () => {
    const usedIn = trip.days.filter(d => d.stops.some(s => s.placeId === place.id)).length;
    if (await confirmDialog(`"${place.name}" 장소를 삭제합니다.${usedIn ? ` 일정 ${usedIn}일에서 사용 중이며, 해당 일정 항목은 장소 없이 남습니다.` : ''}`)) {
      updateTrip(trip.id, t => { t.places = t.places.filter(q => q.id !== place.id); t.days.forEach(d => d.stops.forEach(s => { if (s.placeId === place.id) { s.title = s.title || place.name; s.placeId = ''; } })); });
      closeModal(); toast('삭제했습니다');
    }
  };
}

// ----- 일정 항목 -----
export function stopForm(trip, dayDate, stop) {
  const isNew = !stop;
  const s = stop || { id: uid(), time: '', placeId: '', title: '', memo: '', transport: '', mode: 'walk', status: 'plan' };
  const placeOpts = [option('', '— 장소 없이 메모만 —', !s.placeId), ...[...trip.places].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(p => option(p.id, `${PLACE_CATEGORIES[p.category]?.icon || ''} ${p.name}${p.lat == null ? ' (좌표 없음)' : ''}`, p.id === s.placeId))].join('');
  const dayOpts = trip.days.map((d, i) => option(d.date, `Day ${i + 1} · ${fmtDate(d.date)}`, d.date === dayDate)).join('');
  const m = openModal(`
    <div class="modal-head"><div><h2>${isNew ? '일정 추가' : '일정 수정'}</h2><p>장소를 고르거나, 장소 없이 "체크아웃" 같은 메모만 넣을 수도 있습니다.</p></div></div>
    <form id="stop-form">
      <div class="form-grid">
        <div class="field"><label>날짜</label><select name="date">${dayOpts}</select></div>
        <div class="field"><label>시각</label><input name="time" value="${esc(s.time)}" placeholder="09:30 또는 '오후'"></div>
        <div class="field span2"><label>장소</label><div class="row" style="flex-wrap:nowrap"><select name="placeId" style="flex:1">${placeOpts}</select><button class="btn sm" type="button" id="new-place">+ 새 장소</button></div></div>
        <div class="field span2"><label>제목 (장소가 없을 때 또는 덮어쓰기)</label><input name="title" value="${esc(s.title)}" placeholder="예: 체크아웃 후 짐 보관"></div>
        <div class="field span2"><label>메모</label><textarea name="memo" placeholder="무엇을 할지, 주의할 점, 대안">${esc(s.memo)}</textarea></div>
        <div class="field"><label>다음 장소로 이동 수단</label><select name="mode">${Object.entries(TRANSPORT_MODES).map(([k, l]) => option(k, l, k === s.mode)).join('')}</select></div>
        <div class="field"><label>이동 메모</label><input name="transport" value="${esc(s.transport)}" placeholder="예: JR 13분 + 도보 10분"></div>
      </div>
      <div class="form-actions">
        <div>${isNew ? '' : '<button class="btn ghost danger" type="button" id="stop-del">삭제</button>'}</div>
        <div><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">저장</button></div>
      </div>
    </form>`);
  const f = m.querySelector('#stop-form');
  m.querySelector('#new-place').onclick = () => {
    const draft = formValues(f);
    closeModal();
    placeForm(trip, null, { onSave: p => { stopForm(trip, draft.date, Object.assign({}, s, draft, { placeId: p.id })); } });
  };
  f.onsubmit = e => {
    e.preventDefault();
    const v = formValues(f);
    if (!v.placeId && !v.title.trim()) { toast('장소를 고르거나 제목을 입력하세요', { err: true }); return; }
    updateTrip(trip.id, t => {
      const data = { time: v.time.trim(), placeId: v.placeId, title: v.title.trim(), memo: v.memo.trim(), transport: v.transport.trim(), mode: v.mode };
      // 원래 날짜에서 제거 후 새 날짜에 추가 (날짜 이동 지원)
      let existing = null;
      t.days.forEach(d => { const i = d.stops.findIndex(x => x.id === s.id); if (i >= 0) existing = d.stops.splice(i, 1)[0]; });
      const target = t.days.find(d => d.date === v.date) || t.days[0];
      const obj = Object.assign(existing || { id: s.id, status: 'plan' }, data);
      if (existing && existing.id === s.id && stop && target.date === dayDate) {
        // 같은 날이면 원래 위치 유지
        const idx = stop.__index; target.stops.splice(Math.min(idx ?? target.stops.length, target.stops.length), 0, obj);
      } else target.stops.push(obj);
    });
    closeModal(); toast(isNew ? '일정을 추가했습니다' : '저장했습니다');
  };
  const del = m.querySelector('#stop-del');
  if (del) del.onclick = () => { updateTrip(trip.id, t => t.days.forEach(d => { d.stops = d.stops.filter(x => x.id !== s.id); })); closeModal(); toast('삭제했습니다'); };
}

// ----- 지출 -----
export function expenseForm(trip, expense, preset = {}) {
  const isNew = !expense;
  const e0 = expense || Object.assign({ id: uid(), date: (trip.days.find(d => d.date === todayISO()) ? todayISO() : trip.startDate), category: 'food', amount: '', currency: trip.currency, method: 'cash', note: '', placeId: '', planned: false }, preset);
  const m = openModal(`
    <div class="modal-head"><div><h2>${isNew ? '지출 추가' : '지출 수정'}</h2></div></div>
    <form id="exp-form">
      <div class="form-grid">
        <div class="field"><label>금액 *</label><input name="amount" type="number" step="any" min="0" value="${esc(e0.amount)}" required inputmode="decimal"></div>
        <div class="field"><label>통화</label><select name="currency">${[trip.currency, trip.homeCurrency, ...Object.keys(CURRENCIES)].filter((c, i, a) => a.indexOf(c) === i).map(c => option(c, `${c} ${CURRENCIES[c]?.symbol || ''}`, c === e0.currency)).join('')}</select></div>
        <div class="field span2"><label>분류</label><div class="row" id="cat-chips">${EXPENSE_CATEGORIES.map(c => `<button type="button" class="chip clickable${c.id === e0.category ? ' on' : ''}" data-c="${c.id}">${c.icon} ${c.label}</button>`).join('')}</div><input type="hidden" name="category" value="${esc(e0.category)}"></div>
        <div class="field span2"><label>내용</label><input name="note" value="${esc(e0.note)}" placeholder="예: 참치덮밥 2인"></div>
        <div class="field"><label>날짜</label><input name="date" type="date" value="${esc(e0.date)}" min="${esc(trip.startDate)}" ${trip.endDate ? `max="${esc(trip.endDate)}"` : ''}></div>
        <div class="field"><label>결제 수단</label><select name="method">${Object.entries(PAY_METHODS).map(([k, l]) => option(k, l, k === e0.method)).join('')}</select></div>
        <div class="field"><label>장소 (선택)</label><select name="placeId">${option('', '—', !e0.placeId)}${[...trip.places].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(p => option(p.id, p.name, p.id === e0.placeId)).join('')}</select></div>
        <div class="field"><label>구분</label><div class="seg" id="planned-seg"><button type="button" class="${!e0.planned ? 'on' : ''}" data-v="0">실제 지출</button><button type="button" class="${e0.planned ? 'on' : ''}" data-v="1">예상(계획)</button></div><input type="hidden" name="planned" value="${e0.planned ? 1 : 0}"></div>
      </div>
      <div class="form-actions">
        <div>${isNew ? '' : '<button class="btn ghost danger" type="button" id="exp-del">삭제</button>'}</div>
        <div><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">저장</button></div>
      </div>
    </form>`);
  const f = m.querySelector('#exp-form');
  m.querySelectorAll('#cat-chips .chip').forEach(b => b.onclick = () => { m.querySelectorAll('#cat-chips .chip').forEach(x => x.classList.remove('on')); b.classList.add('on'); f.category.value = b.dataset.c; });
  m.querySelectorAll('#planned-seg button').forEach(b => b.onclick = () => { m.querySelectorAll('#planned-seg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); f.planned.value = b.dataset.v; });
  f.onsubmit = e => {
    e.preventDefault();
    const v = formValues(f);
    const data = { date: v.date || trip.startDate, category: v.category, amount: Number(v.amount) || 0, currency: v.currency, method: v.method, note: v.note.trim(), placeId: v.placeId, planned: v.planned === '1' };
    updateTrip(trip.id, t => { if (isNew) t.expenses.push(Object.assign({ id: e0.id }, data)); else Object.assign(t.expenses.find(x => x.id === expense.id), data); });
    closeModal(); toast(isNew ? '지출을 기록했습니다' : '저장했습니다');
  };
  const del = m.querySelector('#exp-del');
  if (del) del.onclick = () => { updateTrip(trip.id, t => { t.expenses = t.expenses.filter(x => x.id !== expense.id); }); closeModal(); toast('삭제했습니다'); };
}
