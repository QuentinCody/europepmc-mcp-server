import { afterEach, expect, it, vi } from "vitest";
import { createEuropePmcApiFetch } from "./api-adapter";
import { readText } from "./response";
import grist from "./grist.fixture.json";
const api = createEuropePmcApiFetch();
function response(data: unknown, headers: Record<string, string> = {}, status = 200) {
  const res = new Response(typeof data === "string" ? data : JSON.stringify(data), { status, headers: {"content-type": "application/json", ...headers} });
  const fetcher = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
it("encodes Grist's path parameters without changing grant identifiers or raw core data", async () => {
  // Synthetic envelope: raw preservation does not depend on guessed Grist field casing.
  const raw = { records: [{ grant: { Id: "00123/A&B", Funder: "Agency A", Alias: ["00123"], Amount: { currency: "GBP", value: "123.45" }, EndDate: null }, institution: {Name: "Institute", RORID: "ror.org/example"}, person: {FamilyName: "Fixture"} }], provider_extra: true };
  const fetcher = response(raw, {HitCount: "26", Page: "1"});
  const result = await api({method: "GET", path: "/grants/search", params: {query: 'ga:"Agency A" gid:"00123/A&B"'}});
  expect(result).toMatchObject({data: {...raw, _grist: {requested_page: 1, observed_page: 1, next_page: 2, completion: "more_pages", hit_count_header: 26}}});
  const url = String(fetcher.mock.calls[0][0]);
  expect(url).toBe('https://www.ebi.ac.uk/europepmc/GristAPI/rest/get/query=ga%3A%22Agency%20A%22%20gid%3A%2200123%2FA%26B%22&resultType=core&page=1&format=json');
  expect(url).not.toContain("?");
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect: "manual", signal: expect.any(AbortSignal)});
});
it("preserves CERIF XML and documented pagination headers", async () => {
  const xml = '<CERIF><cfProj><cfProjId>00123</cfProjId><label>α</label></cfProj></CERIF>';
  response(xml, {"content-type": "text/xml", HitCount: "26", Page: "2", ResultType: "CERIF", Query: "pi:smith"});
  expect(await api({method: "GET", path: "/grants/search", params: {query: "pi:smith", page: 2, format: "cerif"}})).toMatchObject({data: {format: "cerif", content: xml, bytes: new TextEncoder().encode(xml).byteLength, _grist: {completion: "last_page", next_page: null, response_headers: {ResultType: "CERIF"}}}});
});
it("does not manufacture totals or next pages from an unverified JSON layout", async () => {
  response({opaque: [{Id: "1"}], HitCount: 900});
  expect(await api({method: "GET", path: "/grants/search", params: {query: "malaria"}})).toMatchObject({data: {_grist: {completion: "unknown", next_page: null, hit_count_header: null}}});
});
it("rejects inconsistent Grist page headers", async () => {
  response({}, {Page: "3"});
  await expect(api({method: "GET", path: "/grants/search", params: {query: "malaria", page: 2}})).rejects.toThrow("different page");
});
it.each(["grist-core", "grist-empty"] as const)("uses captured native JSON body pagination for %s", async key => {
  const native = grist[key].response;
  response(native);
  const result = await api({method: "GET", path: "/grants/search", params: {query: native.Request.Query}});
  expect(result.data).toMatchObject({...native, _grist: {observed_page: 1, hit_count: Number(native.HitCount), pagination_source: "json_body", completion: "last_page"}});
});
it("uses body page counts for continuation without reshaping native singleton records", async () => {
  const native = {...grist["grist-core"].response, HitCount: "26"};
  response(native);
  expect(await api({method: "GET", path: "/grants/search", params: {query: "x"}})).toMatchObject({data: {...native, _grist: {next_page: 2, completion: "more_pages"}}});
});
it.each<Record<string, string>>([{Page: "2"}, {HitCount: "27"}])("rejects conflicting body/header pagination %#", async headers => {
  response({...grist["grist-core"].response, HitCount: "26"}, headers);
  await expect(api({method: "GET", path: "/grants/search", params: {query: "x"}})).rejects.toThrow();
});
it("matches the funder and exact grant ID on the same article grant row", async () => {
  const records = [
    {source: "MED", id: "1", grantsList: {grant: [{grantId: "00123", agency: "Agency A"}]}, authorList: {author: [{authorAffiliationDetailsList: {authorAffiliation: [{affiliation: "Institution"}]}}]}},
    {source: "MED", id: "2", grantsList: {grant: [{grantId: "00123", agency: "Agency B"}, {grantId: "different", agency: "Agency A"}]}},
    {source: "MED", id: "3", grantsList: {grant: [{grantId: "123", agency: "Agency A"}]}},
    {source: "PPR", id: "4"},
  ];
  const fetcher = response({version: "provider-fixture", hitCount: 100, nextCursorMark: "next+token", resultList: {result: records}});
  const result = await api({method: "GET", path: "/grants/publications", params: {funder: "agency   a", grant_id: "00123"}});
  expect(result).toMatchObject({data: {hitCount: 100, resultList: {result: records.map((r, i) => ({...r, _grant_match: {status: i === 0 ? "same_grant_pair" : "unresolved"}}))}, _grant_publications: {same_pair_count: 1, returned_count: 4, next_cursor: "next+token", funder: "agency   a", grant_id: "00123"}}});
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("query")).toBe('GRANT_AGENCY:"agency   a" AND GRANT_ID:"00123"');
  expect(url.searchParams.get("resultType")).toBe("core");
});
it("quotes literal funder and grant input rather than accepting query fragments", async () => {
  const fetcher = response({resultList: {result: []}, nextCursorMark: "*"});
  await api({method: "GET", path: "/grants/publications", params: {funder: 'A" OR GRANT_ID:*', grant_id: "00\\1"}});
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("query")).toBe('GRANT_AGENCY:"A\\" OR GRANT_ID:*" AND GRANT_ID:"00\\\\1"');
});
it("preserves a continuation cursor and an empty candidate page", async () => {
  const fetcher = response({hitCount: 0, nextCursorMark: "abc+/=", resultList: {result: []}});
  expect(await api({method: "GET", path: "/grants/publications", params: {funder: "A", grant_id: "001", cursorMark: "abc+/=", pageSize: 5}})).toMatchObject({data: {_grant_publications: {next_cursor: null, same_pair_count: 0}}});
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("cursorMark")).toBe("abc+/=");
});
it.each([
 {method: "POST", path: "/grants/search", body: {}},
 {method: "GET", path: "/grants/search", params: {}},
 {method: "GET", path: "/grants/search", params: {query: "x", page: 0}},
 {method: "GET", path: "/grants/search", params: {query: "x", page: 1.2}},
 {method: "GET", path: "/grants/search", params: {query: "x", pageSize: 100}},
 {method: "GET", path: "/grants/search", params: {query: "x", cursorMark: "*"}},
 {method: "GET", path: "/grants/search", params: {query: "x", format: "html"}},
 {method: "GET", path: "/grants/search", params: {query: "x", resultType: "idlist"}},
 {method: "GET", path: "/grants/unknown", params: {query: "x"}},
 {method: "GET", path: "/grants/publications", params: {funder: "A", grant_id: 123}},
 {method: "GET", path: "/grants/publications", params: {grant_id: "123"}},
 {method: "GET", path: "/grants/publications", params: {funder: "A", grant_id: "1", page: 2}},
 {method: "GET", path: "/grants/publications", params: {funder: "A", grant_id: "1", pageSize: 101}},
 {method: "GET", path: "/grants/publications", params: {funder: "A\nB", grant_id: "1"}},
])("rejects invalid grant requests before fetching %#", async request => {
  const fetcher = response({});
  await expect(api(request)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["<html>error</html>", "{malformed", {error: "invalid query"}, {errMsg: "invalid query"}, null])("rejects provider errors and invalid JSON %#", async raw => {
  response(raw);
  await expect(api({method: "GET", path: "/grants/search", params: {query: "x"}})).rejects.toThrow();
});
it("rejects missing publication list instead of reporting zero links", async () => {
  response({hitCount: 10});
  await expect(api({method: "GET", path: "/grants/publications", params: {funder: "A", grant_id: "1"}})).rejects.toThrow("resultList");
});
it("retains Articles JSON, annotation arrays and full-text XML behavior", async () => {
  response({hitCount: 1, resultList: {result: [{id: "1"}]}});
  expect(await api({method: "GET", path: "/search", params: {query: "x"}})).toMatchObject({data: {hitCount: 1}});
  const fetcher = response([{annotations: [{exact: "TP53"}]}]);
  expect(await api({method: "GET", path: "/annotations/annotationsByArticleIds", params: {articleIds: "MED:1"}})).toMatchObject({data: [{annotations: [{exact: "TP53"}]}]});
  expect(String(fetcher.mock.calls[0][0])).toContain("annotations_api/annotationsByArticleIds");
  response("<article>α</article>", {"content-type": "application/xml"});
  expect(await api({method: "GET", path: "/PMC1/fullTextXML"})).toMatchObject({data: {id: "PMC1", format: "xml", bytes: 21, content: "<article>α</article>"}});
});
it("bounds chunked response reads and cancels remaining bytes", async () => {
  const cancel = vi.fn();
  await expect(readText(new Response(new ReadableStream({pull(c) {c.enqueue(new Uint8Array(1024 * 1024));}, cancel})))).rejects.toThrow("8 MiB");
  expect(cancel).toHaveBeenCalled();
});
it("does not label a successful plain-text error as a full-text XML document", async () => {
  response("provider unavailable", {"content-type": "text/plain"});
  await expect(api({method: "GET", path: "/PMC1/fullTextXML"})).rejects.toMatchObject({status: 502, data: {provider_response: "provider unavailable"}});
});
