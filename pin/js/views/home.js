// 홈: 배너 캐러셀, 퀵메뉴 8개, 지역 선택, 다가오는 여행, 특가 항공, 주변 맛집, 저장한 핫플
import { esc, fmtRange, todayISO, daysBetween } from '../../../src/util.js';
import { tripStatus } from '../../../src/store.js';
import { imgUrl } from '../../../src/images.js';
import { ic, tileIcon } from '../icons.js';
import { pin, setPin } from '../pinstore.js';
import { currentTrip } from '../current.js';
import { REGIONS, FLIGHTS, AIRPORTS, pctOff, GUIDES } from '../data.js';
import { eatsNear } from '../eats.js';
import { SAMPLE_DEALS } from '../features.js';
import { sheet, closeSheet, won, sample } from '../ui.js';

const QUICK = trip => [
  ...(SAMPLE_DEALS ? [['#/flights', '급락항공', 'plane', '#ef4444'], ['#/hotels', '숙소알림', 'bell', '#f59e0b']] : []), ['#/plan', '여행일정', 'calendar', '#7c6cf2'], ['#/nearby', '주변 맛집', 'pin', '#f97316'],
  [trip ? `#/plan/${encodeURIComponent(trip.id)}/money` : '#/plan', '가계부·정산', 'wallet', '#ec4899'], ['#/chat', 'AI 도우미', 'spark', '#22a06b'], ['#/contents', '핫플 저장', 'bookmark', '#e11d48'], ['#/membership', '내 정보', 'users', '#0ea5a4'],
];

let slide = 0, timer = null;

export function renderHome(root) {
  const s = pin();
  const region = s.region;
  const inRegion = r => region === 'all' || r === region;
  const trip = currentTrip();
  const flights = !SAMPLE_DEALS ? [] : FLIGHTS.filter(f => inRegion(f.region)).sort((a, b) => pctOff(b) - pctOff(a)).slice(0, 6);
  const base = trip?.places.find(p => p.lat != null);
  const eats = base ? eatsNear(base).sort((a, b) => (b.tabelogScore || 0) - (a.tabelogScore || 0)).slice(0, 4) : [];
  const best = flights[0];

  const slides = [];
  if (trip) {
    const st = tripStatus(trip); const dd = trip.startDate ? daysBetween(todayISO(), trip.startDate) : null;
    slides.push({ href: `#/plan/${encodeURIComponent(trip.id)}`, img: imgUrl(trip.coverImage), kicker: st === 'ongoing' ? '여행 중' : dd != null && dd > 0 ? `D-${dd}` : '내 여행', title: trip.title, sub: fmtRange(trip.startDate, trip.endDate) });
  }
  if (best) slides.push({ href: '#/flights', grad: '135deg,#5b5ceb,#8b5cf6', kicker: 'pintrip SPECIAL', title: `${AIRPORTS[best.to]} 왕복 최대 ${pctOff(best)}% 할인`, sub: `${won(best.now)}~ · 자세히 보기 >` });
  if (eats.length) slides.push({ href: '#/nearby', grad: '135deg,#f97316,#ef4444', kicker: '주변 맛집', title: `${eats[0].nameKo} · 食べログ ${eats[0].tabelogScore.toFixed(2)}`, sub: `${trip.title} 근처 맛집 ${eatsNear(base).length}곳 보기 >` });

  root.innerHTML = `
  <section class="hero" aria-roledescription="carousel">
    <div class="hero-track" id="track" style="transform:translateX(-${(slide % slides.length) * 100}%)">
      ${slides.map(sl => `<a class="hero-slide" href="${sl.href}" style="${sl.img ? `background-image:linear-gradient(180deg,rgba(15,18,40,.05),rgba(15,18,40,.55)),url('${esc(sl.img)}')` : `background:linear-gradient(${sl.grad})`}">
        <span class="hk">${esc(sl.kicker)}</span><strong>${esc(sl.title)}</strong><span class="hs">${esc(sl.sub)}</span></a>`).join('')}
    </div>
    <div class="hero-dots">${slides.map((_, i) => `<button aria-label="${i + 1}번째 배너" class="${i === slide % slides.length ? 'on' : ''}" data-i="${i}"></button>`).join('')}</div>
  </section>

  <section class="quick${SAMPLE_DEALS ? '' : ' q3'}">${QUICK(trip).map(([href, label, icon, color]) => `<a href="${href}">${tileIcon(icon, color)}<span>${label}</span></a>`).join('')}</section>

  ${SAMPLE_DEALS ? `<div class="region-row">
    <button class="region-btn" id="region">${ic('globe')}<b>${REGIONS.find(r => r.id === region).label}</b>${ic('down')}</button>
    ${s.regionTipSeen ? '' : '<span class="tip">원하는 지역으로 변경할 수 있어요</span>'}
  </div>` : '<div class="q3-gap"></div>'}

  ${trip ? tripCard(trip) : `<a class="card empty-trip" href="#/plan">${ic('plus')} 첫 여행 일정을 만들어 보세요</a>`}

  ${SAMPLE_DEALS ? `<section class="sec">
    <div class="sec-hd"><h2>급락 항공권</h2>${sample()}<a href="#/flights">전체보기 ${ic('chevron')}</a></div>
    <div class="hscroll">${flights.length ? flights.map(f => `<a class="fl-mini" href="#/flights">
      <div class="r"><b>${AIRPORTS[f.from]}</b>${ic('plane')}<b>${AIRPORTS[f.to]}</b></div>
      <div class="d">왕복 ${f.nights}박 · ${f.out.slice(5).replace('-', '.')}~</div>
      <div class="p"><s>${won(f.was)}</s><strong>${won(f.now)}~</strong><em>${pctOff(f)}%↓</em></div></a>`).join('') : '<p class="muted pad">이 지역 특가가 없어요</p>'}</div>
  </section>` : ''}

  ${eats.length ? `<section class="sec">
    <div class="sec-hd"><h2>주변 맛집 TOP</h2><a href="#/nearby">전체보기 ${ic('chevron')}</a></div>
    <div class="grid2">${eats.map(e => `<a class="cp-mini" href="#/nearby"><div><b>${esc(e.nameKo)}</b><small>${esc(e.genre)}</small></div><em>食べログ ${e.tabelogScore.toFixed(2)}</em></a>`).join('')}</div>
  </section>` : ''}

  ${s.contents.length ? `<section class="sec"><div class="sec-hd"><h2>저장한 핫플</h2><a href="#/contents">전체보기 ${ic('chevron')}</a></div>
    <div class="hscroll">${s.contents.slice(0, 8).map(c => `<a class="hot-mini" href="#/contents"><span class="thumb" style="${c.thumb ? `background-image:url('${esc(c.thumb)}')` : `--h:${(c.title.length * 37) % 360}`}">${c.thumb ? '' : esc(c.title.slice(0, 1))}</span><b>${esc(c.title)}</b><small>${esc(c.placeName || c.category || '')}</small></a>`).join('')}</div></section>` : ''}

  ${SAMPLE_DEALS ? `<section class="sec">
    <div class="sec-hd"><h2>여행 가이드</h2></div>
    <div class="list">${GUIDES.filter(g => inRegion(g.region)).map(g => `<div class="guide-row"><span class="chip">${esc(g.tag)}</span><b>${esc(g.title)}</b><small>${g.mins}분</small></div>`).join('') || '<p class="muted">이 지역 가이드가 아직 없어요</p>'}</div>
  </section>` : ''}
  <p class="foot-note">${SAMPLE_DEALS ? '항공·숙소 가격은 실제 판매처와 연결되지 않은 샘플입니다. ' : ''}일정·가계부는 Trip Atlas와 같은 기기 저장소를 함께 씁니다. <a href="../">Trip Atlas 열기</a></p>`;

  // 캐러셀
  const track = root.querySelector('#track'), dots = root.querySelectorAll('.hero-dots button');
  const go = i => { slide = (i + slides.length) % slides.length; track.style.transform = `translateX(-${slide * 100}%)`; dots.forEach((d, j) => d.classList.toggle('on', j === slide)); };
  dots.forEach(d => d.onclick = () => go(+d.dataset.i));
  clearInterval(timer); timer = setInterval(() => { if (!document.body.contains(track)) return clearInterval(timer); go(slide + 1); }, 4500);
  let x0 = null;
  track.addEventListener('pointerdown', e => { x0 = e.clientX; });
  track.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) { e.preventDefault(); go(slide + (dx < 0 ? 1 : -1)); } });
  track.addEventListener('click', e => { if (track.dataset.swiped) e.preventDefault(); });

  const rb = root.querySelector('#region');
  if (rb) rb.onclick = () => {
    const sh = sheet(`<div class="opt-list">${REGIONS.map(r => `<button class="opt ${r.id === region ? 'on' : ''}" data-r="${r.id}">${esc(r.label)}${r.id === region ? ic('check') : ''}</button>`).join('')}</div>`, { title: '지역 선택' });
    sh.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { setPin(p => { p.region = b.dataset.r; p.regionTipSeen = true; }); closeSheet(); });
  };
}

function tripCard(t) {
  const st = tripStatus(t);
  const dd = t.startDate ? daysBetween(todayISO(), t.startDate) : null;
  const badge = st === 'ongoing' ? '여행 중' : st === 'done' ? '다녀온 여행' : dd != null ? `D-${dd}` : '날짜 미정';
  const stops = t.days.reduce((n, d) => n + d.stops.length, 0);
  return `<a class="card trip-card" href="#/plan/${encodeURIComponent(t.id)}">
    <span class="tc-img" style="${t.coverImage ? `background-image:url('${esc(imgUrl(t.coverImage, 'thumb'))}')` : ''}"></span>
    <div class="tc-body"><span class="badge">${badge}</span><b>${esc(t.title)}</b><small>${esc(fmtRange(t.startDate, t.endDate))}</small><small>장소 ${t.places.length} · 일정 ${stops}곳 · 지출 ${t.expenses.filter(e => !e.planned).length}건</small></div>${ic('chevron')}</a>`;
}
