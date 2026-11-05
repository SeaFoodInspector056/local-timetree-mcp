import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]+$/);
const timestamp = z.number().int().min(-8.64e15).max(8.64e15);
const inactive = { deactivated_at: z.number().nullish() };
const calendarsSchema = z.object({
  calendars: z.array(z.object({
    id: z.union([z.string(), z.number()]).transform(String).pipe(id),
    name: z.string(), ...inactive,
  })),
});
const eventsSchema = z.object({
  events: z.array(z.object({
    uuid: z.string(), title: z.string(), start_at: timestamp, end_at: timestamp,
    all_day: z.boolean(), category: z.number().optional(),
    updated_at: z.number().nullish(), recurrences: z.array(z.unknown()).optional(),
    ...inactive,
  })),
  since: z.number().int().nonnegative(),
  chunk: z.boolean(),
});

export const eventArguments = z.strictObject({
  calendar_id: id,
  start_after: timestamp.optional(),
  start_before: timestamp.optional(),
  include_memos: z.boolean().default(false),
}).refine(
  ({ start_after, start_before }) => start_after === undefined || start_before === undefined || start_after < start_before,
  'start_after must be earlier than start_before',
);

export class TimeTreeClient {
  #cookie;
  #signingIn;
  #credentials;
  #fetch;

  constructor({ email, password, fetcher = fetch }) {
    this.#credentials = { email, password };
    this.#fetch = fetcher;
  }

  async #request(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await this.#fetch('https://timetreeapp.com/api/v1' + path, {
        method, body: body && JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          'X-Timetreea': 'web/2.1.0/en',
          ...(this.#cookie && { Cookie: this.#cookie }),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error('TimeTree connection failed or timed out.');
    }
    if (response.ok) {
      const cookie = response.headers.getSetCookie()
        .map(value => /^_session_id=[^;\s]+/.exec(value)?.[0])
        .find(Boolean);
      if (cookie) this.#cookie = cookie;
    }
    return response;
  }

  async #login() {
    const { email, password } = this.#credentials;
    if (!email || !password) throw new Error('Set TimeTree credentials in the local launcher.');
    const response = await this.#request('/auth/email/signin', {
      method: 'PUT',
      body: { uid: email, password, uuid: randomUUID().replaceAll('-', '') },
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`TimeTree sign-in failed (HTTP ${response.status}).`);
    if (!this.#cookie) throw new Error('TimeTree sign-in returned no session cookie.');
  }

  async #ensureSession() {
    if (this.#cookie) return;
    this.#signingIn ??= this.#login().finally(() => { this.#signingIn = undefined; });
    await this.#signingIn;
  }

  async #read(path, schema) {
    await this.#ensureSession();
    const priorCookie = this.#cookie;
    let response = await this.#request(path);
    if (response.status === 401) {
      await response.body?.cancel();
      if (this.#cookie === priorCookie) this.#cookie = undefined;
      await this.#ensureSession();
      response = await this.#request(path);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`TimeTree read failed (HTTP ${response.status}).`);
    }
    const data = await response.json().catch(() => undefined);
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error('TimeTree returned an unexpected response format.');
    return parsed.data;
  }

  async listCalendars() {
    const { calendars } = await this.#read('/calendars?since=0', calendarsSchema);
    return { calendars: calendars.filter(row => !row.deactivated_at).map(({ id, name }) => ({ id, name })) };
  }

  async getEvents(args) {
    const { calendar_id, start_after, start_before, include_memos } = eventArguments.parse(args);
    const records = new Map();
    const visited = new Set([0]);
    let cursor = 0;
    for (let page = 0; page < 200; page++) {
      const result = await this.#read(`/calendar/${calendar_id}/events/sync?since=${cursor}`, eventsSchema);
      for (const row of result.events) {
        const previous = records.get(row.uuid);
        if (!previous || (row.updated_at ?? 0) >= (previous.updated_at ?? 0)) records.set(row.uuid, row);
      }
      if (!result.chunk) {
        const active = [...records.values()].filter(row => !row.deactivated_at && (include_memos || row.category !== 2));
        const events = active
          .filter(row => (start_after === undefined || row.start_at > start_after) &&
                         (start_before === undefined || row.start_at < start_before))
          .sort((a, b) => a.start_at - b.start_at)
          .map(row => ({
            uuid: row.uuid, title: row.title, all_day: row.all_day,
            start_at: new Date(row.start_at).toISOString(), end_at: new Date(row.end_at).toISOString(),
          }));
        return { events, recurring_series: active.filter(row => row.recurrences?.length).length };
      }
      if (visited.has(result.since)) throw new Error('TimeTree returned a repeated paging cursor.');
      cursor = result.since;
      visited.add(cursor);
      await wait(150);
    }
    throw new Error('TimeTree event feed exceeded the paging limit.');
  }
}
