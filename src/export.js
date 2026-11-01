// 내보내기: KML(구글 내 지도용), CSV, 공유 텍스트
import { esc, fmtDate, PLACE_CATEGORIES, expenseCat, fmtMoney } from './util.js';

const kmlColor = { food: 'ff2d55e0', cafe: 'ff1c95c7', sight: 'ff786f1f', shop: 'ffd65a7a', stay: 'ff4f7d2f', transit: 'ff68554a', other: 'ff75838a' };

export function tripToKML(trip) {
  const used = new Map();
  trip.days.forEach((d, di) => d.stops.forEach((s, si) => { if (s.placeId && !used.has(s.placeId)) used.set(s.placeId, `D${di + 1}-${si + 1}`); }));
  const folders = [];
  // 일자별 폴더 + 경로선
  trip.days.forEach((d, di) => {
    const pts = d.stops.map(s => trip.places.find(p => p.id === s.placeId)).filter(p => p && p.lat != null);
    if (!pts.length) return;
    const marks = d.stops.map((s, si) => {
      const p = trip.places.find(x => x.id === s.placeId); if (!p || p.lat == null) return '';
      return `<Placemark><name>${esc(`${si + 1}. ${p.name}`)}</name><description>${esc([s.time, p.localName, s.memo, p.address].filter(Boolean).join('\n'))}</description><styleUrl>#c-${p.category}</styleUrl><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`;
    }).join('');
    const line = pts.length > 1 ? `<Placemark><name>${esc(`Day ${di + 1} 경로`)}</name><styleUrl>#route</styleUrl><LineString><tessellate>1</tessellate><coordinates>${pts.map(p => `${p.lng},${p.lat},0`).join(' ')}</coordinates></LineString></Placemark>` : '';
    folders.push(`<Folder><name>${esc(`Day ${di + 1} · ${fmtDate(d.date)}${d.title ? ' · ' + d.title : ''}`)}</name>${marks}${line}</Folder>`);
  });
  // 일정에 없는 장소
  const rest = trip.places.filter(p => p.lat != null && !used.has(p.id));
  if (rest.length) folders.push(`<Folder><name>후보 장소</name>${rest.map(p => `<Placemark><name>${esc(p.name)}</name><description>${esc([p.localName, p.memo, p.address].filter(Boolean).join('\n'))}</description><styleUrl>#c-${p.category}</styleUrl><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`).join('')}</Folder>`);
  const styles = Object.keys(PLACE_CATEGORIES).map(c => `<Style id="c-${c}"><IconStyle><color>${kmlColor[c] || kmlColor.other}</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`).join('') + `<Style id="route"><LineStyle><color>ff2d55e0</color><width>3</width></LineStyle></Style>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(trip.title)}</name><description>${esc(trip.destination)}</description>${styles}${folders.join('')}</Document></kml>`;
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n');

export function placesToCSV(trip) {
  const rows = [['이름', '현지명', '분류', '위도', '경도', '주소', '메모', '영업시간', '구글지도']];
  trip.places.forEach(p => rows.push([p.name, p.localName, PLACE_CATEGORIES[p.category]?.label || p.category, p.lat ?? '', p.lng ?? '', p.address, p.memo, p.hours, p.url]));
  return csv(rows);
}

export function expensesToCSV(trip) {
  const rows = [['날짜', '분류', '금액', '통화', `${trip.homeCurrency} 환산`, '결제', '내용', '장소', '계획/실제']];
  [...trip.expenses].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    const rate = e.currency === trip.homeCurrency ? 1 : trip.fx[e.currency];
    const place = trip.places.find(p => p.id === e.placeId);
    rows.push([e.date, expenseCat(e.category).label, e.amount, e.currency, rate != null ? Math.round(e.amount * rate) : '', e.method, e.note, place ? place.name : '', e.planned ? '계획' : '실제']);
  });
  return csv(rows);
}

export function itineraryToText(trip) {
  const lines = [`${trip.emoji} ${trip.title} · ${trip.destination}`, ''];
  trip.days.forEach((d, i) => {
    lines.push(`■ Day ${i + 1} ${fmtDate(d.date)}${d.title ? ' — ' + d.title : ''}`);
    if (d.note) lines.push(`  ※ ${d.note}`);
    d.stops.forEach((s, si) => {
      const p = trip.places.find(x => x.id === s.placeId);
      lines.push(`  ${si + 1}. ${s.time ? s.time + ' ' : ''}${p ? p.name : s.title}${p && p.localName ? ` (${p.localName})` : ''}`);
      if (s.memo) lines.push(`     ${s.memo}`);
      if (s.transport) lines.push(`     ↳ ${s.transport}`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

export function summaryText(trip, totals) {
  return `${trip.title} 가계부 합계: ${fmtMoney(totals.actual, trip.homeCurrency)} (예산 ${fmtMoney(trip.budget.amount, trip.budget.currency)})`;
}
