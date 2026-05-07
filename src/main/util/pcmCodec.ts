const MAX_INT16 = 0x7fff;
const MIN_INT16 = -0x8000;

export function float32ToPcm16Base64(samples: Float32Array): string {
  if (samples.length === 0) return '';
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]!;
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    const int16 = s < 0 ? s * -MIN_INT16 : s * MAX_INT16;
    view.setInt16(i * 2, Math.round(int16), true);
  }
  return Buffer.from(buf).toString('base64');
}

export function pcm16Base64ToFloat32(b64: string): Float32Array {
  if (b64 === '') return new Float32Array(0);
  const buf = Buffer.from(b64, 'base64');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = Math.floor(view.byteLength / 2);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const int16 = view.getInt16(i * 2, true);
    out[i] = int16 < 0 ? int16 / -MIN_INT16 : int16 / MAX_INT16;
  }
  return out;
}
