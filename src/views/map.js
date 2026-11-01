// 지도: Leaflet + 장소 목록 + 구글 지도 연동
import { updateTrip } from '../store.js';
import { esc, fmtDate, gmapsPlaceUrl, gmapsRouteUrl, download, PLACE_CATEGORIES } from '../util.js';
import { placeForm, stopForm } from '../forms.js';
import { tripToKML, placesToCSV } from '../export.js';
import { toast } from '../ui.js';

let map, layer, meMarker, markers = new Map();
let state = { tripId: null, filter: 'all', selected: null, q: '' };

export function renderMap(root, trip, route) {
  const fresh = !root.querySelector('#map') || state.tripId !== trip.id;
  if (fresh) {
    state = { tripId: trip.id, filter: route.sub && trip.days.some(d => d.date === route.sub) ? route.sub : 'all', selected: null, q: '' };
    root.innerHTML = `
      <div class="map-layout">
        <div class="map-wrap"><div id="map" role="application" aria-label="여행 지도"></div>
          <div class="map-toolbar"><div class="seg" id="day-seg"></div><button class="btn sm" id="me-btn" title="현재 위치">◉ 내 위치</button></div>
        </div>
        <aside class="map-side">
          <div class="ms-head">
            <div class="row between"><strong id="ms-title">장소</strong><div class="row"><button class="btn sm primary" id="add-place">+ 장소</button></div></div>
            <input class="input" id="ms-q" placeholder="장소 검색" style="min-height:34px">
            <div class="row"><button class="btn sm ghost" id="ex-kml" title="구글 내 지도(My Maps)에 가져올 수 있는 파일">KML 내보내기</button><button class="btn sm ghost" id="ex-csv">CSV</button></div>
          </div>
          <div class="ms-list" id="ms-list"></div>
          <div class="gm-help"><strong>구글 지도에서 전부 보려면</strong> KML을 내보낸 뒤 <a href="https://www.google.com/maps/d/" target="_blank" rel="noopener">google.com/maps/d</a> → 새 지도 → 가져오기. 구글 지도 앱의 "저장됨 › 지도"에 날짜별 레이어로 나타납니다.</div>
        </aside>
      </div>`;
    if (map) { map.remove(); map = null; }
    map = L.map(root.querySelector('#map'), { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    root.querySelector('#add-place').onclick = () => placeForm(trip, null, { onSave: p => { state.selected = p.id; } });
    root.querySelector('#ms-q').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); drawList(root, trip); });
    root.querySelector('#ex-kml').onclick = () => { download(`${trip.title}.kml`, tripToKML(trip), 'application/vnd.google-earth.kml+xml'); toast('KML을 내려받았습니다. 구글 내 지도에서 가져오세요.'); };
    root.querySelector('#ex-csv').onclick = () => download(`${trip.title}-places.csv`, placesToCSV(trip), 'text/csv');
    root.querySelector('#me-btn').onclick = () => locateMe();
    root.querySelector('#day-seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.filter = b.dataset.f; state.selected = null; draw(root, trip, true); };
  }
  draw(root, trip, fresh);
  setTimeout(() => map && map.invalidateSize(), 50);
}

function visibleStops(trip) {
  if (state.filter === 'all') return null;
  const d = trip.days.find(x => x.date === state.filter);
  return d ? d.stops : [];
}

function draw(root, trip, fit) {
  const seg = root.querySelector('#day-seg');
  seg.innerHTML = `<button data-f="all" class="${state.filter === 'all' ? 'on' : ''}">전체</button>` + trip.days.map((d, i) => `<button data-f="${d.date}" class="${state.filter === d.date ? 'on' : ''}" title="${fmtDate(d.date)}">D${i + 1}</button>`).join('');
  layer.clearLayers(); markers.clear();

  const stops = visibleStops(trip);
  const order = new Map(); // placeId -> label
  if (stops) stops.forEach((s, i) => { if (s.placeId && !order.has(s.placeId)) order.set(s.placeId, String(i + 1)); });
  else trip.days.forEach((d, di) => d.stops.forEach((s, si) => { if (s.placeId && !order.has(s.placeId)) order.set(s.placeId, `${di + 1}-${si + 1}`); }));

  const pts = [];
  const list = trip.places.filter(p => p.lat != null && (!stops || order.has(p.id)));
  list.forEach(p => {
    const label = order.get(p.id) || (PLACE_CATEGORIES[p.category]?.icon || '•');
    const icon = L.divIcon({ className: '', html: `<div class="pin p-${p.category}${stops === null && !order.has(p.id) ? ' dim' : ''}${state.selected === p.id ? ' sel' : ''}"><span>${esc(label)}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30] });
    const m = L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(layer);
    m.bindPopup(popupHtml(trip, p), { maxWidth: 280 });
    m.on('click', () => { state.selected = p.id; highlight(root); });
    markers.set(p.id, m);
    pts.push([p.lat, p.lng]);
  });
  // 일자별 경로선
  if (stops) {
    const line = stops.map(s => trip.places.find(p => p.id === s.placeId)).filter(p => p && p.lat != null).map(p => [p.lat, p.lng]);
    if (line.length > 1) L.polyline(line, { color: '#e0552d', weight: 3, opacity: .75, dashArray: '2 8', lineCap: 'round' }).addTo(layer);
  }
  if (fit) {
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.18), { maxZoom: 15 });
    else map.setView([35.0, 138.4], 10);
  }
  drawList(root, trip);
  // 팝업 안의 버튼 위임
  map.off('popupopen'); map.on('popupopen', e => {
    const el = e.popup.getElement();
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => placeForm(trip, trip.places.find(p => p.id === b.dataset.edit)));
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => stopForm(trip, trip.days[0]?.date, { placeId: b.dataset.add }));
  });
}

function popupHtml(trip, p) {
  const uses = [];
  trip.days.forEach((d, di) => d.stops.forEach((s, si) => { if (s.placeId === p.id) uses.push(`D${di + 1}-${si + 1}${s.time ? ' ' + s.time : ''}`); }));
  return `<strong>${esc(p.name)}</strong>${p.localName ? `<br><span style="color:var(--muted)">${esc(p.localName)}</span>` : ''}
    ${p.memo ? `<div style="margin-top:4px">${esc(p.memo)}</div>` : ''}${p.hours ? `<div class="small" style="color:var(--muted)">⏱ ${esc(p.hours)}</div>` : ''}
    ${uses.length ? `<div class="small" style="margin-top:4px;color:var(--sea)">일정: ${uses.join(', ')}</div>` : ''}
    <div class="pp-acts"><a href="${esc(gmapsPlaceUrl(p))}" target="_blank" rel="noopener">구글 지도 ↗</a><a class="sec" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=transit" target="_blank" rel="noopener">길찾기</a><a class="sec" href="javascript:void 0" data-add="${p.id}">일정에 추가</a><a class="sec" href="javascript:void 0" data-edit="${p.id}">수정</a></div>`;
}

function drawList(root, trip) {
  const stops = visibleStops(trip);
  const title = root.querySelector('#ms-title');
  let items;
  if (stops) {
    const d = trip.days.find(x => x.date === state.filter); const di = trip.days.indexOf(d);
    title.textContent = `Day ${di + 1} · ${fmtDate(d.date)} · ${stops.length}곳`;
    items = stops.map((s, i) => ({ p: trip.places.find(p => p.id === s.placeId), label: String(i + 1), s }));
    const pts = items.map(x => x.p).filter(p => p && p.lat != null);
    const r = gmapsRouteUrl(pts, 'transit');
    title.innerHTML += r ? ` <a class="small" href="${r}" target="_blank" rel="noopener">경로 ↗</a>` : '';
  } else {
    title.textContent = `장소 ${trip.places.length}곳`;
    items = [...trip.places].sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name, 'ko')).map(p => ({ p, label: PLACE_CATEGORIES[p.category]?.icon || '•' }));
  }
  const q = state.q;
  const rows = items.filter(x => !q || (x.p && (x.p.name + ' ' + x.p.localName + ' ' + (x.p.memo || '')).toLowerCase().includes(q)) || (x.s && (x.s.title || '').toLowerCase().includes(q))).map(x => {
    const p = x.p;
    if (!p) return `<div class="place-row"><span class="pm cat-other">${esc(x.label)}</span><div class="pn">${esc(x.s.title || '(장소 없음)')}<small>${esc(x.s.time || '')}</small></div><div></div></div>`;
    return `<div class="place-row${state.selected === p.id ? ' active' : ''}" data-id="${p.id}">
      <span class="pm cat-${p.category}">${esc(x.label)}</span>
      <div class="pn">${esc(p.name)}<small>${esc([x.s?.time, p.localName, PLACE_CATEGORIES[p.category]?.label].filter(Boolean).join(' · '))}${p.lat == null ? ' <span class="no-geo">좌표 없음</span>' : ''}</small></div>
      <div class="pa">${p.lat != null ? `<a href="${esc(gmapsPlaceUrl(p))}" target="_blank" rel="noopener" title="구글 지도">↗</a>` : ''}<button data-edit title="수정">✎</button></div>
    </div>`;
  }).join('');
  const list = root.querySelector('#ms-list');
  list.innerHTML = rows || '<div class="empty" style="margin:14px;padding:20px">장소가 없습니다. 구글 지도 링크를 붙여넣어 추가하세요.</div>';
  list.onclick = e => {
    const row = e.target.closest('.place-row[data-id]'); if (!row) return;
    const p = trip.places.find(x => x.id === row.dataset.id);
    if (e.target.closest('[data-edit]')) { placeForm(trip, p); return; }
    if (e.target.closest('a')) return;
    state.selected = p.id; highlight(root);
    const m = markers.get(p.id);
    if (m) { map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 15), { duration: .6 }); m.openPopup(); }
    else toast('좌표가 없어 지도에 표시할 수 없습니다. ✎ 로 좌표를 넣어 주세요.', { err: true });
  };
}

function highlight(root) {
  root.querySelectorAll('.place-row').forEach(r => r.classList.toggle('active', r.dataset.id === state.selected));
  markers.forEach((m, id) => { const el = m.getElement()?.querySelector('.pin'); el && el.classList.toggle('sel', id === state.selected); });
}

function locateMe() {
  if (!navigator.geolocation) { toast('위치 정보를 지원하지 않는 브라우저입니다', { err: true }); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const ll = [pos.coords.latitude, pos.coords.longitude];
    if (meMarker) meMarker.remove();
    meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 }).addTo(map).bindPopup('현재 위치');
    map.flyTo(ll, 15);
  }, () => toast('위치를 가져오지 못했습니다', { err: true }), { enableHighAccuracy: true, timeout: 8000 });
}
