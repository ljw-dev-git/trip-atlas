// 상태 저장소: localStorage 기반. 여행 여러 개, 백업/복원(JSON), 예시 여행 불러오기.
import { uid, todayISO, dateRange } from './util.js';
import { SEED_SHIZUOKA } from './data/seed-shizuoka.js';

const KEY = 'trip-atlas:v1';
const listeners = new Set();

const defaultState = () => ({
  version: 1,
  settings: { homeCurrency: 'KRW', theme: 'auto', seeded: false },
  trips: [],
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('저장 데이터를 읽지 못했습니다', e); }
  const s = defaultState();
  return s;
}

function migrate(s) {
  if (!s || typeof s !== 'object') return defaultState();
  s.version = 1;
  s.settings = Object.assign({ homeCurrency: 'KRW', theme: 'auto' }, s.settings || {});
  s.trips = (s.trips || []).map(normalizeTrip);
  return s;
}

export function normalizeTrip(t) {
  const trip = Object.assign({
    id: uid(), title: '새 여행', destination: '', country: '', emoji: '✈', startDate: '', endDate: '',
    travelers: 1, currency: 'KRW', homeCurrency: 'KRW', fx: {}, fxNote: '', budget: { amount: 0, currency: 'KRW' },
    cover: 'sea', summary: '', places: [], days: [], expenses: [], journal: [], checklist: [], createdAt: todayISO(),
  }, t);
  trip.places = (trip.places || []).map(p => Object.assign({ id: uid(), name: '', localName: '', category: 'sight', lat: null, lng: null, url: '', address: '', memo: '', note: '', hours: '' }, p));
  trip.expenses = (trip.expenses || []).map(e => Object.assign({ id: uid(), date: trip.startDate, category: 'etc', amount: 0, currency: trip.currency, method: 'cash', note: '', placeId: '', planned: false }, e));
  trip.checklist = (trip.checklist || []).map(c => Object.assign({ id: uid(), text: '', done: false }, c));
  trip.journal = (trip.journal || []).map(j => Object.assign({ date: '', text: '', rating: 0, highlights: '' }, j));
  trip.days = (trip.days || []).map(d => Object.assign({ date: '', title: '', note: '', stops: [] }, d, {
    stops: (d.stops || []).map(s => Object.assign({ id: uid(), time: '', placeId: '', title: '', memo: '', transport: '', mode: 'walk', status: 'plan' }, s)),
  }));
  trip.fx = Object.assign({ [trip.homeCurrency]: 1 }, trip.fx || {});
  syncDays(trip);
  return trip;
}

// 날짜 범위에 맞춰 days 배열을 맞춘다 (기존 일정은 보존, 범위 밖 날짜는 끝에 보관)
export function syncDays(trip) {
  const range = dateRange(trip.startDate, trip.endDate);
  if (!range.length) return trip;
  const byDate = new Map(trip.days.map(d => [d.date, d]));
  const days = range.map(date => byDate.get(date) || { date, title: '', note: '', stops: [] });
  const extra = trip.days.filter(d => !range.includes(d.date) && d.stops.length);
  trip.days = [...days, ...extra];
  return trip;
}

function persist(silent = false) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('저장 실패', e); }
  if (!silent) listeners.forEach(fn => fn(state));
}

export const getState = () => state;
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export function update(mutator) {
  mutator(state);
  persist();
}

export const getTrip = id => state.trips.find(t => t.id === id);

export function updateTrip(id, mutator, { silent = false } = {}) {
  const t = getTrip(id);
  if (!t) return;
  mutator(t);
  syncDays(t);
  persist(silent);
}

export function addTrip(data) {
  const trip = normalizeTrip(Object.assign({ id: uid() }, data));
  state.trips.unshift(trip);
  persist();
  return trip;
}

export function deleteTrip(id) {
  state.trips = state.trips.filter(t => t.id !== id);
  persist();
}

export function duplicateTrip(id) {
  const t = getTrip(id);
  if (!t) return null;
  const copy = normalizeTrip(JSON.parse(JSON.stringify(Object.assign({}, t, { id: uid(), title: t.title + ' (복사본)', journal: [], createdAt: todayISO() }))));
  copy.expenses = copy.expenses.filter(e => e.planned);
  copy.days.forEach(d => d.stops.forEach(s => s.status = 'plan'));
  state.trips.unshift(copy);
  persist();
  return copy;
}

export function tripStatus(t, today = todayISO()) {
  if (!t.startDate) return 'draft';
  if (today < t.startDate) return 'upcoming';
  if (t.endDate && today > t.endDate) return 'done';
  if (!t.endDate && today > t.startDate) return 'done';
  return 'ongoing';
}

export function importSeed() {
  if (state.trips.some(t => t.id === SEED_SHIZUOKA.id)) return getTrip(SEED_SHIZUOKA.id);
  const trip = normalizeTrip(JSON.parse(JSON.stringify(SEED_SHIZUOKA)));
  state.trips.push(trip);
  state.settings.seeded = true;
  persist();
  return trip;
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text, { merge = true } = {}) {
  const incoming = migrate(JSON.parse(text));
  if (!merge) { state = incoming; persist(); return state.trips.length; }
  let n = 0;
  for (const t of incoming.trips) {
    const i = state.trips.findIndex(x => x.id === t.id);
    if (i >= 0) state.trips[i] = t; else state.trips.push(t);
    n++;
  }
  persist();
  return n;
}

export function importTripJSON(text) {
  const obj = JSON.parse(text);
  const t = normalizeTrip(obj.trips ? obj.trips[0] : obj);
  const i = state.trips.findIndex(x => x.id === t.id);
  if (i >= 0) state.trips[i] = t; else state.trips.unshift(t);
  persist();
  return t;
}

export function resetAll() {
  state = defaultState();
  persist();
}

// 환산: 금액을 여행의 기준 통화(홈 통화)로
export function toHome(trip, amount, currency) {
  const rate = currency === trip.homeCurrency ? 1 : trip.fx[currency];
  if (rate == null) return null;
  return (Number(amount) || 0) * rate;
}
