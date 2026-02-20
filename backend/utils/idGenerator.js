// utils/idGenerator.js
import { randomBytes } from 'crypto';

export function generate24HexId() {
  // 4 bytes = timestamp en segundos desde epoch
  const ts = Math.floor(Date.now() / 1000);
  const tsHex = ts.toString(16).padStart(8, '0'); // 8 chars

  // 8 bytes aleatorios = 16 chars
  const randomHex = randomBytes(8).toString('hex'); // 16 chars

  return tsHex + randomHex; // total: 24 chars hex
}
