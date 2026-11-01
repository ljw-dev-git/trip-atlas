// 대시보드: 여행 목록
import { getState, tripStatus, toHome } from '../store.js';
import { esc, fmtRange, fmtMoney, todayISO, daysBetween } from '../util.js';
import { tripForm } from '../forms.js';

const STATUS_LABEL = { ongoing: '여행 중', upcoming: '예정', done: '다녀옴', draft: '초안' };

export function renderDashboard(root) {
  const { trips } = getState();
  const today = todayISO();
  const groups = { ongoing: [], upcoming: [], done: [], draft: [] };
  trips.forEach(t => groups[tripStatus(t, today)].push(t));
  groups.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  groups.done.sort((a, b) => b.startDate.localeCompare(a.startDate));

  const totalSpent = trips.reduce((sum, t) => sum + t.expenses.filter(e => !e.planned).reduce((s, e) => s + (toHome(t, e.amount, e.currency) || 0), 0), 0);
  const totalDays = trips.reduce((s, t) => s + (t.startDate && t.endDate ? daysBetween(t.startDate, t.endDate) + 1 : 0), 0);
  const next = groups.ongoing[0] || groups.upcoming[0];
  const dday = next ? daysBetween(today, next.startDate) : null;

  root.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">Personal travel ledger</div>
        <h1>여행을 <strong>계획</strong>하고,<br>다녀온 뒤엔 <strong>기록</strong>으로.</h1>
        <p>일정·지도·가계부·일기를 여행별로 한 곳에 모았습니다. ${next ? (dday > 0 ? `다음 여행 <b>${esc(next.title)}</b>까지 <b class="num">D-${dday}</b>.` : `지금 <b>${esc(next.title)}</b> 여행 중입니다.`) : '새 여행을 만들어 시작하세요.'}</p>
      </div>
      <div class="hero-stats">
        <div class="stat"><span class="v num">${trips.length}</span><span class="l">여행</span></div>
        <div class="stat"><span class="v num">${totalDays}</span><span class="l">여행한 날</span></div>
        <div class="stat"><span class="v num" style="font-size:22px">${fmtMoney(totalSpent, 'KRW')}</span><span class="l">실제 지출 합계</span></div>
      </div>
    </section>
    ${section('진행 중', groups.ongoing)}
    ${section('다가오는 여행', groups.upcoming, true)}
    ${section('다녀온 여행', groups.done)}
    ${section('초안', groups.draft)}
  `;
  root.querySelectorAll('[data-new-trip]').forEach(b => b.onclick = () => tripForm());
}

function section(title, list, withNew = false) {
  if (!list.length && !withNew) return '';
  return `<div class="section-head"><h2>${title}</h2>${withNew ? '<button class="btn primary" data-new-trip>+ 새 여행</button>' : ''}</div>
  <div class="trip-grid">${list.map(card).join('')}${withNew ? '<button class="trip-card new" data-new-trip><span class="plus">+</span><span>새 여행 만들기</span></button>' : ''}</div>`;
}

function card(t) {
  const st = tripStatus(t);
  const spent = t.expenses.filter(e => !e.planned).reduce((s, e) => s + (toHome(t, e.amount, e.currency) || 0), 0);
  const budget = t.budget.amount || 0;
  const pct = budget ? Math.min(100, Math.round(spent / budget * 100)) : 0;
  const stops = t.days.reduce((s, d) => s + d.stops.length, 0);
  return `<a class="trip-card reveal" href="#/trip/${esc(t.id)}">
    <div class="bg cover-${esc(t.cover || 'sea')}"></div>
    <div class="tc-top"><span class="emoji">${esc(t.emoji)}</span><span class="status ${st}">${STATUS_LABEL[st]}</span></div>
    <div class="tc-body">
      <h3>${esc(t.title)}</h3>
      <div class="dest">${esc(t.destination || '목적지 미정')} · ${esc(fmtRange(t.startDate, t.endDate))}</div>
      <div class="meta"><span>장소 ${t.places.length}</span><span>일정 ${stops}</span><span>${budget ? `${fmtMoney(spent, t.homeCurrency)} / ${fmtMoney(budget, t.homeCurrency)}` : (spent ? fmtMoney(spent, t.homeCurrency) : '지출 없음')}</span></div>
      ${budget ? `<div class="bar"><i class="${spent > budget ? 'over' : ''}" style="width:${pct}%"></i></div>` : ''}
    </div></a>`;
}
