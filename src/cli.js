#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportBundle, importBundle, inspectBundle } from './index.js';

const usage = 'Usage:\n  openexit export --adapter <module> --dir <bundle> [--chunk-size N] [--resume]\n  openexit import --adapter <module> --dir <bundle> [--batch-size N]\n  openexit inspect --dir <bundle>\n  openexit --help\n  openexit --version';

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--resume') { result.resume = true; continue; }
    if (!['--adapter', '--dir', '--chunk-size', '--batch-size'].includes(key) || !args[index + 1]) {
      throw new Error('invalid option: ' + key);
    }
    result[key.slice(2)] = args[++index];
  }
  return result;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(usage);
    return;
  }
  if (command === '--version' || command === '-v') {
    const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(metadata.version);
    return;
  }
  if (!['export', 'import', 'inspect'].includes(command)) {
    console.error(usage);
    process.exitCode = 2;
    return;
  }
  const opts = options(args);
  if (!opts.dir || (command !== 'inspect' && !opts.adapter)) {
    console.error(usage);
    process.exitCode = 2;
    return;
  }
  const directory = resolve(opts.dir);
  if (command === 'inspect') {
    console.log(JSON.stringify(await inspectBundle(directory), null, 2));
    return;
  }
  const adapter = await import(pathToFileURL(resolve(opts.adapter)).href);
  if (command === 'export') {
    const manifest = await exportBundle({
      source: adapter.source, directory, resume: !!opts.resume,
      chunkSize: opts['chunk-size'] ? Number(opts['chunk-size']) : 1000,
      onProgress: progress => console.error(JSON.stringify(progress))
    });
    console.log(JSON.stringify({ bundleId: manifest.bundleId, records: manifest.recordCount, chunks: manifest.chunks.length }));
  } else {
    const result = await importBundle({
      target: adapter.target, directory,
      batchSize: opts['batch-size'] ? Number(opts['batch-size']) : 100,
      onProgress: progress => console.error(JSON.stringify(progress))
    });
    console.log(JSON.stringify(result));
  }
}

main().catch(error => {
  console.error((error.code ? error.code + ': ' : '') + error.message);
  process.exitCode = 1;
});
