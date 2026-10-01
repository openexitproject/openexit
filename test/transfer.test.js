import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportBundle, importBundle, inspectBundle, validateRecord } from '../src/index.js';

function sourceFor(records, failAt = null) {
  return {
    describe: () => ({ name: 'fixture', schemaVersion: '1', snapshot: 'stable-1' }),
    readPage: ({ cursor, limit }) => {
      const start = cursor ?? 0;
      if (start === failAt) throw new Error('interrupted source');
      const end = Math.min(start + limit, records.length);
      return { records: records.slice(start, end), nextCursor: end, done: end === records.length };
    }
  };
}

async function workspace(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'openexit-test-'));
  try { await fn(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('exports, transforms, imports, and checkpoints a multi-chunk bundle', async () => workspace(async directory => {
  const records = Array.from({ length: 7 }, (_, i) => ({ type: 'item', id: String(i), state: { value: i } }));
  const manifest = await exportBundle({
    source: sourceFor(records), directory, chunkSize: 3,
    transform: record => ({ ...record, state: { value: record.state.value * 2 } })
  });
  assert.equal(manifest.recordCount, 7);
  assert.equal(manifest.chunks.length, 3);
  assert.equal((await inspectBundle(directory)).complete, true);

  const received = new Map();
  const target = {
    describe: () => ({ name: 'fixture-target' }),
    writeBatch: async batch => { for (const record of batch) received.set(record.id, record.state.value); }
  };
  const result = await importBundle({ target, directory, batchSize: 2 });
  assert.equal(result.importedChunks, 3);
  assert.deepEqual([...received.values()], [0, 2, 4, 6, 8, 10, 12]);
  await importBundle({ target, directory, batchSize: 2 });
  assert.equal(received.size, 7);
}));

test('export resumes from the last committed source cursor', async () => workspace(async directory => {
  const records = Array.from({ length: 5 }, (_, i) => ({ type: 'item', id: String(i), state: i }));
  await assert.rejects(exportBundle({ source: sourceFor(records, 2), directory, chunkSize: 2 }), /interrupted source/);
  assert.equal((await inspectBundle(directory)).recordCount, 2);
  const finished = await exportBundle({ source: sourceFor(records), directory, chunkSize: 2, resume: true });
  assert.equal(finished.recordCount, 5);
  assert.equal(finished.chunks.length, 3);
}));

test('import replays an interrupted chunk and rejects corruption', async () => workspace(async directory => {
  const records = Array.from({ length: 5 }, (_, i) => ({ type: 'item', id: String(i), state: i }));
  await exportBundle({ source: sourceFor(records), directory, chunkSize: 2 });
  const received = new Map();
  let fail = true;
  const target = {
    describe: () => ({ name: 'fixture-target' }),
    writeBatch: async (batch, context) => {
      for (const record of batch) received.set(record.id, record.state);
      if (context.chunkIndex === 1 && fail) { fail = false; throw new Error('interrupted target'); }
    }
  };
  await assert.rejects(importBundle({ target, directory, batchSize: 1 }), /interrupted target/);
  await importBundle({ target, directory, batchSize: 1 });
  assert.equal(received.size, 5);

  const chunk = join(directory, 'chunk-00000002.ndjson');
  await writeFile(chunk, (await readFile(chunk, 'utf8')).replace('"4"', '"tampered"'));
  const freshTarget = { describe: () => ({ name: 'fresh-target' }), writeBatch: async () => {} };
  await assert.rejects(importBundle({ target: freshTarget, directory }), error => error.code === 'CHECKSUM_MISMATCH');
}));

test('record validation rejects unsupported state values', () => {
  assert.throws(() => validateRecord({ type: 'x', id: '1', state: { missing: undefined } }));
  assert.throws(() => validateRecord({ type: 'x', id: '1', state: Number.NaN }));
});
