import { createHash, randomUUID } from 'node:crypto';
import { writeFile, rename, rm } from 'node:fs/promises';

export class BundleError extends Error {
  constructor(message, code = 'INVALID_BUNDLE') {
    super(message);
    this.name = 'BundleError';
    this.code = code;
  }
}

export function assert(condition, message, code) {
  if (!condition) throw new BundleError(message, code);
}

export function json(value, label = 'value') {
  const seen = new WeakSet();
  function visit(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      assert(Number.isFinite(item), label + ' contains a non-finite number');
      return;
    }
    assert(item && typeof item === 'object', label + ' must contain only JSON values');
    assert(Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null,
      label + ' must contain only plain objects and arrays');
    assert(!seen.has(item), label + ' contains a cycle or shared object');
    seen.add(item);
    for (const nested of Object.values(item)) visit(nested);
    seen.delete(item);
  }
  visit(value);
  const encoded = JSON.stringify(value);
  assert(encoded !== undefined, label + ' must be JSON serializable');
  return encoded;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function atomicWrite(path, bytes) {
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}
