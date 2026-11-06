// 구글 지도 별점·리뷰 수 (Places API New, 브라우저에서 실시간 조회)
// - 장소 ID 찾기: Text Search IDs Only(무료). 장소 ID는 구글 약관상 저장 가능 → localStorage
// - 별점·리뷰 수: Place Details Enterprise(월 1,000건 무료). 약관상 저장 불가 → 메모리에만 두고 앱을 닫으면 사라짐
import { googleReady } from './mapkit.js';

const ID_KEY = 'pintrip:gplace-ids';
const mem = new Map(); // eat.id → { rating, count, name } | { none: true }
const inflight = new Map();

function ids() { try { return JSON.parse(localStorage.getItem(ID_KEY) || '{}'); } catch { return {}; } }
function saveId(eatId, placeId) { try { const m = ids(); m[eatId] = placeId; localStorage.setItem(ID_KEY, JSON.stringify(m)); } catch { /* 저장 못 해도 다음에 다시 찾으면 됨 */ } }

export const googleReview = eatId => mem.get(eatId);
export const hasAllReviews = eats => eats.every(e => mem.has(e.id));

async function fetchOne(Place, e) {
  let pid = ids()[e.id];
  if (!pid) {
    const d = 0.003; // 가게 좌표 주변 약 300m 안에서만 찾기 (엉뚱한 지점 방지)
    const { places } = await Place.searchByText({
      textQuery: `${e.nameJa} ${e.address || ''}`.trim(), fields: ['id'], maxResultCount: 1, language: 'ja',
      locationRestriction: { south: e.lat - d, west: e.lng - d, north: e.lat + d, east: e.lng + d },
    });
    pid = places?.[0]?.id;
    if (!pid) return { none: true };
    saveId(e.id, pid);
  }
  const p = new Place({ id: pid });
  await p.fetchFields({ fields: ['displayName', 'rating', 'userRatingCount'] });
  return { rating: p.rating ?? null, count: p.userRatingCount ?? 0, name: p.displayName || '' };
}

// 아직 없는 것만 불러온다. 한 번에 보내는 양을 줄이려고 3개씩
export async function loadGoogleReviews(eats) {
  await googleReady();
  const { Place } = await google.maps.importLibrary('places');
  const todo = eats.filter(e => !mem.has(e.id));
  for (let i = 0; i < todo.length; i += 3) {
    await Promise.all(todo.slice(i, i + 3).map(e => {
      if (!inflight.has(e.id)) inflight.set(e.id, fetchOne(Place, e).then(r => mem.set(e.id, r)).finally(() => inflight.delete(e.id)));
      return inflight.get(e.id);
    }));
  }
}
