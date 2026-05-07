import { describe, it, expect } from 'vitest';
import { float32ToPcm16Base64, pcm16Base64ToFloat32 } from '@shared/util/pcmCodec';

describe('pcmCodec', () => {
  it('encodes a known Float32 sample to PCM16 base64', () => {
    // 4 samples at amplitudes 0, 0.5, -0.5, 1.0 (clamped)
    const input = new Float32Array([0, 0.5, -0.5, 1.0]);
    const result = float32ToPcm16Base64(input);

    // Manually computed expected:
    // 0    -> 0x0000      -> bytes 00 00
    // 0.5  -> 16384       -> bytes 00 40 (little endian, 0.5 * 32767 = 16383.5 rounds up)
    // -0.5 -> -16384      -> bytes 00 C0
    // 1.0  -> 32767       -> bytes FF 7F
    const expectedBytes = new Uint8Array([0x00, 0x00, 0x00, 0x40, 0x00, 0xc0, 0xff, 0x7f]);
    const expected = Buffer.from(expectedBytes).toString('base64');
    expect(result).toBe(expected);
  });

  it('round-trips Float32 ↔ base64 ↔ Float32 (within quantization tolerance)', () => {
    const input = new Float32Array([0, 0.25, -0.25, 0.7, -0.9]);
    const encoded = float32ToPcm16Base64(input);
    const decoded = pcm16Base64ToFloat32(encoded);
    expect(decoded.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(Math.abs(decoded[i]! - input[i]!)).toBeLessThan(1 / 32768);
    }
  });

  it('clamps values outside [-1, 1]', () => {
    const input = new Float32Array([2.0, -2.0]);
    const decoded = pcm16Base64ToFloat32(float32ToPcm16Base64(input));
    expect(decoded[0]).toBeCloseTo(1.0, 5);
    expect(decoded[1]).toBeCloseTo(-1.0, 5);
  });

  it('treats NaN and ±Infinity as silence', () => {
    const input = new Float32Array([NaN, Infinity, -Infinity, 0]);
    const decoded = pcm16Base64ToFloat32(float32ToPcm16Base64(input));
    expect(decoded[0]).toBe(0);
    expect(decoded[1]).toBe(0);
    expect(decoded[2]).toBe(0);
    expect(decoded[3]).toBe(0);
  });

  it('handles empty input', () => {
    expect(float32ToPcm16Base64(new Float32Array(0))).toBe('');
    expect(pcm16Base64ToFloat32('').length).toBe(0);
  });
});
