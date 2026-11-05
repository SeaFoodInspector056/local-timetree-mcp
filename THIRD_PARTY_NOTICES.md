# Third-party notices

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) is MIT licensed.
- [Zod](https://github.com/colinhacks/zod) is MIT licensed.

The npm lockfile records direct and transitive dependencies. Each dependency retains its own license terms.

## TimeTree interface reference

[ehs208/TimeTree-MCP, commit 668cab9](https://github.com/ehs208/TimeTree-MCP/tree/668cab9431c5de4403df493f40780966121f8b28) was consulted for TimeTree Web's undocumented sign-in, session cookie, calendar listing and event-sync pagination. The two MCP tools also share names and some argument names with that project. Their defaults, output fields and recurrence handling differ.

Local TimeTree MCP implements these requests in its own client and uses the official MCP SDK to expose the tools. It runs without installing the referenced TimeTree server. The reference project's MIT copyright and permission notice are retained in [LICENSE](LICENSE).
