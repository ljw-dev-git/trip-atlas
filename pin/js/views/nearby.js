// 내 주변: 타베로그·구글 기준 맛집 지도 + 점수/리뷰/거리순 목록 (유튜브·인스타는 상세 시트의 부연 링크)
import { haversineKm, esc, uid } from '../../../src/util.js';
import { getTrip } from '../../../src/store.js';
import { ic } from '../icons.js';
import { currentTrip } from '../current.js';
import { EATS, EATS_CHECKED, EAT_REGIONS, eatsIn, nearestRegion, areaLabel, eatEmoji } from '../eats.js';
import { setPin } from '../pinstore.js';
import { sheet, closeSheet, toast } from '../ui.js';
import { mountMap, mapEngineName } from '../mapkit.js';
import { cachedGPlaces, loadGPlaces, areaCircle } from '../gplaces.js';
import { addPlaceFromContent } from './plan.js';

// 유튜브·인스타그램은 탭 대신 상세 시트의 부연 링크로만 보여 준다
const SOURCES = [['tabelog', '食べログ', 'tb'], ['google', 'Google', 'gg']];
const KINDS = [['all', '전체'], ['food', '식당'], ['cafe', '카페·디저트']];
const KIND_COLOR = { food: '#ef4444', cafe: '#a16207' };
const SRC_COLOR = { tabelog: '#f59e0b', google: '#1a73e8' };
let src = 'tabelog', kind = 'all', sort = 'score', gsort = 'count', me = null, map = null, gErr = '';
let region = null, area = 'all'; // region null = 여행지(또는 내 위치)에서 가까운 지역

const igUrl = e => `https://www.instagram.com/explore/tags/${encodeURIComponent(e.instagramTag)}/`;
const gmUrl = e => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.nameJa} ${e.address || ''}`.trim())}`;
const ytThumb = url => { const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/); return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : ''; };
const fmtKm = km => km == null ? '' : km < 1 ? Math.round(km * 1000) + 'm' : km < 100 ? km.toFixed(1) + 'km' : Math.round(km).toLocaleString() + 'km';
const score = e => (e.tabelogScore ? e.tabelogScore.toFixed(2) : '–');
const n0 = n => (n ?? 0).toLocaleString('ko-KR');
const gStar = g => `★${g.rating != null ? g.rating.toFixed(1) : '–'} · 리뷰 ${n0(g.count)}`;
const G_TYPE_EMOJI = { ramen_restaurant: '🍜', sushi_restaurant: '🍣', japanese_restaurant: '🍱', barbecue_restaurant: '🥩', steak_house: '🥩', seafood_restaurant: '🐟', chinese_restaurant: '🥡', indian_restaurant: '🍛', italian_restaurant: '🍝', pizza_restaurant: '🍕', hamburger_restaurant: '🍔', korean_restaurant: '🥘', thai_restaurant: '🍜', vietnamese_restaurant: '🍜', french_restaurant: '🍳', bar: '🍶', pub: '🍶', cafe: '☕', coffee_shop: '☕', bakery: '🥐', dessert_shop: '🍰', ice_cream_shop: '🍦', tea_house: '🍵',
  japanese_izakaya_restaurant: '🍶', japanese_curry_restaurant: '🍛', tonkatsu_restaurant: '🐷', yakiniku_restaurant: '🥩', yakitori_restaurant: '🍗', noodle_shop: '🍜', chinese_noodle_restaurant: '🍜', hot_pot_restaurant: '🍲', korean_barbecue_restaurant: '🥩', dumpling_restaurant: '🥟', dim_sum_restaurant: '🥟', donut_shop: '🍩', coffee_roastery: '☕', coffee_stand: '☕', dessert_restaurant: '🍰', confectionery: '🍡', chocolate_shop: '🍫', soup_restaurant: '🍲', chicken_restaurant: '🍗' };
const gEmoji = g => G_TYPE_EMOJI[g.type] || eatEmoji({ genre: g.typeName, kind: /cafe|coffee|bakery|dessert|tea|confection|donut|chocolate|ice_cream/.test(g.type) ? 'cafe' : 'food' });
// 구글 장소와 같은 가게가 우리 타베로그 목록에 있으면 연결: 150m 이내 + 이름이 비슷할 때만 (거리만 보면 옆 가게가 잘못 붙음)
const bigrams = t => { const x = String(t).replace(/[\s·・()（）\-]/g, '').toLowerCase(); const out = []; for (let i = 0; i < x.length - 1; i++) out.push(x.slice(i, i + 2)); return out.length ? out : [x]; };
const dice = (a, b) => { const A = bigrams(a), B = bigrams(b); let hit = 0; const pool = [...B]; for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } } return (2 * hit) / (A.length + B.length); };
const tbMatch = g => EATS.filter(e => haversineKm(e, g) < 0.15)
  .map(e => ({ e, sim: Math.max(dice(g.name, e.nameKo), dice(g.name, e.nameJa)) })).filter(x => x.sim >= 0.4)
  .sort((a, b) => b.sim - a.sim)[0]?.e;

function badges(e) {
  return `<span class="src tb">${ic('star')} 食べログ ${score(e)} (${n0(e.tabelogReviews)})</span>${e.youtube ? `<span class="src yt">▶ YouTube</span>` : ''}${e.instagramTag ? `<span class="src ig">IG</span>` : ''}`;
}

// 구글 탭 한 줄 (구글이 고른 장소)
function gRow(g, km) {
  const tb = tbMatch(g);
  return `<button class="near-row eat" data-gp="${esc(g.id)}"><span class="eat-mark" style="--c:#1a73e8">${gEmoji(g)}</span>
    <div><b>${esc(g.name)}</b><small>${esc(g.typeName || '음식점')}${km != null ? ' · ' + fmtKm(km) : ''}</small>
    <div class="srcs"><span class="src gm">${esc(gStar(g))}</span>${tb ? `<span class="src tb">${ic('star')} 食べログ ${score(tb)}</span>` : ''}</div></div>
    <em class="g-count">${n0(g.count)}<small>리뷰</small></em></button>`;
}

// 타베로그 탭 한 줄
function row(e, km) {
  const mark = `<span class="eat-mark" style="--c:${KIND_COLOR[e.kind] || KIND_COLOR.food}">${eatEmoji(e)}</span>`;
  return `<button class="near-row eat" data-id="${e.id}">${mark}
      <div><b>${esc(e.nameKo)}</b><small>${esc(e.genre)} · ${esc(areaLabel(e.area))}${km != null ? ' · ' + fmtKm(km) : ''} · ${esc(e.nameJa)}</small>
      <div class="srcs"><span class="src tb">${ic('star')} ${score(e)}</span><span class="src tb-r">리뷰 ${n0(e.tabelogReviews)}</span>${e.tabelogAward ? `<span class="src aw">${esc(e.tabelogAward.split(' / ').pop())}</span>` : ''}</div></div>
      <em class="tb-score">${score(e)}</em></button>`;
}

const NOTE = {
  tabelog: `타베로그 점수·리뷰 수 (${EATS_CHECKED} 확인). 3.5 이상이면 현지에서도 평이 좋은 편이에요.`,
  google: '구글이 이 구역에서 인기 있다고 고른 곳(최대 20곳)을 리뷰 수 순으로 보여 줘요. 타베로그 목록과 별개이고, 같은 가게면 食べログ 점수를 함께 표시해요. 구글 약관상 저장할 수 없어 열 때마다 새로 불러와요.',
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
  const match = e => kind === 'all' || e.kind === kind;
  const shown = pool.filter(match);
  const tsort = src === 'tabelog' ? (sort === 'dist' && !inTrip ? 'score' : sort) : inTrip ? 'dist' : 'score';
  const cmp = tsort === 'reviews' ? (a, b) => (b.e.tabelogReviews || 0) - (a.e.tabelogReviews || 0)
    : tsort === 'score' ? (a, b) => (b.e.tabelogScore || 0) - (a.e.tabelogScore || 0)
    : (a, b) => (a.km ?? 0) - (b.km ?? 0);
  const list = shown.map(e => ({ e, km: inTrip ? haversineKm(center, e) : null })).sort(cmp);
  // 구글 탭: 구역 하나를 골랐을 때만 그 구역의 구글 인기 장소를 불러온다 (지역에 구역이 하나뿐이면 그것)
  const gCan = mapEngineName() === 'google';
  const gArea = area !== 'all' ? area : reg.areas.length === 1 ? reg.areas[0][0] : null;
  const gList = gArea ? cachedGPlaces(gArea, kind) : null;
  if (src === 'google' && gCan && gArea && !gList && !gErr) {
    const areaEats = eatsIn(reg.id).filter(e => e.area === gArea);
    loadGPlaces(gArea, kind, areaCircle(areaEats)).then(() => renderNearby(root)).catch(err => {
      console.warn(err);
      gErr = /quota|RESOURCE_EXHAUSTED|OVER_QUERY|429/i.test(String(err)) ? '오늘 구글 조회 한도를 다 썼어요. 내일 다시 볼 수 있어요.' : '구글 인기 맛집을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      renderNearby(root);
    });
  }
  const gRows = (gList || []).map(g => ({ g, km: inTrip ? haversineKm(center, g) : null }))
    .sort((a, b) => gsort === 'rating' ? ((b.g.rating || 0) - (a.g.rating || 0)) || (b.g.count - a.g.count) : b.g.count - a.g.count);
  const areaCount = a => eatsIn(reg.id).filter(e => (a === 'all' || e.area === a) && match(e)).length;

  root.innerHTML = `<div class="nearby">
    <div class="near-map" id="nmap"></div>
    <div class="near-chips">${KINDS.map(([k, l]) => `<button class="chip ${k === kind ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="locate" id="loc" aria-label="내 위치">${ic('locate')}</button>
    <section class="near-sheet">
      <div class="reg-row"><div class="seg">${EAT_REGIONS.map(r => `<button data-reg="${r.id}" class="${r.id === reg.id ? 'on' : ''}">${esc(r.label)}</button>`).join('')}</div>
        <small class="muted">${inTrip ? (me ? '내 위치 기준' : trip ? esc(trip.title) + ' 기준' : '') : ''}</small></div>
      ${places.length && inTrip ? `<p class="map-legend"><i></i> 파란 점은 ${trip ? esc(trip.title) + '에 ' : ''}넣어 둔 내 일정 장소예요</p>` : ''}
      <div class="area-chips">${[['all', '전체 구역'], ...reg.areas].map(([a, l]) => `<button class="chip ${a === area ? 'on' : ''}" data-area="${a}">${esc(l)} <small>${areaCount(a)}</small></button>`).join('')}</div>
      <div class="src-tabs" role="tablist">${SOURCES.map(([k, l, c]) => `<button role="tab" class="${k === src ? 'on' : ''} ${c}" data-src="${k}" aria-selected="${k === src}">${l}<small>${k === 'google' ? (gList ? gList.length : '–') : pool.filter(match).length}</small></button>`).join('')}</div>
      <div class="sec-hd"><h2>${area === 'all' ? esc(reg.label) : esc(areaLabel(area))} 맛집</h2>
        ${src === 'tabelog' ? `<div class="seg sm"><button data-s="score" class="${tsort === 'score' ? 'on' : ''}">점수순</button><button data-s="reviews" class="${tsort === 'reviews' ? 'on' : ''}">리뷰순</button>${inTrip ? `<button data-s="dist" class="${tsort === 'dist' ? 'on' : ''}">거리순</button>` : ''}</div>`
          : src === 'google' ? `<div class="seg sm"><button data-gs="count" class="${gsort === 'count' ? 'on' : ''}">리뷰순</button><button data-gs="rating" class="${gsort === 'rating' ? 'on' : ''}">별점순</button></div>`
          : ''}</div>
      <p class="muted small src-note">${NOTE[src]}</p>
      ${src === 'google' && !gCan ? '<p class="muted pad">구글 지도 키가 있을 때만 쓸 수 있어요. 내 정보 → 지도 설정을 확인해 주세요.</p>'
        : src === 'google' && !gArea ? `<p class="g-hint">${ic('pin')} 위에서 <b>구역</b>을 하나 고르면 그 구역의 구글 인기 맛집을 불러와요.<small>구역 하나에 한 번씩만 불러와서 무료 사용량 안에서 써요.</small></p>`
        : src === 'google' && gErr ? `<p class="muted pad">${esc(gErr)}</p>`
        : src === 'google' && !gList ? `<p class="muted pad">구글 인기 맛집을 불러오는 중…</p>`
        : src === 'google' ? gRows.map(({ g, km }) => gRow(g, km)).join('') || '<p class="muted pad">구글에서 찾은 곳이 없어요</p>'
        : list.map(({ e, km }) => row(e, km)).join('') || `<p class="muted pad">${pool.length ? '이 조건의 맛집이 없어요' : '이 지역은 아직 맛집 데이터가 없어요.'}</p>`}
    </section></div>`;

  if (map) { map.destroy(); map = null; }
  map = mountMap(root.querySelector('#nmap'), m => {
    // 파란 점: 지금 여행에 넣어 둔 장소
    places.forEach(p => m.dot([p.lat, p.lng], '#5b5ceb', p.name, false,
      `<div class="pp-card"><span class="pp-emo pp-mine">📍</span><div><b>${esc(p.name)}</b><small>내 일정 장소${trip ? ' · ' + esc(trip.title) : ''}</small></div></div>`));
    // 핀을 누르면 말풍선 카드, 카드의 '자세히'를 누르면 상세 시트
    if (src === 'google') (gList || []).forEach(g => m.emoji([g.lat, g.lng], gEmoji(g), SRC_COLOR.google, `${g.name} · ${gStar(g)}`,
      `<div class="pp-card"><span class="pp-emo">${gEmoji(g)}</span><div><b>${esc(g.name)}</b><small>${esc(gStar(g))}</small></div></div>
       <button class="pp-more" data-gp="${esc(g.id)}">자세히 보기 ›</button>`));
    else shown.forEach(e => m.emoji([e.lat, e.lng], eatEmoji(e), SRC_COLOR.tabelog, `${e.nameKo} · ${e.genre} · 食べログ ${score(e)}`,
      `<div class="pp-card"><span class="pp-emo">${eatEmoji(e)}</span><div><b>${esc(e.nameKo)}</b><small>${esc(e.genre)} · 食べログ ${score(e)}${e.youtube ? ' · ▶' : ''}</small></div></div>
       <button class="pp-more" data-eat="${e.id}">자세히 보기 ›</button>`));
    if (me) m.dot([me.lat, me.lng], '#3b82f6', '내 위치', true);
    const pts = src === 'google' ? (gList || []).map(g => [g.lat, g.lng]) : shown.map(e => [e.lat, e.lng]);
    if (inTrip && area === 'all' && src !== 'google') m.view([center.lat, center.lng], 13);
    else if (pts.length) m.fit(pts);
    else m.view([reg.center.lat, reg.center.lng], 12);
  });

  // 선택한 구역 칩이 가로 스크롤 밖에 있으면 보이게
  const ac = root.querySelector('.area-chips'), on = ac?.querySelector('.on');
  if (ac && on) ac.scrollLeft = on.offsetLeft - (ac.clientWidth - on.offsetWidth) / 2;
  // 지도 말풍선의 '자세히 보기' (Leaflet·구글 말풍선 모두 root 안에 그려짐)
  root.onclick = ev => {
    const a = ev.target.closest('[data-eat]'); if (a) { ev.preventDefault(); eatSheet(EATS.find(e => e.id === a.dataset.eat)); return; }
    const b = ev.target.closest('[data-gp]'); if (b) { ev.preventDefault(); gSheet((gList || []).find(g => g.id === b.dataset.gp)); }
  };
  root.querySelectorAll('[data-reg]').forEach(b => b.onclick = () => { region = b.dataset.reg; area = 'all'; renderNearby(root); });
  root.querySelectorAll('[data-area]').forEach(b => b.onclick = () => { area = b.dataset.area; gErr = ''; renderNearby(root); });
  root.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { src = b.dataset.src; gErr = ''; renderNearby(root); });
  root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; gErr = ''; renderNearby(root); });
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { sort = b.dataset.s; renderNearby(root); });
  root.querySelectorAll('[data-gs]').forEach(b => b.onclick = () => { gsort = b.dataset.gs; renderNearby(root); });
  root.querySelectorAll('button[data-id]').forEach(b => b.onclick = () => eatSheet(EATS.find(e => e.id === b.dataset.id)));
  root.querySelector('#loc').onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => { me = { lat: p.coords.latitude, lng: p.coords.longitude }; region = null; renderNearby(root); }, () => toast('위치 권한이 없어 여행지 기준으로 보여드려요'), { timeout: 8000 });
  };
}

// 구글 장소 상세: 구글 지도 링크, 같은 가게가 타베로그 목록에 있으면 그 상세로, 저장·일정 추가
function gSheet(g) {
  if (!g) return;
  const trip = currentTrip(), tb = tbMatch(g);
  const sh = sheet(`<div class="eat-hd"><span class="muted small">${esc(g.typeName || '음식점')}</span>
      <div class="srcs"><span class="src gm">Google ${esc(gStar(g))}</span>${tb ? `<span class="src tb">${ic('star')} 食べログ ${score(tb)} (${n0(tb.tabelogReviews)})</span>` : ''}</div></div>
    <div class="link-list">
      ${g.url ? `<a href="${esc(g.url)}" target="_blank" rel="noopener"><span class="src gm">${ic('map')}</span> 구글 지도에서 리뷰·사진 보기 ${ic('chevron')}</a>` : ''}
      ${tb ? `<a href="#/nearby" data-eat="${tb.id}"><span class="src tb">食べログ</span> ${esc(tb.nameKo)} 정보 보기 ${ic('chevron')}</a>` : ''}
    </div>
    <div class="two"><button class="btn" id="save">${ic('bookmark')} 콘텐츠에 저장</button>${trip ? `<button class="btn primary" id="plan">${ic('plus')} 일정에 추가</button>` : ''}</div>`, { title: g.name });
  const tbl = sh.querySelector('[data-eat]'); if (tbl) tbl.onclick = ev => { ev.preventDefault(); closeSheet(); eatSheet(tb); };
  const isCafe = /cafe|coffee|bakery|dessert|tea|confection|donut|chocolate|ice_cream/.test(g.type);
  const asContent = () => ({ url: g.url, title: `${g.name} · ${g.typeName || '음식점'}`, category: isCafe ? '카페' : '맛집', placeName: g.name, lat: g.lat, lng: g.lng });
  sh.querySelector('#save').onclick = () => {
    setPin(p => p.contents.unshift(Object.assign({ id: uid(), created: Date.now(), handle: '', tags: [], folderId: p.folders[0].id, platform: 'map', note: '구글 지도 인기 맛집' }, asContent())));
    closeSheet(); toast('콘텐츠에 저장했어요');
  };
  const pb = sh.querySelector('#plan');
  if (pb) pb.onclick = () => dayPick(trip, asContent());
}

function dayPick(trip, content) {
  const t = getTrip(trip.id);
  const d = sheet(`<div class="opt-list">${t.days.map((day, i) => `<button class="opt" data-d="${i}">Day ${i + 1} · ${day.date.slice(5).replace('-', '.')} <small>${day.stops.length}곳</small></button>`).join('')}</div>`, { title: `'${content.placeName}' 일정에 추가` });
  d.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { addPlaceFromContent(getTrip(t.id), content, +b.dataset.d); closeSheet(); toast(`Day ${+b.dataset.d + 1}에 추가했어요`); });
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
      ${e.youtube ? `<a class="yt-link" href="${esc(e.youtube.url)}" target="_blank" rel="noopener"><span class="yt-mini" style="background-image:url('${esc(ytThumb(e.youtube.url))}')"><i>▶</i></span> <span class="ell">${esc(e.youtube.title)}<small>${esc(e.youtube.channel)}</small></span> ${ic('chevron')}</a>` : ''}
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
