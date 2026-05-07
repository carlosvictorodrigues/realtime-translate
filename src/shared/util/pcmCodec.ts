const MAX_INT16 = 0x7fff;
const MIN_INT16 = -0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function float32ToPcm16Base64(samples: Float32Array): string {
  if (samples.length === 0) return '';
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]!;
    if (!Number.isFinite(s)) s = 0; // NaN, ±Infinity -> silence
    else if (s > 1) s = 1;
    else if (s < -1) s = -1;
    const int16 = s < 0 ? s * -MIN_INT16 : s * MAX_INT16;
    view.setInt16(i * 2, Math.round(int16), true);
  }
  return bytesToBase64(new Uint8Array(buf));
}

export function pcm16Base64ToFloat32(b64: string): Float32Array {
  if (b64 === '') return new Float32Array(0);
  const bytes = base64ToBytes(b64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = Math.floor(view.byteLength / 2);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const int16 = view.getInt16(i * 2, true);
    out[i] = int16 < 0 ? int16 / -MIN_INT16 : int16 / MAX_INT16;
  }
  return out;
}
