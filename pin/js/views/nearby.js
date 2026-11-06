// 내 주변: 지도 위 제휴 혜택(샘플)과 내 일정 장소, 거리순 목록
import { haversineKm, esc } from '../../../src/util.js';
import { ic } from '../icons.js';
import { currentTrip } from '../current.js';
import { COUPONS } from '../data.js';
import { sample, toast } from '../ui.js';
import { mountMap } from '../mapkit.js';

const KINDS = [['all', '전체'], ['food', '맛집'], ['cafe', '카페'], ['spa', '마사지·스파'], ['shop', '쇼핑']];
let kind = 'all', me = null, map = null;

export function renderNearby(root) {
  const trip = currentTrip();
  const partners = COUPONS.filter(c => c.lat != null && (kind === 'all' || c.kind === kind));
  const places = trip ? trip.places.filter(p => p.lat != null) : [];
  const center = me || (places[0] ? { lat: places[0].lat, lng: places[0].lng } : { lat: 34.9717, lng: 138.3889 });
  const list = partners.map(c => ({ c, km: haversineKm(center, c) })).sort((a, b) => a.km - b.km);

  root.innerHTML = `<div class="nearby">
    <div class="near-map" id="nmap"></div>
    <div class="near-chips">${KINDS.map(([k, l]) => `<button class="chip ${k === kind ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="locate" id="loc" aria-label="내 위치">${ic('locate')}</button>
    <section class="near-sheet">
      <div class="sec-hd"><h2>${me ? '내 위치' : trip ? esc(trip.title) : '기준 위치'} 주변 혜택</h2>${sample('샘플 제휴처')}</div>
      ${list.map(({ c, km }) => `<a class="near-row" href="#/coupons"><span class="logo-mark" style="--c:${c.color}">${esc(c.mark)}</span><div><b>${esc(c.brand)}</b><small>${esc(c.cat)} · ${km < 1 ? Math.round(km * 1000) + 'm' : km < 100 ? km.toFixed(1) + 'km' : Math.round(km).toLocaleString() + 'km'}</small></div><em>최대 ${c.max}%</em></a>`).join('') || '<p class="muted pad">이 분류의 제휴처가 없어요</p>'}
    </section></div>`;

  if (map) { map.destroy(); map = null; }
  map = mountMap(root.querySelector('#nmap'), m => {
    places.forEach(p => m.dot([p.lat, p.lng], '#5b5ceb', p.name));
    partners.forEach(c => m.deal([c.lat, c.lng], `${c.max}%`, c.color, `<b>${esc(c.brand)}</b><br>${esc(c.cat)} · 최대 ${c.max}% 할인<br><a href="#/membership">멤버십 보여주기</a>`));
    if (me) m.dot([me.lat, me.lng], '#ef4444', '내 위치', true);
    m.view([center.lat, center.lng], 13);
  });
  root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; renderNearby(root); });
  root.querySelector('#loc').onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => { me = { lat: p.coords.latitude, lng: p.coords.longitude }; renderNearby(root); }, () => toast('위치 권한이 없어 여행지 기준으로 보여드려요'), { timeout: 8000 });
  };
}
