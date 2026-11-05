import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP stdio exposes only the two read tools and validates arguments', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))],
    env: { TIMETREE_EMAIL: '', TIMETREE_PASSWORD: '' },
  });
  const client = new Client({ name: 'test', version: '0.1.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['get_events', 'list_calendars']);
    assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
    const rejected = await client.callTool({ name: 'get_events', arguments: { calendar_id: '..' } });
    assert.equal(rejected.isError, true);
    const missingCredentials = await client.callTool({ name: 'list_calendars' });
    assert.equal(missingCredentials.isError, true);
    assert.match(missingCredentials.content[0].text, /credentials/);
  } finally {
    await client.close();
  }
});
