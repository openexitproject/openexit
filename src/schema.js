import { assert, json } from './util.js';

export const PROTOCOL_VERSION = Object.freeze({ major: 1, minor: 0 });
export const BUNDLE_FORMAT = 'openexit.bundle';

export function validateSource(source) {
  assert(source && typeof source === 'object' && !Array.isArray(source), 'source description must be an object');
  assert(typeof source.name === 'string' && source.name.trim(), 'source.name is required');
  assert(typeof source.schemaVersion === 'string' && source.schemaVersion.trim(), 'source.schemaVersion is required');
  json(source, 'source description');
  return source;
}

export function validateRecord(record) {
  assert(record && typeof record === 'object' && !Array.isArray(record), 'record must be an object');
  assert(typeof record.type === 'string' && record.type.trim(), 'record.type is required');
  assert(typeof record.id === 'string' && record.id.trim(), 'record.id is required');
  assert(Object.hasOwn(record, 'state'), 'record.state is required');
  assert(Object.keys(record).every(key => ['type', 'id', 'state', 'links', 'meta'].includes(key)), 'record has unknown fields');
  json(record, 'record');
  return record;
}

export function validateManifest(manifest) {
  assert(manifest && manifest.format === BUNDLE_FORMAT, 'unrecognized bundle format');
  assert(typeof manifest.bundleId === 'string' && manifest.bundleId.length > 0, 'missing bundle id');
  assert(manifest.protocol?.major === PROTOCOL_VERSION.major, `unsupported protocol major version ${manifest.protocol?.major}`, 'INCOMPATIBLE_VERSION');
  assert(Number.isInteger(manifest.protocol.minor) && manifest.protocol.minor >= 0, 'invalid protocol minor version');
  validateSource(manifest.source);
  assert(Number.isInteger(manifest.chunkSize) && manifest.chunkSize > 0, 'invalid chunk size');
  assert(Array.isArray(manifest.chunks), 'manifest chunks must be an array');
  assert(Number.isSafeInteger(manifest.recordCount) && manifest.recordCount >= 0, 'invalid record count');
  assert(typeof manifest.complete === 'boolean', 'invalid completion flag');
  let count = 0;
  for (const [index, chunk] of manifest.chunks.entries()) {
    assert(chunk.index === index && chunk.file === `chunk-${String(index).padStart(8, '0')}.ndjson`, 'invalid chunk index or filename');
    assert(Number.isInteger(chunk.count) && chunk.count > 0 && chunk.count <= manifest.chunkSize, 'invalid chunk count');
    assert(chunk.firstSeq === count && chunk.lastSeq === count + chunk.count - 1, 'invalid chunk sequence range');
    assert(typeof chunk.sha256 === 'string' && /^[a-f0-9]{64}$/.test(chunk.sha256), 'invalid chunk digest');
    count += chunk.count;
  }
  assert(count === manifest.recordCount, 'record count does not match chunks');
  json(manifest.nextCursor, 'next cursor');
  return manifest;
}

