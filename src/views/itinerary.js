// 일정 타임라인
import { updateTrip } from '../store.js';
import { esc, fmtDate, gmapsPlaceUrl, gmapsRouteUrl, haversineKm, PLACE_CATEGORIES, TRANSPORT_MODES, debounce } from '../util.js';
import { stopForm, placeForm } from '../forms.js';
import { itineraryToText } from '../export.js';
import { toast, openLightbox } from '../ui.js';
import { imgUrl } from '../images.js';

export function renderItinerary(root, trip, route) {
  if (!trip.days.length) { root.innerHTML = '<div class="empty"><strong>날짜가 없습니다</strong>여행 정보에서 출발일과 귀국일을 입력하세요.</div>'; return; }
  const activeDate = route.sub && trip.days.some(d => d.date === route.sub) ? route.sub : trip.days[0].date;
  const placeOf = s => trip.places.find(p => p.id === s.placeId);

  root.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <div class="muted small">클릭해 수정 · ✓ 로 방문 완료 표시 · 제목과 메모는 바로 입력됩니다.</div>
      <div class="row"><button class="btn sm" id="copy-itin">텍스트 복사</button></div>
    </div>
    <div class="itin-layout">
      <nav class="day-nav">${trip.days.map((d, i) => `<a href="#/trip/${esc(trip.id)}/itinerary/${d.date}" class="${d.date === activeDate ? 'active' : ''}"><span class="dn-day">DAY ${i + 1}</span><span class="dn-date">${fmtDate(d.date)}</span><span class="dn-count">${d.stops.length}곳 · ${d.stops.filter(s => s.status === 'done').length}완료</span></a>`).join('')}</nav>
      <div>${trip.days.map((d, i) => dayBlock(trip, d, i, placeOf)).join('')}</div>
    </div>`;

  root.querySelector('#copy-itin').onclick = async () => { try { await navigator.clipboard.writeText(itineraryToText(trip)); toast('일정 텍스트를 복사했습니다'); } catch { toast('복사에 실패했습니다', { err: true }); } };

  root.querySelectorAll('.day-block').forEach(block => {
    const date = block.dataset.date;
    const dayOf = t => t.days.find(d => d.date === date);
    const titleInput = block.querySelector('.dh-title');
    titleInput.addEventListener('change', () => updateTrip(trip.id, t => { dayOf(t).title = titleInput.value.trim(); }, { silent: true }));
    const note = block.querySelector('.day-note textarea');
    note.addEventListener('change', () => updateTrip(trip.id, t => { dayOf(t).note = note.value.trim(); }, { silent: true }));
    block.querySelector('.add-stop').onclick = () => stopForm(trip, date);
    block.querySelector('.add-place-inline').onclick = () => placeForm(trip, null, { onSave: p => stopForm(trip, date, { id: undefined, placeId: p.id }) });
    block.querySelectorAll('.stop').forEach(li => {
      const id = li.dataset.id;
      const find = t => { const d = dayOf(t); return [d, d.stops.findIndex(s => s.id === id)]; };
      li.querySelector('.body .top').onclick = e => { if (e.target.closest('.tools')) return;
        if (e.target.closest('.stop-img')) { const p = placeOf(dayOf(trip).stops.find(s => s.id === id) || {}); if (p) openLightbox({ src: imgUrl(p.photo), caption: p.name, meta: p.localName || '', credit: p.photoCredit }); return; } const d = dayOf(trip); const i = d.stops.findIndex(s => s.id === id); stopForm(trip, date, Object.assign({ __index: i }, d.stops[i])); };
      li.querySelector('.st').onclick = () => updateTrip(trip.id, t => { const [d, i] = find(t); const s = d.stops[i]; s.status = s.status === 'done' ? 'plan' : 'done'; });
      li.querySelector('.sk').onclick = () => updateTrip(trip.id, t => { const [d, i] = find(t); const s = d.stops[i]; s.status = s.status === 'skip' ? 'plan' : 'skip'; });
      li.querySelector('.up').onclick = () => updateTrip(trip.id, t => { const [d, i] = find(t); if (i > 0) d.stops.splice(i - 1, 0, d.stops.splice(i, 1)[0]); });
      li.querySelector('.dn').onclick = () => updateTrip(trip.id, t => { const [d, i] = find(t); if (i < d.stops.length - 1) d.stops.splice(i + 1, 0, d.stops.splice(i, 1)[0]); });
    });
  });
  if (route.sub) { const el = root.querySelector(`.day-block[data-date="${activeDate}"]`); if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30); }
}

function dayBlock(trip, d, i, placeOf) {
  const pts = d.stops.map(placeOf).filter(p => p && p.lat != null);
  let km = 0; for (let k = 1; k < pts.length; k++) km += haversineKm(pts[k - 1], pts[k]);
  const route = gmapsRouteUrl(pts, 'transit');
  const expenses = trip.expenses.filter(e => e.date === d.date && !e.planned).length;
  return `<section class="day-block" id="day-${d.date}" data-date="${d.date}">
    <div class="day-head">
      <div style="flex:1;min-width:0"><div class="dh-day">DAY ${i + 1} · ${fmtDate(d.date, { long: true })}</div><h2><input class="dh-title" value="${esc(d.title)}" placeholder="이 날의 제목을 적어 두세요"></h2></div>
      <div class="day-tools">
        <span class="day-sum">${d.stops.length}곳${pts.length > 1 ? ` · 직선 ${km.toFixed(1)}km` : ''}${expenses ? ` · 지출 ${expenses}건` : ''}</span>
        ${route ? `<a class="btn sm" href="${route}" target="_blank" rel="noopener" title="이날 경로를 구글 지도 길찾기로 엽니다">구글 지도 경로 ↗</a>` : ''}
        <a class="btn sm ghost" href="#/trip/${esc(trip.id)}/map/${d.date}">지도에서 보기</a>
      </div>
    </div>
    <div class="day-note"><textarea rows="1" placeholder="이 날의 메모 — 교통편, 날씨 대안, 꼭 지켜야 할 시각">${esc(d.note)}</textarea></div>
    <ol class="timeline">${d.stops.map((s, si) => stopItem(trip, s, si, placeOf(s))).join('')}</ol>
    ${d.stops.length ? '' : '<div class="empty" style="padding:22px">아직 일정이 없습니다. 장소를 고르거나 메모만 넣어도 됩니다.</div>'}
    <div class="row add-stop-row" style="margin-top:8px"><button class="btn sm primary add-stop">+ 일정 추가</button><button class="btn sm ghost add-place-inline">+ 새 장소로 추가</button></div>
  </section>`;
}

function stopItem(trip, s, si, p) {
  const name = p ? p.name : (s.title || '(제목 없음)');
  const cat = p ? PLACE_CATEGORIES[p.category] : null;
  return `<li class="stop ${s.status}" data-id="${s.id}">
    <div class="t">${esc(s.time)}</div>
    <div class="dot"><i>${s.status === 'done' ? '✓' : si + 1}</i></div>
    <div class="body">
      <div class="top">
        <div style="flex:1;min-width:0"><strong>${esc(s.title && p ? s.title : name)}</strong>${p && p.localName ? `<span class="ln">${esc(p.localName)}</span>` : ''}${cat ? `<span class="cat">${cat.icon} ${cat.label}</span>` : ''}${p && p.lat == null ? '<span class="cat" style="color:var(--danger)">좌표 없음</span>' : ''}
          ${s.memo ? `<p>${esc(s.memo)}</p>` : ''}${p && p.hours ? `<p class="small muted">⏱ ${esc(p.hours)}</p>` : ''}
          ${s.transport || (s.mode && s.mode !== 'walk') ? `<div class="tr"><span>${TRANSPORT_MODES[s.mode] || ''}</span>${s.transport && s.transport !== TRANSPORT_MODES[s.mode] ? `<span>${esc(s.transport)}</span>` : ''}</div>` : ''}
        </div>
        ${p && imgUrl(p.photo, 'thumb') ? `<img class="stop-img" src="${esc(imgUrl(p.photo, 'thumb'))}" alt="${esc(p.name)}" loading="lazy">` : ''}
        <div class="tools">
          ${p && p.lat != null ? `<a href="${esc(gmapsPlaceUrl(p))}" target="_blank" rel="noopener" title="구글 지도에서 열기">↗</a>` : ''}
          <button class="st ${s.status === 'done' ? 'on' : ''}" title="방문 완료 표시">✓</button>
          <button class="sk" title="건너뜀 표시">⊘</button>
          <button class="up" title="위로">↑</button><button class="dn" title="아래로">↓</button>
        </div>
      </div>
    </div>
  </li>`;
}
