// 일정 공유 링크: 여행 JSON을 gzip+base64url로 압축해 #/join/<data> 로 전달 (서버 없음)
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeShare(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (!('CompressionStream' in window)) return 'r' + b64u(bytes);
  return 'z' + b64u(await pipe(bytes, new CompressionStream('gzip')));
}
export async function decodeShare(s) {
  const kind = s[0], bytes = unb64u(s.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('gzip')) : bytes;
  return new TextDecoder().decode(raw);
}

// 공유용 여행 사본: 기기에만 있는 업로드 사진(img:)은 빼고, 사진 기록도 제외
export function shareableTrip(t) {
  const c = JSON.parse(JSON.stringify(t));
  const strip = v => (typeof v === 'string' && v.startsWith('img:')) ? '' : v;
  c.coverImage = strip(c.coverImage);
  c.places.forEach(p => { p.photo = strip(p.photo); });
  c.photos = [];
  return c;
}
