// 숙소 알림: 원하는 숙소의 1박 평균가 추이(최고·현재·최저) 그래프 + 목표가 이하 알림
import { esc, todayISO, addDays, daysBetween } from '../../../src/util.js';
import { ic } from '../icons.js';
import { pin, setPin, checkWatches } from '../pinstore.js';
import { HOTELS, REGIONS, priceHistory, priceStats } from '../data.js';
import { subHeader, won, sample, toast } from '../ui.js';

export function renderHotels(root) {
  const s = pin();
  const region = s.region;
  const watched = s.watches.map(w => ({ w, h: HOTELS.find(x => x.id === w.hotelId) })).filter(x => x.h);
  const others = HOTELS.filter(h => region === 'all' || h.region === region);
  const row = (h, w) => {
    const checkIn = w ? w.checkIn : addDays(todayISO(), 30);
    const { now, lo } = priceStats(priceHistory(h, checkIn));
    const hit = w && now.price <= w.target;
    return `<a class="ht-row" href="#/hotels/${h.id}"><span class="ht-img" style="--h:${h.hue}">${esc(h.name.slice(0, 1))}</span>
      <div><b>${esc(h.name)}</b><small>${esc(h.area)} · ${'★'.repeat(h.stars)}</small>${w ? `<small class="${hit ? 'pos' : ''}">목표 ${won(w.target)} ${hit ? '· 도달!' : `· ${won(now.price - w.target)} 남음`}</small>` : `<small>최저 ${won(lo.price)}</small>`}</div>
      <span class="ht-p"><strong>${won(now.price)}</strong><small>/박~</small></span></a>`;
  };
  root.innerHTML = `${subHeader('숙소 알림')}
  <div class="banner-alert">${ic('bell')}<div><b>역대 최저가 알림</b><p>원하는 숙소를 원하는 가격에. 목표가 이하로 내려가면 알려드려요.</p></div></div>
  ${watched.length ? `<section class="sec"><div class="sec-hd"><h2>알림 받는 숙소</h2></div><div class="list">${watched.map(({ w, h }) => row(h, w)).join('')}</div></section>` : ''}
  <section class="sec"><div class="sec-hd"><h2>${REGIONS.find(r => r.id === region).label} 숙소</h2>${sample('샘플 시세')}</div><div class="list">${others.map(h => row(h, s.watches.find(w => w.hotelId === h.id))).join('')}</div></section>`;
}

export function renderHotel(root, id) {
  const h = HOTELS.find(x => x.id === id);
  if (!h) { location.hash = '#/hotels'; return; }
  const s = pin();
  const w = s.watches.find(x => x.hotelId === id);
  const checkIn = w ? w.checkIn : addDays(todayISO(), 30);
  const checkOut = w ? w.checkOut : addDays(checkIn, 1);
  const hist = priceHistory(h, checkIn);
  const { hi, lo, now } = priceStats(hist);
  const ago = d => { const n = daysBetween(d, todayISO()); return n ? `${n}일 전` : '오늘'; };
  const target = w ? w.target : Math.round(lo.price * 1.08 / 1000) * 1000;

  root.innerHTML = `${subHeader(h.name)}
  <div class="ht-hero" style="--h:${h.hue}"><span>${esc(h.area)}</span><b>${esc(h.name)}</b><small>${'★'.repeat(h.stars)}</small></div>
  <section class="card price-card">
    <div class="pc-hd">${ic('calendar')}<b>${checkIn.slice(5).replace('-', '.')} ~ ${checkOut.slice(5).replace('-', '.')} 숙박 시</b><span class="muted small">1박 당 평균 가격</span></div>
    <div class="pc-row up">${ic('up')}<span>최고가</span><strong>${won(hi.price)}/박</strong><em>${ago(hi.date)}</em></div>
    <div class="pc-row"><span class="dash">—</span><span>현재가</span><strong>${won(now.price)}~ /박</strong></div>
    <div class="pc-row down">${ic('down')}<span>최저가</span><strong>${won(lo.price)}/박</strong><em>${ago(lo.date)}</em></div>
    ${chart(hist, hi, lo)}
    <ul class="pc-note"><li>${checkIn.slice(5).replace('-', '.')} ~ ${checkOut.slice(5).replace('-', '.')} 기간의 1박 평균 가격</li><li>위 기간의 숙박을 과거에 예약했다면 얼마였는지 표시 ${sample('샘플 시세')}</li></ul>
  </section>
  <form class="card form" id="f"><h2>가격 알림 받기</h2>
    <div class="two"><label>체크인<input type="date" name="checkIn" value="${checkIn}" min="${todayISO()}"></label><label>체크아웃<input type="date" name="checkOut" value="${checkOut}"></label></div>
    <label>목표가 (1박, 원)<input type="number" name="target" step="1000" min="0" value="${target}" inputmode="numeric"></label>
    <p class="muted small">현재가보다 ${won(Math.max(0, now.price - target))} 낮은 가격이에요. 앱을 열 때 확인해서 하루 한 번 알려드려요.</p>
    <div class="two">${w ? `<button type="button" class="btn" id="off">알림 끄기</button>` : '<span></span>'}<button class="btn primary">${w ? '알림 저장' : '알림 받기'}</button></div></form>`;

  const f = root.querySelector('#f');
  f.onsubmit = async e => {
    e.preventDefault();
    const ci = f.checkIn.value, co = f.checkOut.value > f.checkIn.value ? f.checkOut.value : addDays(f.checkIn.value, 1);
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
    setPin(p => { p.watches = p.watches.filter(x => x.hotelId !== id); p.watches.push({ hotelId: id, checkIn: ci, checkOut: co, target: +f.target.value || 0, on: true, lastAlert: '' }); });
    checkWatches();
    toast('가격 알림을 설정했어요');
  };
  const off = root.querySelector('#off'); if (off) off.onclick = () => { setPin(p => { p.watches = p.watches.filter(x => x.hotelId !== id); }); toast('알림을 껐어요'); };
}

function chart(hist, hi, lo) {
  const W = 340, H = 130, pad = 6;
  const max = hi.price, min = lo.price, span = Math.max(1, max - min);
  const x = i => pad + i * (W - pad * 2) / (hist.length - 1);
  const y = v => 18 + (H - 34) * (1 - (v - min) / span);
  const pts = hist.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round(hist.length * .25), Math.round(hist.length * .5), Math.round(hist.length * .75), hist.length - 1];
  return `<svg class="pchart" viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="최근 ${hist.length}일 가격 추이">
    <line x1="0" x2="${W}" y1="${y(max)}" y2="${y(max)}" class="hi"/><text x="2" y="${y(max) - 4}" class="hi">최고 ${won(max)}</text>
    <line x1="0" x2="${W}" y1="${y(min)}" y2="${y(min)}" class="lo"/><text x="2" y="${y(min) + 12}" class="lo">최저 ${won(min)}</text>
    <polygon points="${x(0)},${H - 16} ${pts} ${x(hist.length - 1)},${H - 16}" class="area"/>
    <polyline points="${pts}" class="ln"/>
    ${ticks.map(i => `<text x="${x(i)}" y="${H + 10}" text-anchor="${i === 0 ? 'start' : i === hist.length - 1 ? 'end' : 'middle'}" class="tk">${+hist[i].date.slice(5, 7)}/${+hist[i].date.slice(8)}</text>`).join('')}
  </svg>`;
}
