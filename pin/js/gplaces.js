// 구글 지도 인기 맛집: 구역 안에서 구글이 고른 인기 장소(최대 20곳)를 리뷰 수 순으로
// Places API (New) Nearby Search 1회 = 결과 20곳 (Nearby Search Enterprise, 월 1,000회 무료)
// 구글 약관상 별점·리뷰 수는 저장할 수 없어 메모리에만 두고, 앱을 닫으면 사라진다
import { googleReady } from './mapkit.js';
import { haversineKm } from '../../src/util.js';

const mem = new Map(); // `${area}|${kind}` → places[]
const inflight = new Map();
const TYPES = { all: ['restaurant', 'cafe'], food: ['restaurant'], cafe: ['cafe', 'coffee_shop', 'dessert_shop', 'bakery'] };

export const cachedGPlaces = (area, kind) => mem.get(`${area}|${kind}`);

// 구역의 중심과 반경: 우리 맛집 좌표로 정한다 (최소 700m, 최대 3km)
export function areaCircle(eats) {
  const c = { lat: eats.reduce((s, e) => s + e.lat, 0) / eats.length, lng: eats.reduce((s, e) => s + e.lng, 0) / eats.length };
  const r = Math.max(...eats.map(e => haversineKm(c, e))) * 1000 + 300;
  return { center: c, radius: Math.min(3000, Math.max(700, Math.round(r))) };
}

export function loadGPlaces(area, kind, circle) {
  const key = `${area}|${kind}`;
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    await googleReady();
    const { Place, SearchNearbyRankPreference } = await google.maps.importLibrary('places');
    const { places } = await Place.searchNearby({
      fields: ['id', 'displayName', 'location', 'rating', 'userRatingCount', 'primaryType', 'primaryTypeDisplayName', 'googleMapsURI'],
      locationRestriction: { center: circle.center, radius: circle.radius },
      includedTypes: TYPES[kind] || TYPES.all, maxResultCount: 20,
      rankPreference: SearchNearbyRankPreference.POPULARITY, language: 'ko', region: 'jp',
    });
    const list = (places || []).map(pl => ({
      id: pl.id, name: pl.displayName || '', lat: pl.location.lat(), lng: pl.location.lng(),
      rating: pl.rating ?? null, count: pl.userRatingCount ?? 0, type: pl.primaryType || '', typeName: pl.primaryTypeDisplayName || '', url: pl.googleMapsURI || '',
    }));
    mem.set(key, list);
    return list;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
