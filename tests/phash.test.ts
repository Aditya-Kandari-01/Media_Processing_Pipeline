import { describe, expect, it } from 'vitest';
import { hammingDistance } from '../src/services/analyzer/phash.js';

describe('hammingDistance', () => {
  it('returns zero for identical hashes', () => {
    expect(hammingDistance('0101', '0101')).toBe(0);
  });

  it('counts differing bits', () => {
    expect(hammingDistance('0101', '0000')).toBe(2);
  });

  it('accounts for different lengths', () => {
    expect(hammingDistance('0101', '01')).toBe(2);
  });
});
