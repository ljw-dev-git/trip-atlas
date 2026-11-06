// AI 챗: 외부 AI 서버 없이 내 여행 데이터로 답하는 규칙 기반 도우미
import { toHome } from '../../../src/store.js';
import { esc, fmtDate, todayISO, addDays, fmtMoney, PLACE_CATEGORIES } from '../../../src/util.js';
import { ic } from '../icons.js';
import { pin, setPin } from '../pinstore.js';
import { currentTrip } from '../current.js';
import { settle } from '../money.js';
import { FLIGHTS, AIRPORTS, pctOff, COUPONS } from '../data.js';
import { won } from '../ui.js';

const SUGGEST = ['오늘 일정 알려줘', '남은 예산은?', '정산 어떻게 돼?', '환율 얼마야?', '카페 추천', '항공 특가 있어?', '쓸 수 있는 쿠폰'];

export function renderChat(root) {
  const msgs = pin().chat;
  root.innerHTML = `<div class="chat">
    <div class="chat-log" id="log">
      <div class="msg bot"><span class="bot-av">${ic('spark')}</span><div><p>안녕하세요! 내 여행 일정·가계부·저장한 핫플을 보고 답해 드려요.</p><p class="muted small">기기 안에서 동작하는 도우미라 외부로 데이터를 보내지 않아요.</p></div></div>
      ${msgs.map(m => `<div class="msg ${m.role}">${m.role === 'bot' ? `<span class="bot-av">${ic('spark')}</span>` : ''}<div>${m.html || `<p>${esc(m.text)}</p>`}</div></div>`).join('')}
    </div>
    <div class="chat-suggest">${SUGGEST.map(s => `<button class="chip">${s}</button>`).join('')}</div>
    <form class="chat-in" id="f"><input name="q" placeholder="무엇이든 물어보세요" autocomplete="off" aria-label="질문"><button class="send" aria-label="보내기">${ic('send')}</button>${msgs.length ? `<button type="button" class="link small" id="clear">대화 지우기</button>` : ''}</form>
  </div>`;
  const log = root.querySelector('#log'); log.scrollTop = log.scrollHeight;
  const ask = q => { if (!q) return; setPin(p => { p.chat.push({ role: 'me', text: q }); p.chat.push({ role: 'bot', html: answer(q) }); p.chat = p.chat.slice(-40); }); };
  root.querySelector('#f').onsubmit = e => { e.preventDefault(); ask(e.target.q.value.trim()); };
  root.querySelectorAll('.chat-suggest .chip').forEach(b => b.onclick = () => ask(b.textContent));
  const c = root.querySelector('#clear'); if (c) c.onclick = () => setPin(p => { p.chat = []; });
}

function answer(q) {
  const t = currentTrip();
  const has = (...k) => k.some(x => q.includes(x));
  if (!t && !has('항공', '특가', '쿠폰')) return '<p>아직 여행이 없어요. 일정 탭에서 여행을 먼저 만들어 주세요.</p>';

  if (has('일정', '오늘', '내일', '코스', '동선')) {
    let date = todayISO(); if (has('내일')) date = addDays(date, 1);
    let d = t.days.find(x => x.date === date);
    const m = q.match(/(\d+)\s*일차|day\s*(\d+)/i);
    if (m) d = t.days[(+(m[1] || m[2])) - 1];
    const exact = !!d;
    if (!d) d = t.days.find(x => x.date >= todayISO()) || t.days[0];
    if (!d) return '<p>여행 날짜가 아직 없어요.</p>';
    const i = t.days.indexOf(d);
    const P = id => t.places.find(p => p.id === id) || {};
    return `${exact ? '' : `<p class="muted small">${has('내일') ? '내일' : '오늘'}은 여행 기간이 아니라 가장 가까운 날 일정을 보여드려요.</p>`}<p><b>Day ${i + 1} · ${fmtDate(d.date)}</b>${d.title ? ` — ${esc(d.title)}` : ''}</p><ol>${d.stops.map(s => `<li>${s.time ? `<em>${esc(s.time)}</em> ` : ''}${esc(s.title || P(s.placeId).name || '장소')}</li>`).join('') || '<li>아직 비어 있어요</li>'}</ol><a class="chip" href="#/plan/${encodeURIComponent(t.id)}">일정 열기</a>`;
  }
  if (has('예산', '잔액', '얼마 썼', '지출', '남은')) {
    const { total } = settle(t); const b = t.budget.amount || 0;
    return `<p>지금까지 <b>${won(total)}</b> 썼어요.${b ? ` 예산 ${won(b)} 중 ${b - total >= 0 ? `<b>${won(b - total)}</b> 남았어요` : `<b class="neg">${won(total - b)} 초과</b>했어요`}.` : ' 예산을 설정하면 잔액도 알려 드려요.'}</p><a class="chip" href="#/plan/${encodeURIComponent(t.id)}/money">가계부 열기</a>`;
  }
  if (has('정산', 'N분', 'n분', '보내')) {
    const { total, transfers } = settle(t);
    return `<p>총 ${won(total)}을 기준으로 계산했어요.</p>${transfers.length ? `<ul>${transfers.map(x => `<li>${esc(x.from.name)} → ${esc(x.to.name)} <b>${won(x.amount)}</b></li>`).join('')}</ul>` : '<p>지금은 보낼 돈이 없어요.</p>'}`;
  }
  if (has('환율')) {
    const r = t.fx[t.currency];
    return t.currency === t.homeCurrency ? '<p>이번 여행은 원화로 쓰고 있어요.</p>' : r ? `<p>100 ${t.currency} = <b>${fmtMoney(r * 100, t.homeCurrency)}</b></p><p class="muted small">${esc(t.fxNote || '')}</p>` : '<p>환율이 없어요. 가계부에서 오늘 환율을 가져와 주세요.</p>';
  }
  const catKey = Object.entries({ cafe: ['카페'], food: ['맛집', '식당', '밥', '먹'], sight: ['관광', '볼거리', '구경'], shop: ['쇼핑'] }).find(([, ks]) => has(...ks));
  if (catKey || has('추천')) {
    const cat = catKey ? catKey[0] : null;
    const places = t.places.filter(p => !cat || p.category === cat).slice(0, 5);
    const saved = pin().contents.filter(c => !cat || (cat === 'cafe' ? c.category === '카페' : cat === 'food' ? c.category === '맛집' : true)).slice(0, 3);
    return `<p>${cat ? PLACE_CATEGORIES[cat].label : '가볼 만한'} 후보예요.</p><ul>${places.map(p => `<li>${esc(p.name)}${p.memo ? ` — <span class="muted">${esc(p.memo.slice(0, 40))}</span>` : ''}</li>`).join('')}${saved.map(c => `<li>📌 ${esc(c.placeName || c.title)} <span class="muted">(저장한 핫플)</span></li>`).join('')}</ul>${places.length + saved.length ? '' : '<p class="muted">해당하는 장소가 아직 없어요.</p>'}`;
  }
  if (has('항공', '비행기', '특가', '땡처리')) {
    const top = FLIGHTS.slice().sort((a, b) => pctOff(b) - pctOff(a)).slice(0, 3);
    return `<p>할인율이 큰 항공권이에요 <span class="sample">샘플</span></p><ul>${top.map(f => `<li>${AIRPORTS[f.from]} → ${AIRPORTS[f.to]} <b>${won(f.now)}</b> (${pctOff(f)}%↓)</li>`).join('')}</ul><a class="chip" href="#/flights">급락 항공 보기</a>`;
  }
  if (has('쿠폰', '할인', '혜택')) {
    const mine = pin().myCoupons.map(id => COUPONS.find(c => c.id === id)).filter(Boolean);
    return mine.length ? `<p>받은 쿠폰 ${mine.length}장이 있어요.</p><ul>${mine.map(c => `<li>${esc(c.brand)} 최대 ${c.max}%</li>`).join('')}</ul><a class="chip" href="#/coupons">쿠폰함</a>` : '<p>아직 받은 쿠폰이 없어요.</p><a class="chip" href="#/coupons">쿠폰 둘러보기</a>';
  }
  if (has('날씨')) return '<p>실시간 날씨는 아직 지원하지 않아요. 일정의 장소를 구글 지도에서 열어 확인해 주세요.</p>';
  return `<p>이렇게 물어보세요: ${SUGGEST.slice(0, 4).map(s => `“${s}”`).join(', ')}</p>`;
}
