// 여행 상세: 헤더 + 탭 + 개요
import { tripStatus, toHome, updateTrip, duplicateTrip } from '../store.js';
import { esc, fmtRange, fmtMoney, fmtDate, todayISO, daysBetween, uid, download, PLACE_CATEGORIES } from '../util.js';
import { tripForm } from '../forms.js';
import { toast } from '../ui.js';
import { renderItinerary } from './itinerary.js';
import { renderMap } from './map.js';
import { renderLedger } from './ledger.js';
import { renderJournal } from './journal.js';

const STATUS = { ongoing: '여행 중', upcoming: '예정', done: '다녀옴', draft: '초안' };

export function renderTrip(root, trip, route, ctx) {
  const st = tripStatus(trip);
  const today = todayISO();
  const dday = trip.startDate ? daysBetween(today, trip.startDate) : null;
  const stops = trip.days.reduce((s, d) => s + d.stops.length, 0);
  const tabs = [['overview', '개요'], ['itinerary', '일정', stops], ['map', '지도', trip.places.length], ['ledger', '가계부', trip.expenses.filter(e => !e.planned).length], ['journal', '기록']];

  // 헤더는 매번 다시 그리되, 탭 본문 컨테이너는 보존(지도 등)
  let head = root.querySelector('.trip-head');
  if (!head || root.dataset.trip !== trip.id) {
    root.innerHTML = `<header class="trip-head"></header><nav class="tabs" aria-label="여행 탭"></nav><section id="tab-body"></section>`;
    root.dataset.trip = trip.id;
    head = root.querySelector('.trip-head');
  }
  head.innerHTML = `
    <a class="back" href="#/">← 내 여행</a>
    <h1><span class="emoji">${esc(trip.emoji)}</span>${esc(trip.title)} ${st === 'done' ? '<span class="stamp">Visited</span>' : st === 'ongoing' ? '<span class="stamp">On trip</span>' : ''}</h1>
    <div class="sub"><span>${esc(trip.destination || '목적지 미정')}</span><span class="num">${esc(fmtRange(trip.startDate, trip.endDate))}</span><span class="chip ${st === 'ongoing' ? 'verm' : st === 'upcoming' ? 'sea' : ''}">${STATUS[st]}${st === 'upcoming' && dday != null ? ` · D-${dday}` : ''}</span><span class="muted small">${trip.travelers}명</span></div>
    <div class="actions"><button class="btn sm" id="trip-edit">수정</button><button class="btn sm ghost" id="trip-dup" title="같은 일정으로 새 여행 만들기">복제</button></div>`;
  head.querySelector('#trip-edit').onclick = () => tripForm(trip);
  head.querySelector('#trip-dup').onclick = () => { const c = duplicateTrip(trip.id); toast('복제했습니다'); location.hash = `#/trip/${c.id}`; };
  root.querySelector('.tabs').innerHTML = tabs.map(([id, label, cnt]) => `<a href="#/trip/${esc(trip.id)}/${id}" class="${route.tab === id ? 'active' : ''}">${label}${cnt != null ? `<span class="cnt">${cnt}</span>` : ''}</a>`).join('');

  const body = root.querySelector('#tab-body');
  if (body.dataset.tab !== route.tab) { body.innerHTML = ''; body.dataset.tab = route.tab; }
  switch (route.tab) {
    case 'itinerary': return renderItinerary(body, trip, route);
    case 'map': return renderMap(body, trip, route);
    case 'ledger': return renderLedger(body, trip, route);
    case 'journal': return renderJournal(body, trip, route);
    default: return renderOverview(body, trip);
  }
}

function renderOverview(root, trip) {
  const spent = trip.expenses.filter(e => !e.planned).reduce((s, e) => s + (toHome(trip, e.amount, e.currency) || 0), 0);
  const planned = trip.expenses.filter(e => e.planned).reduce((s, e) => s + (toHome(trip, e.amount, e.currency) || 0), 0);
  const budget = trip.budget.amount || 0;
  const pct = budget ? Math.round(spent / budget * 100) : 0;
  const geo = trip.places.filter(p => p.lat != null).length;
  const doneStops = trip.days.reduce((s, d) => s + d.stops.filter(x => x.status === 'done').length, 0);
  const totalStops = trip.days.reduce((s, d) => s + d.stops.length, 0);
  const checkDone = trip.checklist.filter(c => c.done).length;
  const catCount = {};
  trip.places.forEach(p => { catCount[p.category] = (catCount[p.category] || 0) + 1; });

  root.innerHTML = `
    <div class="overview">
      <div class="stack">
        ${trip.summary ? `<div class="card flat"><p style="margin:0;font-family:var(--serif);font-size:17px;line-height:1.6">${esc(trip.summary)}</p></div>` : ''}
        <div class="card">
          <div class="card-title"><h3>일정 한눈에</h3><a class="small" href="#/trip/${esc(trip.id)}/itinerary">일정 탭 →</a></div>
          ${trip.days.length ? `<div class="day-strip">${trip.days.map((d, i) => `<a class="day-pill" href="#/trip/${esc(trip.id)}/itinerary/${d.date}"><span class="d">DAY ${i + 1} · ${fmtDate(d.date, { short: true })}</span><strong>${esc(d.title || '제목 없음')}</strong><span class="n">${d.stops.length}곳${d.stops.length ? ' · ' + d.stops.filter(s => s.placeId).map(s => (trip.places.find(p => p.id === s.placeId) || {}).name).filter(Boolean).slice(0, 3).map(esc).join(', ') : ''}</span></a>`).join('')}</div>` : '<div class="empty">출발일·귀국일을 입력하면 날짜가 생깁니다.</div>'}
        </div>
        <div class="card">
          <div class="card-title"><h3>준비 체크리스트</h3><span class="chip">${checkDone}/${trip.checklist.length}</span></div>
          <ul class="checklist" id="chk">${trip.checklist.map(c => `<li class="${c.done ? 'done' : ''}" data-id="${c.id}"><input type="checkbox" class="chk" ${c.done ? 'checked' : ''}><span>${esc(c.text)}</span><button class="x" title="삭제">×</button></li>`).join('') || '<li class="muted small" style="border:0">예약·환전·짐 같은 준비 항목을 추가하세요.</li>'}</ul>
          <form class="quick-add" id="chk-add"><input class="input" name="t" placeholder="할 일 추가 후 Enter" autocomplete="off"><button class="btn" type="submit">추가</button></form>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-title"><h3>예산</h3><a class="small" href="#/trip/${esc(trip.id)}/ledger">가계부 →</a></div>
          <div class="budget-ring">
            <div class="ring ${spent > budget && budget ? 'over' : ''}" style="--p:${Math.min(100, pct)}"><span>${budget ? pct + '%' : '—'}</span></div>
            <dl class="kv" style="margin:0">
              <dt>예산</dt><dd class="num">${budget ? fmtMoney(budget, trip.homeCurrency) : '미설정'}</dd>
              <dt>실제 지출</dt><dd class="num">${fmtMoney(spent, trip.homeCurrency)}</dd>
              <dt>예상 지출</dt><dd class="num muted">${fmtMoney(planned, trip.homeCurrency)}</dd>
              ${budget ? `<dt>${spent > budget ? '초과' : '남은 예산'}</dt><dd class="num" style="color:${spent > budget ? 'var(--danger)' : 'var(--good)'}">${fmtMoney(Math.abs(budget - spent), trip.homeCurrency)}</dd>` : ''}
            </dl>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><h3>장소</h3><a class="small" href="#/trip/${esc(trip.id)}/map">지도 →</a></div>
          <div class="row">${Object.entries(catCount).map(([k, n]) => `<span class="chip">${PLACE_CATEGORIES[k]?.icon || ''} ${PLACE_CATEGORIES[k]?.label || k} ${n}</span>`).join('') || '<span class="muted small">아직 장소가 없습니다.</span>'}</div>
          ${trip.places.length && geo < trip.places.length ? `<p class="small" style="color:var(--danger);margin:10px 0 0">좌표 없는 장소 ${trip.places.length - geo}곳 — 지도에 표시되지 않습니다.</p>` : ''}
        </div>
        <div class="card">
          <div class="card-title"><h3>진행</h3></div>
          <dl class="kv" style="margin:0">
            <dt>방문 완료</dt><dd class="num">${doneStops} / ${totalStops}</dd>
            <dt>일기</dt><dd class="num">${trip.journal.filter(j => j.text).length} / ${trip.days.length}일</dd>
            <dt>환율</dt><dd class="small">${trip.currency !== trip.homeCurrency ? (trip.fx[trip.currency] ? `1 ${trip.currency} = ${trip.fx[trip.currency].toFixed(4)} ${trip.homeCurrency}` : '<span style="color:var(--danger)">미설정 (가계부 탭에서 설정)</span>') : '—'}</dd>
          </dl>
        </div>
        <div class="card flat">
          <div class="card-title"><h3>이 여행 내보내기</h3></div>
          <div class="row"><button class="btn sm" id="ex-trip">여행 JSON</button></div>
        </div>
      </div>
    </div>`;

  root.querySelector('#chk').onclick = e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    if (e.target.matches('input')) updateTrip(trip.id, t => { const c = t.checklist.find(x => x.id === li.dataset.id); c.done = e.target.checked; });
    if (e.target.matches('.x')) updateTrip(trip.id, t => { t.checklist = t.checklist.filter(x => x.id !== li.dataset.id); });
  };
  root.querySelector('#chk-add').onsubmit = e => { e.preventDefault(); const v = e.target.t.value.trim(); if (!v) return; updateTrip(trip.id, t => t.checklist.push({ id: uid(), text: v, done: false })); };
  root.querySelector('#ex-trip').onclick = () => download(`${trip.title.replace(/[\\/:*?"<>|]/g, '_')}.json`, JSON.stringify(trip, null, 2), 'application/json');
}
