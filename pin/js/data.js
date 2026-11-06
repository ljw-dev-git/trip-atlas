// 샘플 데이터: 항공 특가·숙소 시세·제휴 쿠폰/제휴처.
// 실제 판매처 API가 없으므로 모든 가격·브랜드는 가상의 예시이며 화면에 "샘플"로 표시한다.
import { todayISO, addDays } from '../../src/util.js';

export const REGIONS = [
  { id: 'all', label: '전체' },
  { id: 'jp', label: '일본' },
  { id: 'sea', label: '동남아' },
  { id: 'cn', label: '중화권' },
  { id: 'kr', label: '국내' },
];

export const AIRPORTS = {
  ICN: '인천', GMP: '김포', PUS: '부산/김해', CJU: '제주', KIX: '오사카', NRT: '도쿄/나리타', FSZ: '시즈오카',
  FUK: '후쿠오카', CTS: '삿포로', OKA: '오키나와', DAD: '다낭', CXR: '나트랑', BKK: '방콕', CEB: '세부',
  TPE: '타이베이', HKG: '홍콩', TAO: '칭다오', MYJ: '마쓰야마',
};

// 출발일은 오늘 기준 상대일로 만들어 항상 "앞으로의 특가"가 되도록 한다
const F = (from, to, region, offset, nights, was, now, carrier) => ({ id: `${from}-${to}-${offset}`, from, to, region, out: addDays(todayISO(), offset), back: addDays(todayISO(), offset + nights), nights, was, now, carrier });
export const FLIGHTS = [
  F('ICN', 'CJU', 'kr', 9, 3, 492820, 42700, '진에어'),
  F('ICN', 'PUS', 'kr', 13, 2, 201440, 69300, '에어부산'),
  F('ICN', 'TAO', 'cn', 21, 7, 362080, 100200, '산둥항공'),
  F('ICN', 'MYJ', 'jp', 18, 3, 469800, 127900, '제주항공'),
  F('ICN', 'FSZ', 'jp', 16, 2, 388000, 139000, '제주항공'),
  F('ICN', 'KIX', 'jp', 6, 3, 312000, 89000, '티웨이'),
  F('GMP', 'KIX', 'jp', 25, 4, 298000, 118000, '대한항공'),
  F('ICN', 'FUK', 'jp', 11, 2, 254000, 76000, '이스타'),
  F('ICN', 'OKA', 'jp', 30, 4, 410000, 159000, '피치'),
  F('ICN', 'DAD', 'sea', 19, 4, 520000, 189000, '비엣젯'),
  F('ICN', 'CXR', 'sea', 27, 5, 498000, 214000, '제주항공'),
  F('ICN', 'BKK', 'sea', 34, 5, 610000, 248000, '타이항공'),
  F('ICN', 'CEB', 'sea', 40, 4, 455000, 199000, '필리핀항공'),
  F('ICN', 'TPE', 'cn', 15, 3, 336000, 119000, '타이거'),
  F('ICN', 'HKG', 'cn', 23, 3, 402000, 161000, '홍콩익스프레스'),
];
export const pctOff = f => Math.round((1 - f.now / f.was) * 100);

export const HOTELS = [
  { id: 'h-namba', name: '난바 리버뷰 호텔', area: '오사카 난바', region: 'jp', base: 118000, stars: 3, lat: 34.6655, lng: 135.5010, hue: 250 },
  { id: 'h-umeda', name: '우메다 스카이 스테이', area: '오사카 우메다', region: 'jp', base: 189000, stars: 4, lat: 34.7055, lng: 135.4983, hue: 210 },
  { id: 'h-shizu', name: '시즈오카 스테이션 인', area: '시즈오카역', region: 'jp', base: 96000, stars: 3, lat: 34.9725, lng: 138.3880, hue: 160 },
  { id: 'h-shimizu', name: '시미즈 하버 호텔', area: '시미즈항', region: 'jp', base: 132000, stars: 4, lat: 35.0150, lng: 138.4890, hue: 190 },
  { id: 'h-danang', name: '미케 비치 리조트', area: '다낭 미케 비치', region: 'sea', base: 142000, stars: 5, lat: 16.0600, lng: 108.2470, hue: 175 },
  { id: 'h-taipei', name: '시먼딩 어반 호텔', area: '타이베이 시먼딩', region: 'cn', base: 104000, stars: 3, lat: 25.0422, lng: 121.5078, hue: 20 },
  { id: 'h-jeju', name: '애월 오션 스테이', area: '제주 애월', region: 'kr', base: 158000, stars: 4, lat: 33.4630, lng: 126.3100, hue: 140 },
];

// 결정적 의사난수(같은 호텔·날짜면 항상 같은 값)
function hash(str) {
  let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; // 비슷한 문자열도 고르게 흩어지도록 섞기
  return (h >>> 0) / 4294967295;
}

// 체크인 날짜 기준 1박 평균가의 최근 N일 추이 (과거 같은 숙박을 예약했다면 얼마였는지)
export function priceHistory(hotel, checkIn, days = 42) {
  const today = todayISO();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const r = hash(`${hotel.id}|${checkIn}|${d}`);
    const spike = r > .93 ? 1.25 + r * .2 : r < .06 ? .55 : .8 + r * .35;
    out.push({ date: d, price: Math.round(hotel.base * spike / 100) * 100 });
  }
  return out;
}
export function priceStats(hist) {
  let hi = hist[0], lo = hist[0];
  hist.forEach(p => { if (p.price > hi.price) hi = p; if (p.price < lo.price) lo = p; });
  return { hi, lo, now: hist[hist.length - 1] };
}

export const COUPON_TABS = [
  { id: 'all', label: '전체' }, { id: 'mine', label: '내 쿠폰' }, { id: 'jp', label: '일본' }, { id: 'sea', label: '동남아' },
  { id: 'esim', label: 'eSIM' }, { id: 'rent', label: '렌터카' }, { id: 'kr', label: '국내' },
];
// 브랜드는 모두 가상의 이름. logo는 글자 마크 + 색.
export const COUPONS = [
  { id: 'c-denki', brand: '덴키 메가스토어', cat: '가전', tab: 'jp', max: 17, color: '#d93a3a', mark: 'D', lat: 34.6680, lng: 135.5005, kind: 'shop' },
  { id: 'c-kusuri', brand: '사쿠라 드럭', cat: '드럭스토어', tab: 'jp', max: 18, color: '#e0508a', mark: '薬', lat: 34.9705, lng: 138.3900, kind: 'shop' },
  { id: 'c-kobu', brand: '코부 코스메', cat: '드럭스토어', tab: 'jp', max: 18, color: '#7a2948', mark: 'K', lat: 34.6690, lng: 135.5030, kind: 'shop' },
  { id: 'c-satsu', brand: '그린크로스 약국', cat: '드럭스토어', tab: 'jp', max: 17, color: '#2f7d4f', mark: '✚', lat: 34.9735, lng: 138.3860, kind: 'shop' },
  { id: 'c-sushi', brand: '미나토 스시', cat: '맛집', tab: 'jp', max: 10, color: '#1f5fa8', mark: '寿', lat: 35.0110, lng: 138.4930, kind: 'food' },
  { id: 'c-matcha', brand: '차밭 카페 오차', cat: '카페', tab: 'jp', max: 15, color: '#5c8a2e', mark: '茶', lat: 34.9760, lng: 138.3830, kind: 'cafe' },
  { id: 'c-spa', brand: '한 스파 다낭', cat: '마사지·스파', tab: 'sea', max: 30, color: '#9a6b2f', mark: '♨', lat: 16.0620, lng: 108.2440, kind: 'spa' },
  { id: 'c-pho', brand: '포 리버사이드', cat: '맛집', tab: 'sea', max: 12, color: '#c2410c', mark: 'P', lat: 16.0680, lng: 108.2240, kind: 'food' },
  { id: 'c-esim', brand: '로밍핀 eSIM', cat: 'eSIM', tab: 'esim', max: 25, color: '#4f46e5', mark: 'e', kind: 'etc' },
  { id: 'c-rent', brand: '오키 렌터카', cat: '렌터카', tab: 'rent', max: 20, color: '#0f766e', mark: 'R', kind: 'etc' },
  { id: 'c-jejucafe', brand: '애월 바다 카페', cat: '카페', tab: 'kr', max: 10, color: '#0e7490', mark: 'A', lat: 33.4645, lng: 126.3090, kind: 'cafe' },
  { id: 'c-taipei', brand: '용캉 딤섬', cat: '맛집', tab: 'cn', max: 15, color: '#b45309', mark: '點', lat: 25.0330, lng: 121.5290, kind: 'food' },
];
export const couponRegion = c => ({ jp: 'jp', sea: 'sea', kr: 'kr', cn: 'cn' })[c.tab] || 'all';

export const GUIDES = [
  { title: '시즈오카 2박 3일, 차 없이 도는 법', tag: '가이드', region: 'jp', mins: 6 },
  { title: '다낭 첫 여행 체크리스트 12가지', tag: '가이드', region: 'sea', mins: 4 },
  { title: '오사카 드럭스토어 면세 한 번에 받기', tag: '쇼핑', region: 'jp', mins: 3 },
  { title: '제주 애월 해질녘 카페 동선', tag: '국내', region: 'kr', mins: 5 },
];
