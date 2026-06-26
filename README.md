# Europe PMC MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for **Europe PMC** — open-access biomedical literature: search across 45M+ abstracts, retrieve OA full-text (JATS XML), text-mined annotations, citations/references, and database cross-links. One of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

```
https://europepmc-mcp-server.quentincody.workers.dev/mcp
```

Local dev runs at `http://localhost:8904/mcp` (`./scripts/dev-servers.sh europepmc`).

## Tools

- `europepmc_search` — discover endpoints (Code Mode catalog search)
- `europepmc_execute` — **Code Mode**: `api.get(...)` in a V8 isolate across two upstreams (Articles + Annotations APIs)
- `europepmc_query_data` — SQL over large responses auto-staged into per-session SQLite
- `europepmc_get_schema` — inspect a staged dataset's schema

Wraps two upstream bases in one isolate (routed in `api-adapter.ts`): the **Articles RESTful API** (`/search`, `/{PMCID}/fullTextXML`, `/{source}/{id}/citations|references|databaseLinks`) and the **Annotations API** (`/annotations/annotationsByArticleIds|annotationsByEntity`). Every `_execute` result carries a `_meta.citation` (Europe PMC / EMBL-EBI).

**Key usage notes** (also in the catalog `notes`): pagination is `cursorMark` (start `*`, thread `nextCursorMark`; the `page` param is ignored); `format=json` is injected automatically; full text is **XML-only** and auto-staged; metadata/abstracts are open + commercial-OK, but **per-article full-text licenses are mixed (CC-BY vs CC-BY-NC/-ND)** — gate any caching/redistribution on the per-article `license` field (present in `resultType=core`).

## Architecture / maintenance

- **Archetype:** catalog-only REST + Code Mode (dual upstream). No auth. Rate limit ~10 req/s **per IP**, shared across Cloudflare egress → be gentle.
- **Drift risk:** low. **Refresh cadence:** quarterly catalog review. **Known gaps:** `supplementaryFiles` (binary ZIP) not exposed in v1; standalone `textMinedTerms`/`fullTextUrlList` are 404 upstream (use the Annotations API / the `core` result's inline fields).

## Development

```bash
./scripts/dev-servers.sh europepmc
pnpm --filter europepmc-mcp-server run deploy
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the build plan `docs/plans/2026-06-26-evidence-genomics-mcp-servers.md`.
