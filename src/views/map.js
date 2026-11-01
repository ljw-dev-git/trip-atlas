// 지도: Leaflet(OSM) 또는 구글 지도(API 키 입력 시) + 장소 목록 + 구글 지도 연동
import { updateTrip } from '../store.js';
import { esc, fmtDate, gmapsPlaceUrl, gmapsRouteUrl, download, PLACE_CATEGORIES } from '../util.js';
import { placeForm, stopForm, wikiBulkForm } from '../forms.js';
import { imgUrl } from '../images.js';
import { tripToKML, placesToCSV } from '../export.js';
import { toast } from '../ui.js';

export const GMAPS_KEY = 'trip-atlas:gmaps-key';
export const getGmapsKey = () => (localStorage.getItem(GMAPS_KEY) || '').trim();
const CAT_COLOR = { food: '#c43c1f', cafe: '#a3700a', sight: '#1f6f78', shop: '#6b4fc2', stay: '#2d6b3c', transit: '#4a5568', other: '#8a8375' };
const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

let eng = null;               // 현재 지도 엔진 (아래 makeLeaflet / makeGoogle)
let state = { tripId: null, engine: '', filter: 'all', selected: null, q: '' };

export function renderMap(root, trip, route) {
  const wanted = getGmapsKey() ? 'google' : 'osm';
  const fresh = !root.querySelector('#map') || state.tripId !== trip.id || state.engine !== wanted;
  if (fresh) {
    state = { tripId: trip.id, engine: wanted, filter: route.sub && trip.days.some(d => d.date === route.sub) ? route.sub : 'all', selected: null, q: '' };
    root.innerHTML = `
      <div class="map-layout">
        <div class="map-wrap${wanted === 'google' ? ' gmap' : ''}"><div id="map" role="application" aria-label="여행 지도"></div>
          <div class="map-toolbar"><div class="seg" id="day-seg"></div><button class="btn sm" id="me-btn" title="현재 위치">◉ 내 위치</button></div>
        </div>
        <aside class="map-side">
          <div class="ms-head">
            <div class="row between"><strong id="ms-title">장소</strong><div class="row"><button class="btn sm primary" id="add-place">+ 장소</button></div></div>
            <input class="input" id="ms-q" placeholder="장소 검색" style="min-height:34px">
            <div class="row"><button class="btn sm ghost" id="ex-kml" title="구글 내 지도(My Maps)에 가져올 수 있는 파일">KML 내보내기</button><button class="btn sm ghost" id="ex-csv">CSV</button><button class="btn sm ghost" id="wk-bulk" title="사진이 없는 장소의 대표 사진을 위키백과에서 찾습니다">사진 찾기</button></div>
          </div>
          <div class="ms-list" id="ms-list"></div>
          <div class="gm-help">${wanted === 'google' ? '<strong>구글 지도</strong>로 표시 중 (키는 백업·설정에서 변경). ' : ''}<strong>구글 지도 앱에서 전부 보려면</strong> KML을 내보낸 뒤 <a href="https://www.google.com/maps/d/" target="_blank" rel="noopener">google.com/maps/d</a> → 새 지도 → 가져오기. 앱의 "저장됨 › 지도"에 날짜별 레이어로 나타납니다.</div>
        </aside>
      </div>`;
    if (eng) { eng.destroy(); eng = null; }
    const el = root.querySelector('#map');
    cur = { root, trip, el };
    root.querySelector('#add-place').onclick = () => placeForm(trip, null, { onSave: p => { state.selected = p.id; } });
    root.querySelector('#ms-q').addEventListener('input', e => { state.q = e.target.value.trim().toLowerCase(); drawList(root, trip); });
    root.querySelector('#ex-kml').onclick = () => { download(`${trip.title}.kml`, tripToKML(trip), 'application/vnd.google-earth.kml+xml'); toast('KML을 내려받았습니다. 구글 내 지도에서 가져오세요.'); };
    root.querySelector('#ex-csv').onclick = () => download(`${trip.title}-places.csv`, placesToCSV(trip), 'text/csv');
    root.querySelector('#me-btn').onclick = () => locateMe();
    root.querySelector('#wk-bulk').onclick = () => wikiBulkForm(trip);
    root.querySelector('#day-seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; state.filter = b.dataset.f; state.selected = null; draw(root, trip, true); };
    drawList(root, trip);
    if (wanted === 'google') {
      el.innerHTML = '<div class="map-loading">구글 지도를 불러오는 중…</div>';
      loadGoogle(getGmapsKey()).then(() => { if (state.engine !== 'google' || !el.isConnected) return; eng = makeGoogle(el); draw(root, trip, true); })
        .catch(err => fallbackToOSM(err.message));
      return;
    }
    eng = makeLeaflet(el);
  }
  if (!eng) return; // 구글 지도 로딩 중
  draw(root, trip, fresh);
  setTimeout(() => eng && eng.resize(), 50);
}

// 구글 키가 거부되면(gm_authFailure) 같은 자리에 OSM을 다시 그린다
let cur = null;
function fallbackToOSM(reason) {
  if (!cur || !cur.el.isConnected) return;
  toast(reason + ' — OpenStreetMap으로 표시합니다.', { err: true, ms: 6000 });
  if (eng) { eng.destroy(); eng = null; }
  cur.root.querySelector('.map-wrap')?.classList.remove('gmap');
  cur.el.innerHTML = '';
  eng = makeLeaflet(cur.el); draw(cur.root, cur.trip, true);
}

function visibleStops(trip) {
  if (state.filter === 'all') return null;
  const d = trip.days.find(x => x.date === state.filter);
  return d ? d.stops : [];
}

function draw(root, trip, fit) {
  const seg = root.querySelector('#day-seg');
  seg.innerHTML = `<button data-f="all" class="${state.filter === 'all' ? 'on' : ''}">전체</button>` + trip.days.map((d, i) => `<button data-f="${d.date}" class="${state.filter === d.date ? 'on' : ''}" title="${fmtDate(d.date)}">D${i + 1}</button>`).join('');
  eng.clear();

  const stops = visibleStops(trip);
  const order = new Map(); // placeId -> label
  if (stops) stops.forEach((s, i) => { if (s.placeId && !order.has(s.placeId)) order.set(s.placeId, String(i + 1)); });
  else trip.days.forEach((d, di) => d.stops.forEach((s, si) => { if (s.placeId && !order.has(s.placeId)) order.set(s.placeId, `${di + 1}-${si + 1}`); }));

  const pts = [];
  const list = trip.places.filter(p => p.lat != null && (!stops || order.has(p.id)));
  list.forEach(p => {
    const label = order.get(p.id) || '•';
    eng.marker(p, { label, dim: stops === null && !order.has(p.id), sel: state.selected === p.id, popup: () => popupHtml(trip, p), onClick: () => { state.selected = p.id; highlight(root); } });
    pts.push([p.lat, p.lng]);
  });
  if (stops) {
    const line = stops.map(s => trip.places.find(p => p.id === s.placeId)).filter(p => p && p.lat != null).map(p => [p.lat, p.lng]);
    if (line.length > 1) eng.line(line);
  }
  if (fit) { if (pts.length) eng.fit(pts); else eng.setView([35.0, 138.4], 10); }
  drawList(root, trip);
  eng.onPopup(el => {
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => placeForm(trip, trip.places.find(p => p.id === b.dataset.edit)));
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => stopForm(trip, trip.days[0]?.date, { placeId: b.dataset.add }));
  });
}

function popupHtml(trip, p) {
  const uses = [];
  trip.days.forEach((d, di) => d.stops.forEach((s, si) => { if (s.placeId === p.id) uses.push(`D${di + 1}-${si + 1}${s.time ? ' ' + s.time : ''}`); }));
  const img = imgUrl(p.photo, 'thumb');
  return `<div class="pp">${img ? `<img class="pp-img" src="${esc(img)}" alt="">` : ''}<strong>${esc(p.name)}</strong>${p.localName ? `<br><span style="color:var(--muted)">${esc(p.localName)}</span>` : ''}
    ${p.memo ? `<div style="margin-top:4px">${esc(p.memo)}</div>` : ''}${p.hours ? `<div class="small" style="color:var(--muted)">⏱ ${esc(p.hours)}</div>` : ''}
    ${uses.length ? `<div class="small" style="margin-top:4px;color:var(--ink-2)">일정: ${uses.join(', ')}</div>` : ''}
    <div class="pp-acts"><a href="${esc(gmapsPlaceUrl(p))}" target="_blank" rel="noopener">구글 지도 ↗</a><a class="sec" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=transit" target="_blank" rel="noopener">길찾기</a><a class="sec" href="javascript:void 0" data-add="${p.id}">일정에 추가</a><a class="sec" href="javascript:void 0" data-edit="${p.id}">수정</a></div></div>`;
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
    if (!p) return `<div class="place-row"><span class="pm cat-other">${esc(x.label)}</span><div class="pn">${esc(x.s.title || '(장소 없음)')}<small>${esc(x.s.time || '')}</small></div><span></span><div></div></div>`;
    return `<div class="place-row${state.selected === p.id ? ' active' : ''}" data-id="${p.id}">
      <span class="pm cat-${p.category}">${esc(x.label)}</span>
      <div class="pn">${esc(p.name)}<small>${esc([x.s?.time, p.localName, PLACE_CATEGORIES[p.category]?.label].filter(Boolean).join(' · '))}${p.lat == null ? ' <span class="no-geo">좌표 없음</span>' : ''}</small></div>
      ${imgUrl(p.photo, 'thumb') ? `<img class="pt" src="${esc(imgUrl(p.photo, 'thumb'))}" alt="" loading="lazy">` : '<span></span>'}
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
    if (eng && eng.has(p.id)) eng.focus(p.id);
    else toast('좌표가 없어 지도에 표시할 수 없습니다. ✎ 로 좌표를 넣어 주세요.', { err: true });
  };
}

function highlight(root) {
  root.querySelectorAll('.place-row').forEach(r => r.classList.toggle('active', r.dataset.id === state.selected));
  eng && eng.select(state.selected);
}

function locateMe() {
  if (!navigator.geolocation) { toast('위치 정보를 지원하지 않는 브라우저입니다', { err: true }); return; }
  navigator.geolocation.getCurrentPosition(pos => { eng && eng.me([pos.coords.latitude, pos.coords.longitude]); },
    () => toast('위치를 가져오지 못했습니다', { err: true }), { enableHighAccuracy: true, timeout: 8000 });
}

// ---------- 엔진 1: Leaflet + OpenStreetMap ----------
function makeLeaflet(el) {
  const map = L.map(el, { zoomControl: true, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const markers = new Map(); let meMarker, popupFn = null;
  map.on('popupopen', e => popupFn && popupFn(e.popup.getElement()));
  return {
    clear() { layer.clearLayers(); markers.clear(); },
    marker(p, { label, dim, sel, popup, onClick }) {
      const icon = L.divIcon({ className: '', html: `<div class="pin p-${p.category}${dim ? ' dim' : ''}${sel ? ' sel' : ''}"><span>${esc(label)}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30] });
      const m = L.marker([p.lat, p.lng], { icon, title: p.name }).addTo(layer);
      m.bindPopup(popup, { maxWidth: 280 });
      m.on('click', onClick);
      markers.set(p.id, m);
    },
    line(pts) { L.polyline(pts, { color: '#e0552d', weight: 3, opacity: .75, dashArray: '2 8', lineCap: 'round' }).addTo(layer); },
    fit(pts) { map.fitBounds(L.latLngBounds(pts).pad(0.18), { maxZoom: 15 }); },
    setView(ll, z) { map.setView(ll, z); },
    has: id => markers.has(id),
    focus(id) { const m = markers.get(id); map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 15), { duration: .6 }); m.openPopup(); },
    select(id) { markers.forEach((m, k) => { const d = m.getElement()?.querySelector('.pin'); d && d.classList.toggle('sel', k === id); }); },
    me(ll) { if (meMarker) meMarker.remove(); meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 }).addTo(map).bindPopup('현재 위치'); map.flyTo(ll, 15); },
    onPopup(fn) { popupFn = fn; },
    resize() { map.invalidateSize(); },
    destroy() { map.remove(); },
  };
}

// ---------- 엔진 2: Google Maps JavaScript API ----------
let gLoading = null;
function loadGoogle(key) {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (gLoading) return gLoading;
  gLoading = new Promise((resolve, reject) => {
    const cb = '__tripAtlasGmaps';
    window[cb] = () => { delete window[cb]; resolve(); };
    window.gm_authFailure = () => fallbackToOSM('구글 지도 API 키가 거부되었습니다 (키·리퍼러 제한·결제 설정 확인)');
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=ko&region=KR&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => { gLoading = null; s.remove(); reject(new Error('구글 지도 스크립트를 불러오지 못했습니다')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.google?.maps?.Map) { gLoading = null; reject(new Error('구글 지도 로딩 시간이 초과됐습니다')); } }, 15000);
  });
  return gLoading;
}

const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d1f21' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#9a9890' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1f21' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2f33' }] }, { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1d1f21' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111b26' }] }, { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#23262a' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f2b22' }] }, { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2a2d31' }] },
];

function pinIcon(color, label, sel) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38"><path d="M15 37C15 37 3 22 3 14A12 12 0 0 1 27 14C27 22 15 37 15 37Z" fill="${color}" stroke="${sel ? '#141414' : '#ffffff'}" stroke-width="${sel ? 3 : 2}"/><text x="15" y="17.5" text-anchor="middle" font-family="JetBrains Mono,Menlo,monospace" font-size="${String(label).length > 2 ? 8 : 10}" font-weight="700" fill="#fff">${esc(String(label))}</text></svg>`;
  return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(30, 38), anchor: new google.maps.Point(15, 37) };
}

function makeGoogle(el) {
  el.innerHTML = '';
  const g = google.maps;
  const map = new g.Map(el, { center: { lat: 35, lng: 138.4 }, zoom: 10, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, clickableIcons: false, gestureHandling: 'greedy', styles: isDark() ? DARK_STYLE : [] });
  const iw = new g.InfoWindow({ maxWidth: 300 });
  const markers = new Map(); let shapes = [], meMarker, popupFn = null;
  iw.addListener('domready', () => { const c = document.querySelector('.gm-style-iw .pp'); if (c && popupFn) popupFn(c); });
  const toLL = ll => ({ lat: ll[0], lng: ll[1] });
  return {
    clear() { markers.forEach(m => m.setMap(null)); markers.clear(); shapes.forEach(s => s.setMap(null)); shapes = []; iw.close(); },
    marker(p, { label, dim, sel, popup, onClick }) {
      const m = new g.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: p.name, icon: pinIcon(CAT_COLOR[p.category] || CAT_COLOR.other, label, sel), opacity: dim ? .35 : 1, zIndex: sel ? 10 : 1 });
      m._meta = { color: CAT_COLOR[p.category] || CAT_COLOR.other, label };
      m.addListener('click', () => { iw.setContent(popup()); iw.open({ map, anchor: m }); onClick(); });
      markers.set(p.id, m);
    },
    line(pts) { shapes.push(new g.Polyline({ map, path: pts.map(toLL), strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: .8, strokeColor: '#e0552d', scale: 3 }, offset: '0', repeat: '14px' }] })); },
    fit(pts) { const b = new g.LatLngBounds(); pts.forEach(ll => b.extend(toLL(ll))); map.fitBounds(b, 40); g.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > 15) map.setZoom(15); }); },
    setView(ll, z) { map.setCenter(toLL(ll)); map.setZoom(z); },
    has: id => markers.has(id),
    focus(id) { const m = markers.get(id); map.panTo(m.getPosition()); if (map.getZoom() < 15) map.setZoom(15); g.event.trigger(m, 'click'); },
    select(id) { markers.forEach((m, k) => { m.setIcon(pinIcon(m._meta.color, m._meta.label, k === id)); m.setZIndex(k === id ? 10 : 1); }); },
    me(ll) { if (meMarker) meMarker.setMap(null); meMarker = new g.Marker({ map, position: toLL(ll), title: '현재 위치', icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: '#2a78d6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }, zIndex: 1000 }); map.panTo(toLL(ll)); map.setZoom(15); },
    onPopup(fn) { popupFn = fn; },
    resize() { g.event.trigger(map, 'resize'); },
    destroy() { markers.forEach(m => m.setMap(null)); shapes.forEach(s => s.setMap(null)); el.innerHTML = ''; },
  };
}
