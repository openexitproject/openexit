import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { assert, atomicWrite, json, sha256, BundleError } from './util.js';
import { BUNDLE_FORMAT, PROTOCOL_VERSION, validateManifest, validateRecord, validateSource } from './schema.js';

const MANIFEST = 'manifest.json';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function saveManifest(directory, manifest) {
  validateManifest(manifest);
  await atomicWrite(join(directory, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
}

export async function inspectBundle(directory) {
  return validateManifest(await readJson(join(directory, MANIFEST)));
}

/**
 * Source adapter: describe() -> {name, schemaVersion, ...};
 * readPage({cursor, limit}) -> {records, nextCursor, done}.
 * A cursor identifies the first unread record in a stable snapshot.
 */
export async function exportBundle({ source, directory, chunkSize = 1000, resume = false, transform = record => record, onProgress }) {
  assert(source && typeof source.describe === 'function' && typeof source.readPage === 'function', 'source adapter needs describe and readPage');
  assert(Number.isInteger(chunkSize) && chunkSize > 0, 'chunkSize must be positive');
  const description = validateSource(await source.describe());
  await mkdir(directory, { recursive: true });
  let manifest;
  if (resume) {
    manifest = await inspectBundle(directory);
    assert(json(manifest.source) === json(description), 'source description changed since export began', 'SOURCE_CHANGED');
    assert(manifest.chunkSize === chunkSize, 'chunk size changed since export began');
    if (manifest.complete) return manifest;
  } else {
    try {
      await stat(join(directory, MANIFEST));
      throw new BundleError('bundle already exists; pass resume to continue', 'BUNDLE_EXISTS');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    manifest = {
      format: BUNDLE_FORMAT, protocol: { ...PROTOCOL_VERSION }, bundleId: randomUUID(),
      createdAt: new Date().toISOString(), source: description, chunkSize,
      chunks: [], recordCount: 0, nextCursor: null, complete: false
    };
    await saveManifest(directory, manifest);
  }

  while (!manifest.complete) {
    const cursor = manifest.nextCursor;
    const page = await source.readPage({ cursor, limit: chunkSize });
    assert(page && Array.isArray(page.records) && typeof page.done === 'boolean', 'readPage must return records and done');
    assert(page.records.length <= chunkSize, 'source returned more records than requested');
    assert(Object.hasOwn(page, 'nextCursor'), 'readPage must return nextCursor');
    json(page.nextCursor, 'next cursor');
    assert(page.done || json(page.nextCursor) !== json(cursor), 'source cursor did not advance');
    assert(page.done || page.records.length > 0, 'source returned an empty unfinished page');

    const records = [];
    for (const input of page.records) {
      validateRecord(input);
      const output = await transform(input, { direction: 'export', source: description });
      if (output !== null) records.push(validateRecord(output));
    }
    if (records.length) {
      const index = manifest.chunks.length;
      const file = 'chunk-' + String(index).padStart(8, '0') + '.ndjson';
      const firstSeq = manifest.recordCount;
      const bytes = Buffer.from(records.map((record, offset) => JSON.stringify({ seq: firstSeq + offset, record }) + '\n').join(''));
      await atomicWrite(join(directory, file), bytes);
      manifest.chunks.push({ index, file, count: records.length, firstSeq,
        lastSeq: firstSeq + records.length - 1, sha256: sha256(bytes) });
      manifest.recordCount += records.length;
    }
    manifest.nextCursor = page.nextCursor;
    manifest.complete = page.done;
    await saveManifest(directory, manifest);
    onProgress?.({ chunks: manifest.chunks.length, records: manifest.recordCount, complete: manifest.complete });
  }
  return manifest;
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

/** Target adapter: describe() -> {name, ...}; writeBatch(records, context) -> void.
 * writeBatch must be idempotent because a crash can replay the last chunk.
 */
export async function importBundle({ target, directory, batchSize = 100, transform = record => record, onProgress }) {
  assert(target && typeof target.describe === 'function' && typeof target.writeBatch === 'function', 'target adapter needs describe and writeBatch');
  assert(Number.isInteger(batchSize) && batchSize > 0, 'batchSize must be positive');
  const manifest = await inspectBundle(directory);
  assert(manifest.complete, 'cannot import an incomplete bundle', 'INCOMPLETE_BUNDLE');
  const description = await target.describe();
  assert(description && typeof description.name === 'string' && description.name.trim(), 'target description needs name');
  const targetKey = sha256(json(description)).slice(0, 16);
  const checkpointPath = join(directory, '.import-' + targetKey + '.json');
  let checkpoint;
  try { checkpoint = await readJson(checkpointPath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = { bundleId: manifest.bundleId, target: description, nextChunk: 0 };
  }
  assert(checkpoint.bundleId === manifest.bundleId && json(checkpoint.target) === json(description), 'checkpoint belongs to another bundle or target', 'CHECKPOINT_MISMATCH');
  assert(Number.isInteger(checkpoint.nextChunk) && checkpoint.nextChunk >= 0 && checkpoint.nextChunk <= manifest.chunks.length, 'invalid checkpoint');

  for (let index = checkpoint.nextChunk; index < manifest.chunks.length; index++) {
    const chunk = manifest.chunks[index];
    const path = join(directory, chunk.file);
    assert(await hashFile(path) === chunk.sha256, 'chunk ' + index + ' checksum mismatch', 'CHECKSUM_MISMATCH');
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    let count = 0;
    let batch = [];
    let batchIndex = 0;
    for await (const line of lines) {
      assert(line.length > 0, 'empty line in chunk ' + index);
      let entry;
      try { entry = JSON.parse(line); } catch { throw new BundleError('invalid JSON in chunk ' + index); }
      assert(entry.seq === chunk.firstSeq + count, 'sequence mismatch in chunk ' + index);
      validateRecord(entry.record);
      const output = await transform(entry.record, { direction: 'import', source: manifest.source, target: description });
      if (output !== null) batch.push(validateRecord(output));
      count++;
      if (batch.length >= batchSize) {
        await target.writeBatch(batch, { bundleId: manifest.bundleId, chunkIndex: index, batchIndex: batchIndex++ });
        batch = [];
      }
    }
    assert(count === chunk.count, 'record count mismatch in chunk ' + index);
    if (batch.length) await target.writeBatch(batch, { bundleId: manifest.bundleId, chunkIndex: index, batchIndex: batchIndex++ });
    checkpoint.nextChunk = index + 1;
    await atomicWrite(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\n');
    onProgress?.({ importedChunks: checkpoint.nextChunk, totalChunks: manifest.chunks.length });
  }
  return { bundleId: manifest.bundleId, importedChunks: checkpoint.nextChunk, recordCount: manifest.recordCount };
}
