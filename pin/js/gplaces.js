// 구글 지도 인기 맛집: 구역 안에서 구글이 고른 인기 장소(최대 20곳)를 리뷰 수 순으로
// Places API (New) Nearby Search 1회 = 결과 20곳 (Nearby Search Enterprise, 월 1,000회 무료)
// 구글 약관상 별점·리뷰 수는 저장할 수 없어 메모리에만 두고, 앱을 닫으면 사라진다
import { googleReady } from './mapkit.js';
import { haversineKm } from '../../src/util.js';

const mem = new Map(); // `${area}|${kind}` → places[]
const inflight = new Map();
// 장소의 '대표 유형'으로만 거른다 (includedTypes로 하면 식당이 입점한 백화점·쇼핑몰·호텔까지 섞임). 패스트푸드는 제외
const FOOD = ['restaurant', 'japanese_restaurant', 'ramen_restaurant', 'sushi_restaurant', 'japanese_izakaya_restaurant', 'japanese_curry_restaurant',
  'tonkatsu_restaurant', 'yakiniku_restaurant', 'yakitori_restaurant', 'noodle_shop', 'soup_restaurant', 'seafood_restaurant', 'barbecue_restaurant',
  'steak_house', 'hot_pot_restaurant', 'korean_restaurant', 'korean_barbecue_restaurant', 'chinese_restaurant', 'chinese_noodle_restaurant',
  'dumpling_restaurant', 'dim_sum_restaurant', 'taiwanese_restaurant', 'indian_restaurant', 'thai_restaurant', 'vietnamese_restaurant',
  'italian_restaurant', 'pizza_restaurant', 'french_restaurant', 'western_restaurant', 'hamburger_restaurant',
  'fine_dining_restaurant', 'chicken_restaurant', 'asian_restaurant', 'diner', 'bistro', 'sandwich_shop', 'spanish_restaurant'];
// '음식점'(restaurant)에 하위 유형이 포함돼 체인 패스트푸드·패밀리레스토랑이 섞이므로 따로 뺀다
const EXCLUDE = ['fast_food_restaurant', 'family_restaurant'];
const CAFE = ['cafe', 'coffee_shop', 'coffee_roastery', 'coffee_stand', 'bakery', 'dessert_shop', 'dessert_restaurant', 'ice_cream_shop',
  'tea_house', 'confectionery', 'donut_shop', 'chocolate_shop'];
const TYPES = { all: [...FOOD, ...CAFE], food: FOOD, cafe: CAFE }; // 한 요청 최대 50개

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
      includedPrimaryTypes: TYPES[kind] || TYPES.all, excludedPrimaryTypes: EXCLUDE, maxResultCount: 20,
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
