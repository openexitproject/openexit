import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('CLI has a Node shebang and reports package version', async () => {
  const source = await readFile(cli, 'utf8');
  assert.ok(source.startsWith('#!/usr/bin/env node\n'));
  const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const version = execFileSync(process.execPath, [cli, '--version'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(version, metadata.version);
});

test('CLI help documents export, import, and inspect', () => {
  const output = execFileSync(process.execPath, [cli, '--help'], { cwd: root, encoding: 'utf8' });
  for (const command of ['openexit export', 'openexit import', 'openexit inspect']) {
    assert.ok(output.includes(command));
  }
});
