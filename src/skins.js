// 디자인 버전(스킨): html[data-skin] 하나로 styles/skins.css가 덮어쓴다.
export const SKIN_KEY = 'trip-atlas:skin';
export const SKINS = [
  { id: '', name: '괘선', desc: '기본. 괘선과 여백으로만 나누는 도구형 화면', ref: 'Trip Atlas 기본', sw: ['#fbfaf7', '#141414', '#c43c1f'] },
  { id: 'notion', name: '노션', desc: '노션 여행 템플릿처럼 — 커버·큰 아이콘·속성 표·갤러리 뷰·콜아웃', ref: 'Notion Travel Planner 템플릿', sw: ['#ffffff', '#37352f', '#2383e2'] },
  { id: 'journey', name: '저니', desc: '여행 앱처럼 — 둥근 카드, 사진 히어로, 알약 탭, 떠 있는 하단 탭', ref: 'Wanderlog · TREK · Airbnb', sw: ['#f5f6f8', '#111827', '#e8503a'] },
  { id: 'editorial', name: '에디토리얼', desc: '여행 매거진처럼 — 세리프 제목, 이중 괘선, 목차형 목록, 넓은 여백', ref: 'Kinfolk · Cereal · Monocle', sw: ['#f4efe6', '#1c1a17', '#8a1c1c'] },
];
const valid = id => SKINS.some(s => s.id === id);
export const getSkin = () => { const v = localStorage.getItem(SKIN_KEY) || ''; return valid(v) ? v : ''; };
export function applySkin(id, { persist = true } = {}) {
  if (!valid(id)) id = '';
  if (id) document.documentElement.dataset.skin = id; else delete document.documentElement.dataset.skin;
  if (persist) { if (id) localStorage.setItem(SKIN_KEY, id); else localStorage.removeItem(SKIN_KEY); }
  document.dispatchEvent(new CustomEvent('skinchange', { detail: id }));
}
// ?skin=notion 같은 주소로 열면 그 버전을 적용하고 주소에서 지운다
export function applySkinFromURL() {
  const u = new URL(location.href);
  const q = u.searchParams.get('skin');
  if (q == null) return;
  applySkin(q === 'default' ? '' : q);
  u.searchParams.delete('skin');
  history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
}
