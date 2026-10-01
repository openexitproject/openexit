import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';

export class PaspError extends Error {
  constructor(code, message, path = undefined) {
    super(message);
    this.name = 'PaspError';
    this.code = code;
    this.path = path;
  }
}

const fail = (code, message, path) => { throw new PaspError(code, message, path); };
const exists = async path => { try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const resourceName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function safePath(root, value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) fail('PASP_PATH_TRAVERSAL', `unsafe package path: ${value}`);
  const normalized = normalize(value);
  if (normalized === '..' || normalized.startsWith(`..${sep}`) || isAbsolute(normalized)) fail('PASP_PATH_TRAVERSAL', `unsafe package path: ${value}`);
  const absolute = resolve(root, normalized);
  const rel = relative(resolve(root), absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`)) fail('PASP_PATH_TRAVERSAL', `unsafe package path: ${value}`);
  return absolute;
}

async function jsonFile(path, code = 'PASP_INVALID_MANIFEST') {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { fail(code, `invalid JSON: ${path}`, path); }
}

function requireString(value, message, code = 'PASP_INVALID_MANIFEST') { if (typeof value !== 'string' || !value) fail(code, message); }
function requireNonNegativeInteger(value, message, code = 'PASP_INVALID_MANIFEST') { if (!Number.isSafeInteger(value) || value < 0) fail(code, message); }

async function validateResource(root, entry, seenResources) {
  if (!entry || !resourceName.test(entry.name)) fail('PASP_INVALID_RESOURCE', 'invalid resource name');
  if (seenResources.has(entry.name)) fail('PASP_DUPLICATE_RESOURCE', `duplicate resource: ${entry.name}`);
  seenResources.add(entry.name);
  const descriptorPath = safePath(root, entry.descriptor);
  if (!await exists(descriptorPath)) fail('PASP_INVALID_RESOURCE', `missing resource descriptor: ${entry.descriptor}`, entry.descriptor);
  const descriptor = await jsonFile(descriptorPath, 'PASP_INVALID_RESOURCE');
  if (!isPlainObject(descriptor) || descriptor.name !== entry.name || !resourceName.test(descriptor.name)) fail('PASP_INVALID_RESOURCE', `invalid resource descriptor: ${entry.name}`);
  if (!Array.isArray(descriptor.identity) || descriptor.identity.length === 0 || descriptor.identity.some(x => typeof x !== 'string' || !x)) fail('PASP_INVALID_RESOURCE', `invalid identity for ${entry.name}`);
  requireNonNegativeInteger(descriptor.recordCount, `invalid record count for ${entry.name}`, 'PASP_INVALID_RESOURCE');
  if (!(typeof descriptor.schema === 'string' || isPlainObject(descriptor.schema))) fail('PASP_INVALID_RESOURCE', `missing schema for ${entry.name}`);
  if (typeof descriptor.schema === 'string') {
    const schemaPath = safePath(root, descriptor.schema);
    if (!await exists(schemaPath)) fail('PASP_MISSING_SCHEMA', `missing schema: ${descriptor.schema}`, descriptor.schema);
  }
  if (!Array.isArray(descriptor.chunks)) fail('PASP_INVALID_RESOURCE', `missing chunks for ${entry.name}`);
  let records = 0;
  for (let i = 0; i < descriptor.chunks.length; i++) {
    const chunk = descriptor.chunks[i];
    if (!chunk || chunk.sequence !== i + 1 || typeof chunk.path !== 'string' || !/^resources\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/\d{8}\.ndjson$/.test(chunk.path) || !Number.isSafeInteger(chunk.recordCount) || chunk.recordCount < 0 || !Number.isSafeInteger(chunk.uncompressedBytes) || chunk.uncompressedBytes < 0 || !/^[a-f0-9]{64}$/.test(chunk.sha256)) fail('PASP_INVALID_RESOURCE', `invalid chunk for ${entry.name}`);
    const chunkPath = safePath(root, chunk.path);
    if (!await exists(chunkPath)) fail('PASP_INVALID_RESOURCE', `missing chunk: ${chunk.path}`, chunk.path);
    const bytes = await readFile(chunkPath);
    if (bytes.length !== chunk.uncompressedBytes || sha256(bytes) !== chunk.sha256) fail('PASP_CHECKSUM_MISMATCH', `checksum mismatch: ${chunk.path}`, chunk.path);
    const lines = createInterface({ input: createReadStream(chunkPath), crlfDelay: Infinity });
    let count = 0;
    for await (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try { record = JSON.parse(line); } catch { fail('PASP_INVALID_RECORD', `invalid JSON record: ${chunk.path}`, chunk.path); }
      if (!isPlainObject(record)) fail('PASP_INVALID_RECORD', `record is not an object: ${chunk.path}`, chunk.path);
      for (const identity of descriptor.identity) if (!(identity in record)) fail('PASP_INVALID_RECORD', `record missing identity ${identity}: ${chunk.path}`, chunk.path);
      count++;
    }
    if (count !== chunk.recordCount) fail('PASP_INVALID_RESOURCE', `chunk record count mismatch: ${chunk.path}`, chunk.path);
    records += count;
  }
  if (records !== descriptor.recordCount) fail('PASP_INVALID_RESOURCE', `resource record count mismatch: ${entry.name}`);
}

async function validateAssets(root, manifest) {
  const assets = manifest.assets;
  if (!isPlainObject(assets) || !Number.isSafeInteger(assets.count) || assets.count < 0 || !Number.isSafeInteger(assets.totalBytes) || assets.totalBytes < 0) fail('PASP_INVALID_MANIFEST', 'invalid assets summary');
  if (assets.count === 0) return 0;
  const indexPath = safePath(root, assets.index ?? 'assets/index.ndjson');
  if (!await exists(indexPath)) fail('PASP_MISSING_ASSET', 'missing asset index', assets.index);
  const lines = createInterface({ input: createReadStream(indexPath), crlfDelay: Infinity });
  let count = 0; let bytesTotal = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const asset = (() => { try { return JSON.parse(line); } catch { fail('PASP_MISSING_ASSET', 'invalid asset index line'); } })();
    if (!isPlainObject(asset) || typeof asset.id !== 'string' || typeof asset.path !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.byteLength) || asset.byteLength < 0) fail('PASP_MISSING_ASSET', 'invalid asset descriptor');
    const assetPath = safePath(root, asset.path);
    if (!await exists(assetPath)) fail('PASP_MISSING_ASSET', `missing asset: ${asset.path}`, asset.path);
    const content = await readFile(assetPath);
    if (content.length !== asset.byteLength || sha256(content) !== asset.sha256) fail('PASP_CHECKSUM_MISMATCH', `asset checksum mismatch: ${asset.path}`, asset.path);
    count++; bytesTotal += asset.byteLength;
  }
  if (count !== assets.count || bytesTotal !== assets.totalBytes) fail('PASP_MISSING_ASSET', 'asset summary mismatch');
  return count;
}

async function validateRelationships(root, manifest, resourceNames) {
  if (!manifest.relationships) return 0;
  const relationshipsPath = safePath(root, manifest.relationships);
  if (!await exists(relationshipsPath)) fail('PASP_INVALID_RELATIONSHIP', 'missing relationships file');
  const relationships = await jsonFile(relationshipsPath, 'PASP_INVALID_RELATIONSHIP');
  if (!Array.isArray(relationships)) fail('PASP_INVALID_RELATIONSHIP', 'relationships must be an array');
  for (const relationship of relationships) {
    if (!isPlainObject(relationship) || !isPlainObject(relationship.from) || !isPlainObject(relationship.to) || !resourceNames.has(relationship.from.resource) || !resourceNames.has(relationship.to.resource) || !['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many', 'reference'].includes(relationship.cardinality) || typeof relationship.from.pointer !== 'string' || typeof relationship.to.pointer !== 'string') fail('PASP_INVALID_RELATIONSHIP', 'invalid relationship');
  }
  return relationships.length;
}

export async function inspectPaspPackage(directory) {
  const root = resolve(directory);
  const manifestPath = join(root, 'manifest.json');
  if (!await exists(manifestPath)) fail('PASP_MALFORMED_PACKAGE', 'missing manifest.json');
  const manifest = await jsonFile(manifestPath);
  if (!isPlainObject(manifest)) fail('PASP_INVALID_MANIFEST', 'manifest must be an object');
  if (typeof manifest.paspVersion !== 'string') fail('PASP_INVALID_MANIFEST', 'missing PASP version');
  if (manifest.paspVersion !== '1.0') fail('PASP_UNSUPPORTED_VERSION', `unsupported PASP version: ${manifest.paspVersion}`);
  if (manifest.format !== 'openexit.bundle' || !isPlainObject(manifest.scope) || typeof manifest.scope.type !== 'string' || typeof manifest.scope.id !== 'string' || !isPlainObject(manifest.producer) || !isPlainObject(manifest.consistency) || !['snapshot', 'bounded', 'best_effort'].includes(manifest.consistency.level) || !Array.isArray(manifest.resources)) fail('PASP_INVALID_MANIFEST', 'invalid PASP manifest');
  const names = new Set();
  for (const entry of manifest.resources) {
    if (!entry || typeof entry.name !== 'string' || !resourceName.test(entry.name)) fail('PASP_INVALID_RESOURCE', 'invalid resource name');
    if (names.has(entry.name)) fail('PASP_DUPLICATE_RESOURCE', `duplicate resource: ${entry.name}`);
    names.add(entry.name);
  }
  names.clear();
  for (const entry of manifest.resources) await validateResource(root, entry, names);
  const assetCount = await validateAssets(root, manifest);
  const relationshipCount = await validateRelationships(root, manifest, names);
  return { valid: true, paspVersion: '1.0', resources: names.size, assets: assetCount, relationships: relationshipCount, errors: [] };
}

export async function inspectPaspPackageResult(directory) {
  try { return await inspectPaspPackage(directory); }
  catch (error) {
    if (error instanceof PaspError) return { valid: false, paspVersion: null, resources: 0, assets: 0, errors: [{ code: error.code, message: error.message, ...(error.path ? { path: error.path } : {}) }] };
    throw error;
  }
}
