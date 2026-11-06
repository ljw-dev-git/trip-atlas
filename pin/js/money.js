// 동행자·지출·N분의 1 정산 계산 (Trip Atlas 지출 데이터에 payer/split 필드를 더해 사용)
import { toHome, updateTrip } from '../../src/store.js';
import { uid, haversineKm } from '../../src/util.js';

export function members(trip) {
  if (Array.isArray(trip.members) && trip.members.length) return trip.members;
  const n = Math.max(1, Number(trip.travelers) || 1);
  return Array.from({ length: n }, (_, i) => ({ id: i ? `m${i}` : 'me', name: i ? `동행 ${i}` : '나' }));
}
export function ensureMembers(trip) {
  if (Array.isArray(trip.members) && trip.members.length) return trip.members;
  const m = members(trip);
  updateTrip(trip.id, t => { t.members = m; }, { silent: true });
  return m;
}
export function addMember(trip, name) {
  updateTrip(trip.id, t => { t.members = members(t).concat({ id: 'm' + uid(), name }); t.travelers = t.members.length; });
}

// 결과: { total, rows:[{m, paid, owe, net}], transfers:[{from,to,amount}], skipped }
export function settle(trip) {
  const ms = members(trip);
  const ids = ms.map(m => m.id);
  const paid = Object.fromEntries(ids.map(i => [i, 0])), owe = Object.fromEntries(ids.map(i => [i, 0]));
  let total = 0, skipped = 0;
  trip.expenses.filter(e => !e.planned).forEach(e => {
    const v = toHome(trip, e.amount, e.currency);
    if (v == null) { skipped++; return; }
    const payer = ids.includes(e.payer) ? e.payer : ids[0];
    const who = (Array.isArray(e.split) && e.split.length ? e.split : ids).filter(i => ids.includes(i));
    const parts = who.length ? who : ids;
    paid[payer] += v; total += v;
    parts.forEach(i => { owe[i] += v / parts.length; });
  });
  const rows = ms.map(m => ({ m, paid: paid[m.id], owe: owe[m.id], net: paid[m.id] - owe[m.id] }));
  // 최소 송금: 가장 많이 낸 사람에게 가장 덜 낸 사람이 보내는 그리디
  const cred = rows.filter(r => r.net > 5).map(r => ({ m: r.m, v: r.net })).sort((a, b) => b.v - a.v);
  const debt = rows.filter(r => r.net < -5).map(r => ({ m: r.m, v: -r.net })).sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(debt[i].v, cred[j].v);
    if (amt >= 10) transfers.push({ from: debt[i].m, to: cred[j].m, amount: Math.round(amt / 10) * 10 });
    debt[i].v -= amt; cred[j].v -= amt;
    if (debt[i].v < 5) i++; if (cred[j].v < 5) j++;
  }
  return { total, rows, transfers, skipped };
}

// 이동 시간 어림: 직선거리 × 1.3(우회), 수단별 평균 속도
const SPEED = { walk: 4.5, transit: 32, bus: 20, taxi: 28, car: 32, bike: 14, flight: 600, ship: 25 };
export function legEstimate(a, b, mode = 'walk') {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const km = haversineKm(a, b) * 1.3;
  const min = Math.max(1, Math.round(km / (SPEED[mode] || 4.5) * 60 + (mode === 'transit' || mode === 'bus' ? 8 : 0)));
  return { km, min };
}
export const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60 ? (m % 60) + '분' : ''}`.trim() : `${m}분`;
