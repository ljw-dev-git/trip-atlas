// 내 주변: 타베로그·유튜브·인스타그램 기준 맛집 지도 + 거리/점수순 목록
import { haversineKm, esc, uid } from '../../../src/util.js';
import { getTrip } from '../../../src/store.js';
import { ic } from '../icons.js';
import { currentTrip } from '../current.js';
import { EATS, EATS_CHECKED, eatsNear } from '../eats.js';
import { setPin } from '../pinstore.js';
import { sheet, closeSheet, toast } from '../ui.js';
import { mountMap } from '../mapkit.js';
import { addPlaceFromContent } from './plan.js';

const SOURCES = [['tabelog', '食べログ', 'tb'], ['youtube', 'YouTube', 'yt'], ['instagram', 'Instagram', 'ig']];
const KINDS = [['all', '전체'], ['food', '식당'], ['cafe', '카페·디저트']];
const KIND_COLOR = { food: '#ef4444', cafe: '#a16207' };
const SRC_COLOR = { youtube: '#e62117', instagram: '#d6249f' };
let src = 'tabelog', kind = 'all', sort = 'score', me = null, map = null;

const igUrl = e => `https://www.instagram.com/explore/tags/${encodeURIComponent(e.instagramTag)}/`;
const gmUrl = e => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.nameJa} ${e.address || ''}`.trim())}`;
const ytThumb = url => { const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/); return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : ''; };
const fmtKm = km => km < 1 ? Math.round(km * 1000) + 'm' : km < 100 ? km.toFixed(1) + 'km' : Math.round(km).toLocaleString() + 'km';
const score = e => (e.tabelogScore ? e.tabelogScore.toFixed(2) : '–');

function badges(e) {
  return `<span class="src tb">${ic('star')} 食べログ ${score(e)}</span>${e.youtube ? `<span class="src yt">▶ YouTube</span>` : ''}${e.instagramTag ? `<span class="src ig">IG</span>` : ''}`;
}

// 출처별 목록 한 줄
function row(e, km) {
  const mark = `<span class="eat-mark" style="--c:${KIND_COLOR[e.kind] || KIND_COLOR.food}">${ic(e.kind === 'cafe' ? 'coffee' : 'food')}</span>`;
  if (src === 'youtube') return `<button class="near-row eat yt-row" data-id="${e.id}">
      <span class="yt-thumb" style="background-image:url('${esc(ytThumb(e.youtube.url))}')"><i>▶</i></span>
      <div><b>${esc(e.nameKo)}</b><p class="yt-title">${esc(e.youtube.title)}</p><small>${esc(e.youtube.channel)} · ${fmtKm(km)}</small></div></button>`;
  if (src === 'instagram') return `<div class="near-row eat ig-row">${mark}
      <button class="ig-main" data-id="${e.id}"><b>${esc(e.nameKo)}</b><small>${esc(e.genre)} · ${fmtKm(km)}</small><span class="ig-tag">#${esc(e.instagramTag)}</span></button>
      <a class="ig-open" href="${esc(igUrl(e))}" target="_blank" rel="noopener" aria-label="인스타그램에서 #${esc(e.instagramTag)} 보기">IG ${ic('chevron')}</a></div>`;
  return `<button class="near-row eat" data-id="${e.id}">${mark}
      <div><b>${esc(e.nameKo)}</b><small>${esc(e.genre)} · ${fmtKm(km)} · ${esc(e.nameJa)}</small>
      <div class="srcs"><span class="src tb">${ic('star')} ${score(e)}</span>${e.tabelogAward ? `<span class="src aw">${esc(e.tabelogAward.split(' / ').pop())}</span>` : ''}</div></div>
      <em class="tb-score">${score(e)}</em></button>`;
}

const NOTE = {
  tabelog: `타베로그 점수순 (${EATS_CHECKED} 확인). 3.5 이상이면 현지에서도 평이 좋은 편이에요.`,
  youtube: '이 가게를 직접 소개한 유튜브 영상이 있는 곳만 모았어요. 누르면 영상과 가게 정보를 볼 수 있어요.',
  instagram: '인스타그램은 로그인 없이 게시물 수를 가져올 수 없어서, 가게별 해시태그로 바로 사진을 찾아보게 했어요.',
};

export function renderNearby(root) {
  const trip = currentTrip();
  const places = trip ? trip.places.filter(p => p.lat != null) : [];
  const center = me || (places[0] ? { lat: places[0].lat, lng: places[0].lng } : { lat: 34.9717, lng: 138.3889 });
  const pool = eatsNear(center);
  const shown = pool.filter(e => (kind === 'all' || e.kind === kind) && (src === 'youtube' ? !!e.youtube : src === 'instagram' ? !!e.instagramTag : true));
  const byScore = src === 'tabelog' && sort === 'score';
  const list = shown.map(e => ({ e, km: haversineKm(center, e) }))
    .sort((a, b) => byScore ? (b.e.tabelogScore || 0) - (a.e.tabelogScore || 0) : a.km - b.km);

  root.innerHTML = `<div class="nearby">
    <div class="near-map" id="nmap"></div>
    <div class="near-chips">${KINDS.map(([k, l]) => `<button class="chip ${k === kind ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="locate" id="loc" aria-label="내 위치">${ic('locate')}</button>
    <section class="near-sheet">
      <div class="src-tabs" role="tablist">${SOURCES.map(([k, l, c]) => `<button role="tab" class="${k === src ? 'on' : ''} ${c}" data-src="${k}" aria-selected="${k === src}">${l}<small>${pool.filter(e => (kind === 'all' || e.kind === kind) && (k === 'youtube' ? !!e.youtube : k === 'instagram' ? !!e.instagramTag : true)).length}</small></button>`).join('')}</div>
      <div class="sec-hd"><h2>${me ? '내 위치' : trip ? esc(trip.title) : '기준 위치'} 주변</h2>
        ${src === 'tabelog' ? `<div class="seg sm"><button data-s="score" class="${sort === 'score' ? 'on' : ''}">점수순</button><button data-s="dist" class="${sort === 'dist' ? 'on' : ''}">거리순</button></div>` : '<span class="muted small">거리순</span>'}</div>
      <p class="muted small src-note">${NOTE[src]}</p>
      ${list.map(({ e, km }) => row(e, km)).join('') || `<p class="muted pad">${pool.length ? '이 조건의 맛집이 없어요' : '이 지역은 아직 맛집 데이터가 없어요. 지금은 시즈오카(시내·시미즈·후지) 주변만 들어 있어요.'}</p>`}
    </section></div>`;

  if (map) { map.destroy(); map = null; }
  map = mountMap(root.querySelector('#nmap'), m => {
    places.forEach(p => m.dot([p.lat, p.lng], '#5b5ceb', p.name));
    shown.forEach(e => m.deal([e.lat, e.lng], src === 'youtube' ? '▶' : src === 'instagram' ? 'IG' : score(e), SRC_COLOR[src] || KIND_COLOR[e.kind] || KIND_COLOR.food,
      `<b>${esc(e.nameKo)}</b><br>${esc(e.genre)} · 食べログ ${score(e)}<br><a href="#/nearby" data-eat="${e.id}">자세히 보기</a>`));
    if (me) m.dot([me.lat, me.lng], '#3b82f6', '내 위치', true);
    m.view([center.lat, center.lng], 13);
  });

  root.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { src = b.dataset.src; renderNearby(root); });
  root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; renderNearby(root); });
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { sort = b.dataset.s; renderNearby(root); });
  root.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => eatSheet(EATS.find(e => e.id === b.dataset.id)));
  // 지도 팝업의 '자세히 보기' (Leaflet·구글 팝업 모두 문서 안에 그려짐)
  root.onclick = ev => { const a = ev.target.closest('[data-eat]'); if (a) { ev.preventDefault(); eatSheet(EATS.find(e => e.id === a.dataset.eat)); } };
  root.querySelector('#loc').onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => { me = { lat: p.coords.latitude, lng: p.coords.longitude }; renderNearby(root); }, () => toast('위치 권한이 없어 여행지 기준으로 보여드려요'), { timeout: 8000 });
  };
}

function eatSheet(e) {
  if (!e) return;
  const trip = currentTrip();
  const sh = sheet(`<div class="eat-hd"><span class="muted small">${esc(e.genre)} · ${esc(e.nameJa)}</span>
      <div class="srcs">${badges(e)}${e.tabelogAward ? `<span class="src aw">${esc(e.tabelogAward)}</span>` : ''}</div></div>
    ${e.note ? `<p class="eat-note">${esc(e.note)}</p>` : ''}
    ${e.address ? `<p class="muted small eat-addr">${ic('pin')} ${esc(e.address)}</p>` : ''}
    <div class="link-list">
      ${e.tabelogUrl ? `<a href="${esc(e.tabelogUrl)}" target="_blank" rel="noopener"><span class="src tb">食べログ</span> 리뷰·메뉴·영업시간 ${ic('chevron')}</a>` : ''}
      ${e.youtube ? `<a href="${esc(e.youtube.url)}" target="_blank" rel="noopener"><span class="src yt">▶</span> <span class="ell">${esc(e.youtube.title)}<small>${esc(e.youtube.channel)}</small></span> ${ic('chevron')}</a>` : ''}
      ${e.instagramTag ? `<a href="${esc(igUrl(e))}" target="_blank" rel="noopener"><span class="src ig">IG</span> #${esc(e.instagramTag)} 사진 보기 ${ic('chevron')}</a>` : ''}
      <a href="${esc(gmUrl(e))}" target="_blank" rel="noopener"><span class="src gm">${ic('map')}</span> 구글 지도에서 열기 ${ic('chevron')}</a>
    </div>
    <div class="two"><button class="btn" id="save">${ic('bookmark')} 콘텐츠에 저장</button>${trip ? `<button class="btn primary" id="plan">${ic('plus')} 일정에 추가</button>` : ''}</div>`, { title: e.nameKo });

  const asContent = () => ({ url: e.youtube?.url || e.tabelogUrl || '', title: `${e.nameKo} · ${e.genre}`, category: e.kind === 'cafe' ? '카페' : '맛집', placeName: e.nameKo, lat: e.lat, lng: e.lng });
  sh.querySelector('#save').onclick = () => {
    const c = asContent();
    setPin(p => p.contents.unshift(Object.assign({ id: uid(), created: Date.now(), handle: '', tags: [e.instagramTag].filter(Boolean), folderId: p.folders[0].id, platform: e.youtube ? 'youtube' : 'web', note: e.note || '' }, c)));
    closeSheet(); toast('콘텐츠에 저장했어요');
  };
  const pb = sh.querySelector('#plan');
  if (pb) pb.onclick = () => {
    const t = getTrip(trip.id);
    const d = sheet(`<div class="opt-list">${t.days.map((day, i) => `<button class="opt" data-d="${i}">Day ${i + 1} · ${day.date.slice(5).replace('-', '.')} <small>${day.stops.length}곳</small></button>`).join('')}</div>`, { title: `'${e.nameKo}' 일정에 추가` });
    d.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { addPlaceFromContent(getTrip(t.id), asContent(), +b.dataset.d); closeSheet(); toast(`Day ${+b.dataset.d + 1}에 추가했어요`); });
  };
}
