// 내 주변: 타베로그·구글·유튜브·인스타그램 기준 맛집 지도 + 점수/리뷰/거리순 목록
import { haversineKm, esc, uid } from '../../../src/util.js';
import { getTrip } from '../../../src/store.js';
import { ic } from '../icons.js';
import { currentTrip } from '../current.js';
import { EATS, EATS_CHECKED, EAT_REGIONS, eatsIn, nearestRegion, areaLabel, eatEmoji } from '../eats.js';
import { setPin } from '../pinstore.js';
import { sheet, closeSheet, toast } from '../ui.js';
import { mountMap, mapEngineName } from '../mapkit.js';
import { googleReview, hasAllReviews, loadGoogleReviews } from '../greviews.js';
import { addPlaceFromContent } from './plan.js';

const SOURCES = [['tabelog', '食べログ', 'tb'], ['google', 'Google', 'gg'], ['youtube', 'YouTube', 'yt'], ['instagram', 'Instagram', 'ig']];
const G_MAX = 12; // 구글 리뷰는 한 번에 이 수 이하일 때만 불러온다 (무료 사용량 절약)
const KINDS = [['all', '전체'], ['food', '식당'], ['cafe', '카페·디저트']];
const KIND_COLOR = { food: '#ef4444', cafe: '#a16207' };
const SRC_COLOR = { tabelog: '#f59e0b', google: '#1a73e8', youtube: '#e62117', instagram: '#d6249f' };
let src = 'tabelog', kind = 'all', sort = 'score', gsort = 'count', me = null, map = null, gErr = '';
let region = null, area = 'all'; // region null = 여행지(또는 내 위치)에서 가까운 지역

const igUrl = e => `https://www.instagram.com/explore/tags/${encodeURIComponent(e.instagramTag)}/`;
const gmUrl = e => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.nameJa} ${e.address || ''}`.trim())}`;
const ytThumb = url => { const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/); return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : ''; };
const fmtKm = km => km == null ? '' : km < 1 ? Math.round(km * 1000) + 'm' : km < 100 ? km.toFixed(1) + 'km' : Math.round(km).toLocaleString() + 'km';
const score = e => (e.tabelogScore ? e.tabelogScore.toFixed(2) : '–');
const n0 = n => (n ?? 0).toLocaleString('ko-KR');
const gText = g => g && !g.none ? `★${g.rating?.toFixed(1) ?? '–'} · 리뷰 ${n0(g.count)}` : '구글에서 못 찾음';

function badges(e) {
  const g = googleReview(e.id);
  return `<span class="src tb">${ic('star')} 食べログ ${score(e)} (${n0(e.tabelogReviews)})</span>${g && !g.none ? `<span class="src gm">Google ★${g.rating?.toFixed(1) ?? '–'} (${n0(g.count)})</span>` : ''}${e.youtube ? `<span class="src yt">▶ YouTube</span>` : ''}${e.instagramTag ? `<span class="src ig">IG</span>` : ''}`;
}

// 출처별 목록 한 줄
function row(e, km) {
  const mark = `<span class="eat-mark" style="--c:${KIND_COLOR[e.kind] || KIND_COLOR.food}">${eatEmoji(e)}</span>`;
  if (src === 'youtube') return `<button class="near-row eat yt-row" data-id="${e.id}">
      <span class="yt-thumb" style="background-image:url('${esc(ytThumb(e.youtube.url))}')"><i>▶</i></span>
      <div><b>${esc(e.nameKo)}</b><p class="yt-title">${esc(e.youtube.title)}</p><small>${esc(e.youtube.channel)} · ${esc(areaLabel(e.area))}${km != null ? ' · ' + fmtKm(km) : ''}</small></div></button>`;
  if (src === 'instagram') return `<div class="near-row eat ig-row">${mark}
      <button class="ig-main" data-id="${e.id}"><b>${esc(e.nameKo)}</b><small>${esc(e.genre)} · ${esc(areaLabel(e.area))}${km != null ? ' · ' + fmtKm(km) : ''}</small><span class="ig-tag">#${esc(e.instagramTag)}</span></button>
      <a class="ig-open" href="${esc(igUrl(e))}" target="_blank" rel="noopener" aria-label="인스타그램에서 #${esc(e.instagramTag)} 보기">IG ${ic('chevron')}</a></div>`;
  if (src === 'google') { const g = googleReview(e.id); return `<button class="near-row eat" data-id="${e.id}">${mark}
      <div><b>${esc(e.nameKo)}</b><small>${esc(e.genre)} · ${esc(areaLabel(e.area))}${km != null ? ' · ' + fmtKm(km) : ''}</small>
      <div class="srcs"><span class="src gm">${esc(gText(g))}</span></div></div>
      <em class="g-count">${g && !g.none ? n0(g.count) : '–'}<small>리뷰</small></em></button>`; }
  return `<button class="near-row eat" data-id="${e.id}">${mark}
      <div><b>${esc(e.nameKo)}</b><small>${esc(e.genre)} · ${esc(areaLabel(e.area))}${km != null ? ' · ' + fmtKm(km) : ''} · ${esc(e.nameJa)}</small>
      <div class="srcs"><span class="src tb">${ic('star')} ${score(e)}</span><span class="src tb-r">리뷰 ${n0(e.tabelogReviews)}</span>${e.tabelogAward ? `<span class="src aw">${esc(e.tabelogAward.split(' / ').pop())}</span>` : ''}</div></div>
      <em class="tb-score">${score(e)}</em></button>`;
}

const NOTE = {
  tabelog: `타베로그 점수·리뷰 수 (${EATS_CHECKED} 확인). 3.5 이상이면 현지에서도 평이 좋은 편이에요.`,
  google: '구글 지도의 별점과 리뷰 수예요. 구글 약관상 저장할 수 없어서 열 때마다 구글에서 바로 불러와요 (구역 단위, 하루 사용량 제한 있음).',
  youtube: '이 가게를 직접 소개한 유튜브 영상이 있는 곳만 모았어요. 누르면 영상과 가게 정보를 볼 수 있어요.',
  instagram: '인스타그램은 로그인 없이 게시물 수를 가져올 수 없어서, 가게별 해시태그로 바로 사진을 찾아보게 했어요.',
};

export function renderNearby(root) {
  const trip = currentTrip();
  const places = trip ? trip.places.filter(p => p.lat != null) : [];
  const center = me || (places[0] ? { lat: places[0].lat, lng: places[0].lng } : { lat: 34.9717, lng: 138.3889 });
  const auto = nearestRegion(center);
  const reg = EAT_REGIONS.find(r => r.id === region) || auto || EAT_REGIONS[0];
  if (area !== 'all' && !reg.areas.some(([a]) => a === area)) area = 'all';
  const inTrip = auto?.id === reg.id; // 여행지·내 위치가 이 지역 안이면 거리 표시
  const pool = eatsIn(reg.id).filter(e => area === 'all' || e.area === area);
  const match = (e, k) => (kind === 'all' || e.kind === kind) && (k === 'youtube' ? !!e.youtube : k === 'instagram' ? !!e.instagramTag : true);
  const shown = pool.filter(e => match(e, src));
  const tsort = src === 'tabelog' ? (sort === 'dist' && !inTrip ? 'score' : sort) : inTrip ? 'dist' : 'score';
  const gval = e => { const g = googleReview(e.id); return !g || g.none ? -1 : gsort === 'rating' ? (g.rating || 0) * 1e6 + g.count : g.count; };
  const cmp = src === 'google' ? (a, b) => gval(b.e) - gval(a.e)
    : tsort === 'reviews' ? (a, b) => (b.e.tabelogReviews || 0) - (a.e.tabelogReviews || 0)
    : tsort === 'score' ? (a, b) => (b.e.tabelogScore || 0) - (a.e.tabelogScore || 0)
    : (a, b) => (a.km ?? 0) - (b.km ?? 0);
  const list = shown.map(e => ({ e, km: inTrip ? haversineKm(center, e) : null })).sort(cmp);
  // 구글 탭: 지금 구역만, G_MAX 이하일 때 아직 없는 리뷰를 불러온다
  const gCan = mapEngineName() === 'google', gSmall = shown.length <= G_MAX;
  const gReady = src === 'google' && gCan && gSmall && hasAllReviews(shown);
  if (src === 'google' && gCan && gSmall && !gReady && !gErr) loadGoogleReviews(shown).then(() => renderNearby(root)).catch(err => { console.warn(err); gErr = /quota|RESOURCE_EXHAUSTED|OVER_QUERY/i.test(String(err)) ? '오늘 구글 리뷰 조회 한도를 다 썼어요. 내일 다시 볼 수 있어요.' : '구글 리뷰를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'; renderNearby(root); });
  const areaCount = a => eatsIn(reg.id).filter(e => (a === 'all' || e.area === a) && match(e, src)).length;

  root.innerHTML = `<div class="nearby">
    <div class="near-map" id="nmap"></div>
    <div class="near-chips">${KINDS.map(([k, l]) => `<button class="chip ${k === kind ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="locate" id="loc" aria-label="내 위치">${ic('locate')}</button>
    <section class="near-sheet">
      <div class="reg-row"><div class="seg">${EAT_REGIONS.map(r => `<button data-reg="${r.id}" class="${r.id === reg.id ? 'on' : ''}">${esc(r.label)}</button>`).join('')}</div>
        <small class="muted">${inTrip ? (me ? '내 위치 기준' : trip ? esc(trip.title) + ' 기준' : '') : ''}</small></div>
      ${places.length && inTrip ? `<p class="map-legend"><i></i> 파란 점은 ${trip ? esc(trip.title) + '에 ' : ''}넣어 둔 내 일정 장소예요</p>` : ''}
      <div class="area-chips">${[['all', '전체 구역'], ...reg.areas].map(([a, l]) => `<button class="chip ${a === area ? 'on' : ''}" data-area="${a}">${esc(l)} <small>${areaCount(a)}</small></button>`).join('')}</div>
      <div class="src-tabs" role="tablist">${SOURCES.map(([k, l, c]) => `<button role="tab" class="${k === src ? 'on' : ''} ${c}" data-src="${k}" aria-selected="${k === src}">${l}<small>${pool.filter(e => match(e, k)).length}</small></button>`).join('')}</div>
      <div class="sec-hd"><h2>${area === 'all' ? esc(reg.label) : esc(areaLabel(area))} 맛집</h2>
        ${src === 'tabelog' ? `<div class="seg sm"><button data-s="score" class="${tsort === 'score' ? 'on' : ''}">점수순</button><button data-s="reviews" class="${tsort === 'reviews' ? 'on' : ''}">리뷰순</button>${inTrip ? `<button data-s="dist" class="${tsort === 'dist' ? 'on' : ''}">거리순</button>` : ''}</div>`
          : src === 'google' ? `<div class="seg sm"><button data-gs="count" class="${gsort === 'count' ? 'on' : ''}">리뷰순</button><button data-gs="rating" class="${gsort === 'rating' ? 'on' : ''}">별점순</button></div>`
          : `<span class="muted small">${inTrip ? '거리순' : '점수순'}</span>`}</div>
      <p class="muted small src-note">${NOTE[src]}</p>
      ${src === 'google' && !gCan ? '<p class="muted pad">구글 지도 키가 있을 때만 쓸 수 있어요. 내 정보 → 지도 설정을 확인해 주세요.</p>'
        : src === 'google' && !gSmall ? `<p class="g-hint">${ic('pin')} 위에서 <b>구역</b>을 하나 고르면 그 구역의 구글 리뷰를 불러와요.<small>구글 리뷰는 무료 사용량이 적어서 ${G_MAX}곳 이하씩만 불러와요.</small></p>`
        : src === 'google' && gErr ? `<p class="muted pad">${esc(gErr)}</p>`
        : src === 'google' && !gReady ? `<p class="muted pad">구글 리뷰를 불러오는 중…</p>`
        : list.map(({ e, km }) => row(e, km)).join('') || `<p class="muted pad">${pool.length ? '이 조건의 맛집이 없어요' : '이 지역은 아직 맛집 데이터가 없어요.'}</p>`}
    </section></div>`;

  if (map) { map.destroy(); map = null; }
  map = mountMap(root.querySelector('#nmap'), m => {
    // 파란 점: 지금 여행에 넣어 둔 장소
    places.forEach(p => m.dot([p.lat, p.lng], '#5b5ceb', p.name, false,
      `<div class="pp-card"><span class="pp-emo pp-mine">📍</span><div><b>${esc(p.name)}</b><small>내 일정 장소${trip ? ' · ' + esc(trip.title) : ''}</small></div></div>`));
    // 핀을 누르면 말풍선 카드, 카드의 '자세히'를 누르면 상세 시트
    (src === 'google' && !gReady ? [] : shown).forEach(e => m.emoji([e.lat, e.lng], eatEmoji(e), SRC_COLOR[src], `${e.nameKo} · ${e.genre} · 食べログ ${score(e)}`,
      `<div class="pp-card"><span class="pp-emo">${eatEmoji(e)}</span><div><b>${esc(e.nameKo)}</b><small>${src === 'google' ? esc(gText(googleReview(e.id))) : `${esc(e.genre)} · 食べログ ${score(e)}`}${e.youtube ? ' · ▶' : ''}</small></div></div>
       <button class="pp-more" data-eat="${e.id}">자세히 보기 ›</button>`));
    if (me) m.dot([me.lat, me.lng], '#3b82f6', '내 위치', true);
    if (inTrip && area === 'all') m.view([center.lat, center.lng], 13);
    else if (shown.length) m.fit(shown.map(e => [e.lat, e.lng]));
    else m.view([reg.center.lat, reg.center.lng], 12);
  });

  // 선택한 구역 칩이 가로 스크롤 밖에 있으면 보이게
  const ac = root.querySelector('.area-chips'), on = ac?.querySelector('.on');
  if (ac && on) ac.scrollLeft = on.offsetLeft - (ac.clientWidth - on.offsetWidth) / 2;
  // 지도 말풍선의 '자세히 보기' (Leaflet·구글 말풍선 모두 root 안에 그려짐)
  root.onclick = ev => { const a = ev.target.closest('[data-eat]'); if (a) { ev.preventDefault(); eatSheet(EATS.find(e => e.id === a.dataset.eat)); } };
  root.querySelectorAll('[data-reg]').forEach(b => b.onclick = () => { region = b.dataset.reg; area = 'all'; renderNearby(root); });
  root.querySelectorAll('[data-area]').forEach(b => b.onclick = () => { area = b.dataset.area; gErr = ''; renderNearby(root); });
  root.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { src = b.dataset.src; gErr = ''; renderNearby(root); });
  root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; renderNearby(root); });
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { sort = b.dataset.s; renderNearby(root); });
  root.querySelectorAll('[data-gs]').forEach(b => b.onclick = () => { gsort = b.dataset.gs; renderNearby(root); });
  root.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => eatSheet(EATS.find(e => e.id === b.dataset.id)));
  root.querySelector('#loc').onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => { me = { lat: p.coords.latitude, lng: p.coords.longitude }; region = null; renderNearby(root); }, () => toast('위치 권한이 없어 여행지 기준으로 보여드려요'), { timeout: 8000 });
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
