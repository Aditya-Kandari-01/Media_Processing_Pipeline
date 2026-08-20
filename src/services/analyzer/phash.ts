import sharp from 'sharp';

function dct8(values: number[]): number[] {
  const output = new Array<number>(64).fill(0);
  for (let u = 0; u < 8; u += 1) {
    for (let v = 0; v < 8; v += 1) {
      let sum = 0;
      for (let x = 0; x < 8; x += 1) {
        for (let y = 0; y < 8; y += 1) {
          sum += (values[x * 8 + y] ?? 0)
            * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
            * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
        }
      }
      const au = u === 0 ? 1 / Math.sqrt(2) : 1;
      const av = v === 0 ? 1 / Math.sqrt(2) : 1;
      output[u * 8 + v] = 0.25 * au * av * sum;
    }
  }
  return output;
}

export async function computePerceptualHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const dct = dct8(Array.from(data, Number));
  const sample = dct.slice(1);
  const sorted = [...sample].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return dct.map((value) => value >= median ? '1' : '0').join('');
}

export function hammingDistance(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  let distance = Math.abs(a.length - b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance;
}
