import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inspectPaspPackageResult } from '../src/index.js';

const root = new URL('../protocol/pasp/v1/conformance/', import.meta.url);
const suite = JSON.parse(await readFile(new URL('suite.json', root), 'utf8'));

test('PASP 1.0 shared conformance suite', async () => {
  const results = [];
  for (const kase of suite.cases) {
    const result = await inspectPaspPackageResult(fileURLToPath(new URL(kase.path + '/', root)));
    assert.equal(result.valid, kase.expected.valid, kase.id);
    if (!kase.expected.valid) assert.equal(result.errors[0]?.code, kase.expected.errorCode, kase.id);
    results.push({ id: kase.id, valid: result.valid });
  }
  assert.equal(results.length, suite.cases.length);
  assert.equal(results.filter(result => result.valid).length, suite.cases.filter(kase => kase.expected.valid).length);
});

