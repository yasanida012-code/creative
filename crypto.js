// 정답을 맞힌 사람만 해설을 열 수 있도록, 해설을 "정답으로 잠근" 상태로 저장합니다.
// 서버에는 정답도 해설도 원문으로 남지 않습니다. (정답 = 열쇠)

const enc = new TextEncoder();
const dec = new TextDecoder();

export function normalizeAnswer(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[．。]/g, '.')
    .replace(/[，]/g, ',');
}

function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }

function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(answer, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizeAnswer(answer)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

/** answers: 인정되는 정답 목록, payload: {text, image} */
export async function sealSolution(answers, payload) {
  const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, contentKey, enc.encode(JSON.stringify(payload)));
  const raw = await crypto.subtle.exportKey('raw', contentKey);
  const locks = [];
  const seen = new Set();
  for (const a of answers) {
    const n = normalizeAnswer(a);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const salt = rand(16), iv2 = rand(12);
    const k = await deriveKey(n, salt);
    const w = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv2 }, k, raw);
    locks.push({ s: b64(salt), i: b64(iv2), w: b64(w) });
  }
  if (!locks.length) throw new Error('정답이 비어 있어요.');
  return { v: 1, iv: b64(iv), ct: b64(ct), locks };
}

/** 맞으면 payload, 틀리면 null */
export async function openSolution(sealed, answer) {
  if (!sealed || !normalizeAnswer(answer)) return null;
  for (const l of sealed.locks) {
    try {
      const k = await deriveKey(answer, unb64(l.s));
      const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(l.i) }, k, unb64(l.w));
      const ck = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, ck, unb64(sealed.ct));
      return JSON.parse(dec.decode(pt));
    } catch (_) { /* 이 열쇠는 아님 */ }
  }
  return null;
}
