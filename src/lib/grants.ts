import { ARTICLES_BASE, epmcFetch, epmcFetchUrl } from "./http";
import { fail, hash, parseJson } from "./response";
export const GRIST_BASE = "https://www.ebi.ac.uk/europepmc/GristAPI/rest";
function only(params: Record<string, unknown>, fields: string[]): void {
  for (const key of Object.keys(params)) if (!fields.includes(key)) fail(`Unsupported grant parameter ${key}`);
}
function text(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || Array.from(value).some(char => char.charCodeAt(0) < 32)) fail(`${field} must be a nonempty string of at most ${max} characters`);
  return value;
}
function integer(value: unknown, field: string, max: number): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) fail(`${field} must be an integer between 1 and ${max}`);
  return parsed;
}
function countHeader(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}
export async function grantSearch(params: Record<string, unknown>) {
  only(params, ["query", "page", "resultType", "format"]);
  const { hitCount, bodyCount, page, response, parsed, url, query, resultType, format, observedPage, bodyPage } = await readGrantPage(params);
  const count = hitCount ?? bodyCount;
  const nextPage = count === null ? null : page * 25 < count ? page + 1 : null;
  return { status: response.status, data: { ...(Array.isArray(parsed) ? { records: parsed } : parsed), _grist: {
    source_url: url, retrieved_at: new Date().toISOString(), query, result_type: resultType, format,
    requested_page: page, observed_page: observedPage ?? bodyPage, page_size_limit: 25, hit_count_header: hitCount,
    hit_count: count, hit_count_body: bodyCount, pagination_source: hitCount !== null ? "headers" : bodyCount !== null ? "json_body" : null,
    next_page: nextPage, completion: count === null ? "unknown" : nextPage ? "more_pages" : "last_page",
    response_sha256: await hash(response.text),
    response_headers: { HitCount: response.headers.get("HitCount"), Page: response.headers.get("Page"), ResultType: response.headers.get("ResultType"), Query: response.headers.get("Query") },
    scope: "One page of provider grant records. Grant IDs are funder-scoped; dates, currencies, aliases and institutions remain as supplied. Publication links are held by the Articles API, not Grist.",
  } } };
}
async function readGrantPage(params: Record<string, unknown>) {
  const query = text(params.query, "query", 4000);
  const page = integer(params.page ?? 1, "page", 1000000);
  const resultType = params.resultType ?? "core";
  if (resultType !== "core" && resultType !== "lite") fail("Grist resultType must be core or lite");
  const format = String(params.format ?? "json").toLowerCase();
  if (!["json", "xml", "cerif"].includes(format)) fail("Grist format must be json, xml or cerif");
  // Grist's documented parameters belong in its path, not a ?query string.
  const url = `${GRIST_BASE}/get/query=${encodeURIComponent(query)}&resultType=${resultType}&page=${page}&format=${format}`;
  const response = await epmcFetchUrl(url);
  const hitCount = countHeader(response.headers.get("HitCount"));
  const observedPage = countHeader(response.headers.get("Page"));
  if (observedPage !== null && observedPage !== page) fail("Grist returned a different page than requested", 502);
  const parsed = format === "json" ? parseJson(response.text) : { format, content: response.text, bytes: new TextEncoder().encode(response.text).byteLength };
  if (format !== "json" && !/^\s*</.test(response.text)) fail("Grist returned non-XML content", 502);
  // Native JSON uses singleton/array RecordList.Record and body pagination; CERIF uses headers.
  const root = object(parsed);
  const bodyRequest = object(root?.Request);
  const knownBody = format === "json" && bodyRequest && object(root?.RecordList);
  const bodyCount = knownBody ? countHeader(typeof root?.HitCount === "string" ? root.HitCount : null) : null;
  const bodyPage = knownBody ? countHeader(typeof bodyRequest.Page === "string" ? bodyRequest.Page : null) : null;
  if (bodyPage !== null && bodyPage !== page || hitCount !== null && bodyCount !== null && hitCount !== bodyCount) fail("Grist pagination evidence disagrees with the request or headers", 502);
  return { hitCount, bodyCount, page, response, parsed, url, query, resultType, format, observedPage, bodyPage };
}

function quoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function normalized(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : undefined;
}
function grantMatches(article: Record<string, unknown>, funder: string, grantId: string) {
  const grants = object(article.grantsList)?.grant;
  if (!Array.isArray(grants)) return { status: "unresolved", evidence: [] };
  const matching = grants.filter(grant => {
    const record = object(grant);
    return record?.grantId === grantId && normalized(record?.agency) === normalized(funder);
  });
  return { status: matching.length ? "same_grant_pair" : "unresolved", evidence: matching };
}
export async function grantPublications(params: Record<string, unknown>) {
  only(params, ["funder", "grant_id", "cursorMark", "pageSize"]);
  const funder = text(params.funder, "funder");
  const grantId = text(params.grant_id, "grant_id");
  const cursorMark = text(params.cursorMark ?? "*", "cursorMark", 4000);
  const pageSize = integer(params.pageSize ?? 25, "pageSize", 100);
  const query = `GRANT_AGENCY:${quoted(funder)} AND GRANT_ID:${quoted(grantId)}`;
  const response = await epmcFetch(ARTICLES_BASE, "/search", { query, resultType: "core", format: "json", cursorMark, pageSize });
  const raw = object(parseJson(response.text));
  const resultList = object(raw?.resultList);
  if (!raw || !resultList || !Array.isArray(resultList.result)) fail("Grant publication response omitted resultList.result", 502);
  if (resultList.result.length > pageSize) fail("Grant publication response exceeded requested pageSize", 502);
  const results = resultList.result.map(value => {
    const article = object(value);
    if (!article) fail("Invalid grant publication row", 502);
    return { ...article, _grant_match: grantMatches(article, funder, grantId) };
  });
  return { status: response.status, data: { ...raw, resultList: { ...resultList, result: results }, _grant_publications: {
    source_url: response.url, retrieved_at: new Date().toISOString(), query, funder, grant_id: grantId,
    request: { cursorMark, pageSize }, response_sha256: await hash(response.text),
    returned_count: results.length,
    same_pair_count: results.filter(row => row._grant_match.status === "same_grant_pair").length,
    next_cursor: typeof raw.nextCursorMark === "string" && raw.nextCursorMark !== cursorMark ? raw.nextCursorMark : null,
    scope: "One candidate publication page. Require funder and award ID on the same grantsList.grant record. Unresolved rows remain for review; absence does not prove no funded publications.",
    funding_graph_join: { award_id: grantId, funder, publication_identity: "source + id (MED IDs are PMIDs)", normalization: "Award identifiers retain leading zeros and punctuation. Agency comparison ignores case and repeated whitespace only; aliases and provider namespaces need explicit reconciliation." },
  } } };
}
