import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TimeTreeClient } from '../src/timetree.mjs';

const signedIn = () => new Response(null, { headers: { 'set-cookie': '_session_id=test; HttpOnly' } });
const newClient = fetcher => new TimeTreeClient({ email: 'fake@example.invalid', password: 'fake', fetcher });

test('renews the session once and returns only active calendar IDs and names', async () => {
  const calls = [];
  const client = newClient(async (url, options) => {
    calls.push(options.method);
    assert.equal(new URL(url).origin, 'https://timetreeapp.com');
    assert.equal(options.redirect, 'error');
    if (options.method === 'PUT') {
      assert.equal(new URL(url).pathname, '/api/v1/auth/email/signin');
      assert.equal(JSON.parse(options.body).uid, 'fake@example.invalid');
      return signedIn();
    }
    assert.equal(options.headers.Cookie, '_session_id=test');
    if (calls.length === 2) return new Response(null, { status: 401 });
    return Response.json({ calendars: [
      { id: 12, name: '測試', users: [{ name: 'private' }] },
      { id: 13, name: 'inactive', deactivated_at: 1 },
    ] });
  });
  assert.deepEqual(await client.listCalendars(), { calendars: [{ id: '12', name: '測試' }] });
  assert.deepEqual(calls, ['PUT', 'GET', 'PUT', 'GET']);
});

test('follows the sync cursor, applies updates and excludes deleted events and memos', async () => {
  const row = { title: '原始', start_at: 1000, end_at: 2000, all_day: false, note: 'private' };
  const client = newClient(async (url, { method }) => {
    if (method === 'PUT') return signedIn();
    const { pathname, search } = new URL(url);
    assert.equal(pathname, '/api/v1/calendar/test/events/sync');
    if (search === '?since=0') {
      return Response.json({ since: 7, chunk: true, events: [
        { ...row, uuid: 'keep' }, { ...row, uuid: 'remove' },
        { ...row, uuid: 'memo', category: 2 },
      ] });
    }
    assert.equal(search, '?since=7');
    return Response.json({ since: 8, chunk: false, events: [
      { ...row, uuid: 'keep', title: '更新', updated_at: 10, recurrences: ['weekly'] },
      { ...row, uuid: 'remove', deactivated_at: 1 },
      { ...row, uuid: 'excluded', start_at: 0 },
    ] });
  });
  assert.deepEqual(await client.getEvents({ calendar_id: 'test', start_after: 0 }), {
    recurring_series: 1,
    events: [{ uuid: 'keep', title: '更新', start_at: new Date(1000).toISOString(),
      end_at: new Date(2000).toISOString(), all_day: false }],
  });
});

test('rejects an unsafe ID, changed schema and repeated paging cursor', async () => {
  const blocked = newClient(() => assert.fail('unexpected request'));
  await assert.rejects(blocked.getEvents({ calendar_id: '..' }));
  const malformed = newClient(async (_, { method }) =>
    method === 'PUT' ? signedIn() : Response.json({ changed: true }));
  await assert.rejects(malformed.listCalendars(), /unexpected response format/);
  const repeated = newClient(async (_, { method }) =>
    method === 'PUT' ? signedIn() : Response.json({ since: 0, chunk: true, events: [] }));
  await assert.rejects(repeated.getEvents({ calendar_id: 'test' }), /repeated paging cursor/);
});
