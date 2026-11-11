# Europe PMC MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for **Europe PMC** — open-access biomedical literature: search biomedical abstracts, retrieve OA full-text (JATS XML), text-mined annotations, citations/references, and database cross-links. One of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

```
https://europepmc-mcp-server.quentincody.workers.dev/mcp
```

Local dev runs at `http://localhost:8904/mcp` (`./scripts/dev-servers.sh europepmc`).

## Tools

- `europepmc_search` — discover endpoints (Code Mode catalog search)
- `europepmc_execute` — **Code Mode**: `api.get(...)` in a V8 isolate across Articles, Annotations and Grist APIs
- `europepmc_query_data` — SQL over large responses auto-staged into per-session SQLite
- `europepmc_get_schema` — inspect a staged dataset's schema

Wraps three upstream bases in one isolate (routed in `api-adapter.ts`): the **Articles RESTful API** (`/search`, `/{PMCID}/fullTextXML`, `/{source}/{id}/citations|references|databaseLinks`) the **Annotations API** (`/annotations/annotationsByArticleIds|annotationsByEntity`), and **Grist** through `/grants/search`. `/grants/publications` is a bounded Articles API helper. Every `_execute` result carries a `_meta.citation` (Europe PMC / EMBL-EBI).

**Key usage notes** (also in the catalog `notes`): Articles `/search` pagination is `cursorMark` (start `*`, thread `nextCursorMark`; the `page` param is ignored); `format=json` is injected automatically; full text is **XML-only** and auto-staged; metadata/abstracts are open + commercial-OK, but **per-article full-text licenses are mixed (CC-BY vs CC-BY-NC/-ND)** — gate any caching/redistribution on the per-article `license` field (present in `resultType=core`).

## Architecture / maintenance

- **Archetype:** REST + Code Mode (three upstreams). No auth. Rate limit ~10 req/s **per IP**, shared across Cloudflare egress → be gentle.
- **Drift risk:** low. **Refresh cadence:** quarterly catalog review. **Known gaps:** `supplementaryFiles` (binary ZIP) not exposed in v1; standalone `textMinedTerms`/`fullTextUrlList` are 404 upstream (use the Annotations API / the `core` result's inline fields).

## Development

```bash
./scripts/dev-servers.sh europepmc
pnpm --filter europepmc-mcp-server run deploy
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the build plan `docs/plans/2026-06-26-evidence-genomics-mcp-servers.md`.

## Grants and publication evidence

Every tool has both `europepmc_*` and `mcp_europepmc_*` names. Responses over 30 KiB use shared staging; keep full API objects or staging/error handles so raw records and provenance survive.

```javascript
return await api.get("/grants/search", {
  query: 'ga:"Wellcome Trust" gid:"081052"',
  resultType: "core", page: 1
});
```

`/grants/search` maps to the provider's unusual `/GristAPI/rest/get/query=...&parameters` path syntax. It supports `query`, one-based `page`, `resultType` (`core` default or `lite`), and `format` (`json` default, `xml`, `cerif`). Grist pages contain up to 25 grants; `cursorMark` and `pageSize` are rejected here. `_grist` retains source URL/time, response hash and pagination headers. Native JSON supplies `HitCount` and `Request.Page` in the body; those now drive continuation when HTTP headers omit them. Conflicting body/header counts or pages fail. Native singleton versus array `RecordList.Record` shapes remain unchanged. Missing count evidence (including plain XML without count headers) remains `unknown`. XML/CERIF remain complete documents.

Grist field queries include funder name/abbreviation/FundRef ID, grant number, investigator, active date and institution. Native `rorid` filtering is verified with matching and nonmatching institution IDs. The tested `doid` query returned no matches for a known DOI, so DOI filtering remains unverified and cannot establish absence. Preserve source IDs, aliases, leading zeros, punctuation, amounts/currencies and optional dates. An institution name is not a verified organization identifier. PubMed IDs supplied during grant ingestion are processed in the literature database rather than stored as a Grist publication collection.

```javascript
return await api.get("/grants/publications", {
  funder: "Wellcome Trust", grant_id: "069683",
  cursorMark: "*", pageSize: 25
});
```

This helper runs a quoted funder-and-grant query against Articles with `resultType=core`, one page at a time (1–100 candidates). It preserves all records, including full grant lists and author affiliations. `_grant_match.status` is `same_grant_pair` only when one native grant record contains both the exact award ID and the agency label (case/repeated whitespace ignored). Other rows stay `unresolved`, including missing funding data and aliases requiring reconciliation. Search `hitCount` describes candidates, not verified links. Neither an empty result nor unresolved evidence proves that a grant has no publications.

For funding-graph, use its **NIH award publications with Europe PMC follow-up** workflow after resolving an NIH core project number. It retains RePORTER project/organization and publication pages and returns `europepmc_next`, an explicit request to execute on this server. It uses source-qualified `MED`/PMID identity and continues through staged project/publication pages. It does not convert arbitrary funder award numbers into NIH identifiers. RePORTER organization data and article author affiliations are separate evidence. The recipe is bounded and reports `complete: false`; continue each source's pagination explicitly.

Europe PMC HTTP reads have a 50-second deadline and an 8 MiB decoded-response limit. Non-success HTTP, HTML error pages and malformed JSON raise errors; no truncation or success-shaped raw-error fallback. Existing article JSON, annotation arrays and full-text XML remain supported, with XML byte counts measured in UTF-8.

Provider references: [Grist API](https://dev.europepmc.org/GristAPI), [Grist fields](https://dev.europepmc.org/GristAPI/dataFields), [article grant-search guidance](https://europepmc.org/help), [NIH RePORTER API](https://api.reporter.nih.gov/).

## Validation status (2026-10-03)

**428 local live acceptance calls** verify Grist core/lite JSON, XML and CERIF,
body/header pagination, empty results, ROR filters, article candidate pages,
all three recipes, source data recovery, and legacy literature/full-text reads.
Another **269 calls** verify reverse-annotation recovery and correct partial-page
metadata after rebuilding the shared package. Native comparisons preserve all
fields; repeated Grist pages are compared as full record multisets because
provider ordering can vary. CERIF's per-request timestamp is excluded only from
cross-request comparison and remains in the returned XML. Raw response hashes
are retained; equivalent JSON may have different serialization across requests.

Staging now materializes `grants` and `articles` plus their child tables, while
`payloads` retains each complete source envelope. A 25-article page reports 25
retrieved articles separately from total SQL rows across author/grant tables.
Grist's capitalized string `HitCount` participates in shared completeness checks:
25 grants out of 613 remain partial. Pages are not pinned snapshots.

The NIH handoff passes **124 additional calls** through both servers/aliases:
10 project records, 25 of 29 publication records and 23 MED results for 25 PMIDs.
Missing Europe PMC matches are not inferred absent from other literature sources.
Native HTTP 500 full-text failures retain status/body; other OA full-text XML and
large positive annotation responses recover intact. No universal full-text
availability or license is inferred from a metadata record.

**48 Europe PMC tests**, **48 funding-graph tests** and **30 shared completeness
checks** pass. Both live contract harnesses pass nine checks with one small-probe
staging skip; dedicated acceptance verifies real staging. Full verification and
known limits are in the [implementation tracker](../../docs/plans/2026-09-26-upstream-api-implementation.md).
No deployment was performed.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from Europe PMC and stays under the terms of that source: Metadata open; full text per-article license; about 29% of the open-access subset carries a non-commercial license; abstracts copyrighted.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
