// 지금 보고 있는 여행 고르기
import { getState, tripStatus } from '../../src/store.js';
import { pin } from './pinstore.js';

// 지금 볼 여행: 진행 중 > 다가오는 가장 가까운 여행 > 최근 여행
export function currentTrip() {
  const trips = getState().trips;
  if (!trips.length) return null;
  const pick = trips.find(t => t.id === pin().tripId);
  if (pick) return pick;
  const on = trips.find(t => tripStatus(t) === 'ongoing'); if (on) return on;
  const up = trips.filter(t => tripStatus(t) === 'upcoming').sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return up || trips[0];
}

