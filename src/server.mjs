import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { eventArguments, TimeTreeClient } from './timetree.mjs';

const client = new TimeTreeClient({
  email: process.env.TIMETREE_EMAIL, password: process.env.TIMETREE_PASSWORD,
});
delete process.env.TIMETREE_EMAIL;
delete process.env.TIMETREE_PASSWORD;
const server = new McpServer({ name: 'local-timetree-mcp', version: '0.1.0' });
const annotations = { readOnlyHint: true, openWorldHint: true };

function result(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

server.registerTool('list_calendars', {
  description: 'List active TimeTree calendars with IDs and names.',
  annotations,
}, async () => result(await client.listCalendars()));

server.registerTool('get_events', {
  description: 'List events by start time. Recurring series are returned at the original start only. Dates are Unix milliseconds; bounds are exclusive.',
  inputSchema: eventArguments,
  annotations,
}, async args => result(await client.getEvents(args)));

await server.connect(new StdioServerTransport());
