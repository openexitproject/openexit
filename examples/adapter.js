import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { atomicWrite } from '../src/util.js';

const input = resolve(process.env.OPENEXIT_INPUT || './examples/customers.ndjson');
const output = resolve(process.env.OPENEXIT_OUTPUT || './examples/imported');

export const source = {
  async describe() {
    const file = await stat(input);
    return { name: 'example-customers', schemaVersion: '1', input, size: file.size, modified: file.mtimeMs };
  },
  async readPage({ cursor, limit }) {
    const records = [];
    let position = cursor ?? 0;
    let fragments = [];
    for await (const block of createReadStream(input, { start: position })) {
      let start = 0;
      for (let index = 0; index < block.length; index++) {
        if (block[index] !== 10) continue;
        const line = Buffer.concat([...fragments, block.subarray(start, index)]).toString('utf8').trim();
        position += index - start + 1;
        fragments = [];
        start = index + 1;
        if (line) {
          const customer = JSON.parse(line);
          records.push({
            type: 'customer', id: String(customer.customerId),
            state: { name: customer.fullName, email: customer.email }
          });
        }
        if (records.length === limit) return { records, nextCursor: position, done: false };
      }
      if (start < block.length) {
        fragments.push(block.subarray(start));
        position += block.length - start;
      }
    }
    if (fragments.length) {
      const line = Buffer.concat(fragments).toString('utf8').trim();
      if (line) {
        const customer = JSON.parse(line);
        records.push({
          type: 'customer', id: String(customer.customerId),
          state: { name: customer.fullName, email: customer.email }
        });
      }
    }
    return { records, nextCursor: position, done: true };
  }
};

export const target = {
  describe() { return { name: 'example-account-files', output }; },
  async writeBatch(records, { bundleId, chunkIndex, batchIndex }) {
    await mkdir(output, { recursive: true });
    const file = join(output, bundleId + '-' + chunkIndex + '-' + batchIndex + '.ndjson');
    const lines = records.map(record => JSON.stringify({
      accountId: record.id,
      displayName: record.state.name,
      contactEmail: record.state.email
    }) + '\n').join('');
    await atomicWrite(file, lines);
  }
};
