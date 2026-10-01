import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../protocol/pasp/v1/conformance/', import.meta.url);
const rootPath = decodeURIComponent(root.pathname).replace(/^\//, '').replace(/\//g, '\\');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const resourceName = name => `resources/${name}`;

async function put(relative, content) {
  const path = join(rootPath, relative.replaceAll('/', '\\'));
  await mkdir(path.includes('\\') ? path.slice(0, path.lastIndexOf('\\')) : path, { recursive: true });
  await writeFile(path, content);
}

function manifest({ resources = [], assets = { count: 0, totalBytes: 0 }, consistency = 'snapshot', relationships = false } = {}) {
  return {
    format: 'openexit.bundle', paspVersion: '1.0', packageId: 'pkg-fixture', exportId: 'export-fixture',
    createdAt: '2026-01-01T00:00:00Z', producer: { name: 'openexit-fixture', version: '1.0.0' },
    scope: { type: 'organization', id: 'org_fixture' }, consistency: { level: consistency },
    resources: resources.map(name => ({ name, descriptor: `${resourceName(name)}/resource.json` })),
    assets, integrity: { algorithm: 'sha256' },
    ...(relationships ? { relationships: 'relationships.json' } : {})
  };
}

async function resource(base, name, records, { identity = ['id'], chunks = 1, schema = { type: 'object' } } = {}) {
  const pieces = Array.from({ length: chunks }, (_, index) => records.filter((_, i) => i % chunks === index));
  const descriptors = [];
  for (let i = 0; i < pieces.length; i++) {
    const bytes = Buffer.from(pieces[i].map(record => JSON.stringify(record) + '\n').join(''));
    const sequence = i + 1;
    const path = `${resourceName(name)}/${String(sequence).padStart(8, '0')}.ndjson`;
    await put(`${base}/${path}`, bytes);
    descriptors.push({ sequence, path, recordCount: pieces[i].length, uncompressedBytes: bytes.length, sha256: sha(bytes) });
  }
  await put(`${base}/${resourceName(name)}/resource.json`, json({ name, schema, identity, recordCount: records.length, chunks: descriptors, ordered: true }));
}

await rm(rootPath, { recursive: true, force: true });
await mkdir(rootPath, { recursive: true });

const basic = [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }];
for (const [id, setup] of Object.entries({
  'valid/minimal': { resources: [['users', basic]] },
  'valid/empty-resource': { resources: [['users', []]] },
  'valid/multiple-resources': { resources: [['users', basic], ['projects', [{ id: 'p1', name: 'PASP' }]]] },
  'valid/multiple-chunks': { resources: [['users', basic.concat([{ id: 'u3', name: 'Céline' }, { id: 'u4', name: 'Дмитрий' }])]], chunks: 2 },
  'valid/unicode': { resources: [['messages', [{ id: 'm1', text: 'こんにちは — Привет — مرحبا' }]]] },
  'valid/composite-identity': { resources: [['memberships', [{ org: 'o1', user: 'u1', role: 'admin' }]]], identity: ['org', 'user'] },
  'valid/bounded-consistency': { resources: [['users', basic]], consistency: 'bounded' },
  'valid/best-effort-consistency': { resources: [['users', basic]], consistency: 'best_effort' }
})) {
  const names = setup.resources.map(pair => pair[0]);
  await put(`${id}/manifest.json`, json(manifest({ resources: names, consistency: setup.consistency })));
  for (const [name, records] of setup.resources) await resource(id, name, records, { chunks: setup.chunks ?? 1, identity: setup.identity ?? ['id'] });
}

await put('valid/assets/manifest.json', json(manifest({ assets: { count: 1, totalBytes: 11 } })));
await put('valid/assets/assets/objects/logo.bin', Buffer.from('hello asset'));
await put('valid/assets/assets/index.ndjson', JSON.stringify({ id: 'logo', path: 'assets/objects/logo.bin', sha256: sha(Buffer.from('hello asset')), byteLength: 11, mediaType: 'text/plain' }) + '\n');
await put('valid/relationships/manifest.json', json(manifest({ resources: ['users', 'projects'], relationships: true })));
await resource('valid/relationships', 'users', basic); await resource('valid/relationships', 'projects', [{ id: 'p1', name: 'PASP' }]);
await put('valid/relationships/relationships.json', json([{ id: 'user-project', from: { resource: 'users', pointer: '/id' }, to: { resource: 'projects', pointer: '/id' }, cardinality: 'many-to-many' }]));

const invalid = {
  'invalid/unsupported-version': { manifest: { ...manifest(), paspVersion: '2.0' } },
  'invalid/invalid-manifest': { manifest: { format: 'openexit.bundle' } },
  'invalid/missing-schema': { manifest: manifest({ resources: ['users'] }), resource: { name: 'users', schema: 'schemas/missing.schema.json', identity: ['id'], recordCount: 0, chunks: [] } },
  'invalid/invalid-resource': { manifest: manifest({ resources: ['bad/name'] }), resourcePath: 'resources/bad/name/resource.json', resource: { name: 'bad/name', schema: { type: 'object' }, identity: ['id'], recordCount: 0, chunks: [] } },
  'invalid/duplicate-resource': { manifest: { ...manifest(), resources: [{ name: 'users', descriptor: 'resources/users/resource.json' }, { name: 'users', descriptor: 'resources/users/resource.json' }] } },
  'invalid/missing-asset': { manifest: manifest({ assets: { count: 1, totalBytes: 3 } }), assets: JSON.stringify({ id: 'missing', path: 'assets/objects/missing.bin', sha256: '0'.repeat(64), byteLength: 3 }) + '\n' },
  'invalid/invalid-relationship': { manifest: { ...manifest({ relationships: true }), resources: [] }, relationships: [{ id: 'bad', from: { resource: 'missing', pointer: '/id' }, to: { resource: 'missing2', pointer: '/id' }, cardinality: 'one-to-one' }] },
  'invalid/path-traversal': { manifest: { ...manifest(), resources: [{ name: 'users', descriptor: '../outside/resource.json' }] } },
  'invalid/invalid-record': { manifest: manifest({ resources: ['users'] }), resource: { name: 'users', schema: { type: 'object' }, identity: ['id'], recordCount: 1, chunks: [{ sequence: 1, path: 'resources/users/00000001.ndjson', recordCount: 1, uncompressedBytes: 3, sha256: sha(Buffer.from('[]\n')) }] }, chunk: '[]\n' }
};
for (const [id, setup] of Object.entries(invalid)) {
  await put(`${id}/manifest.json`, json(setup.manifest));
  if (setup.resource) await put(`${id}/${setup.resourcePath ?? 'resources/users/resource.json'}`, json(setup.resource));
  if (setup.chunk !== undefined) await put(`${id}/resources/users/00000001.ndjson`, setup.chunk);
  if (setup.assets) await put(`${id}/assets/index.ndjson`, setup.assets);
  if (setup.relationships) await put(`${id}/relationships.json`, json(setup.relationships));
}
// Generate the checksum failure from a valid package after its digest was recorded.
await put('invalid/bad-checksum/manifest.json', json(manifest({ resources: ['users'] })));
await resource('invalid/bad-checksum', 'users', basic);
await put('invalid/bad-checksum/resources/users/00000001.ndjson', Buffer.from('{"id":"tampered"}\n'));

await mkdir(join(rootPath, 'invalid', 'missing-manifest'), { recursive: true });

const cases = [
  ...['minimal', 'empty-resource', 'multiple-resources', 'multiple-chunks', 'assets', 'relationships', 'unicode', 'composite-identity', 'bounded-consistency', 'best-effort-consistency'].map(name => ({ id: `valid-${name}`, path: `valid/${name}`, expected: { valid: true } })),
  [['missing-manifest', 'PASP_MALFORMED_PACKAGE'], ['unsupported-version', 'PASP_UNSUPPORTED_VERSION'], ['invalid-manifest', 'PASP_INVALID_MANIFEST'], ['missing-schema', 'PASP_MISSING_SCHEMA'], ['invalid-resource', 'PASP_INVALID_RESOURCE'], ['duplicate-resource', 'PASP_DUPLICATE_RESOURCE'], ['bad-checksum', 'PASP_CHECKSUM_MISMATCH'], ['missing-asset', 'PASP_MISSING_ASSET'], ['invalid-relationship', 'PASP_INVALID_RELATIONSHIP'], ['path-traversal', 'PASP_PATH_TRAVERSAL'], ['invalid-record', 'PASP_INVALID_RECORD']].map(([name, errorCode]) => ({ id: `invalid-${name}`, path: `invalid/${name}`, expected: { valid: false, errorCode } }))
].flat();
await put('suite.json', json({ protocolVersion: '1.0', cases }));
