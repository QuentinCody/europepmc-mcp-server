import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { europePmcCatalog } from "../spec/catalog";
import { createEuropePmcApiFetch } from "../lib/api-adapter";
import { fundingPublicationWorkflows } from "../../../funding-graph-mcp-server/src/spec/publication-workflows";
const json = (data: unknown) => new Response(JSON.stringify(data), {headers: {"content-type": "application/json"}});
afterEach(() => vi.unstubAllGlobals());
it("registers both aliases and discovers grant workflows with both-fields contracts", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, { EUROPEPMC_DATA_DO: {}, CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  for (const name of ["europepmc_search", "europepmc_execute", "europepmc_query_data", "europepmc_get_schema"]) {
    expect(tools[name]).toBeDefined(); expect(tools[`mcp_${name}`]).toBeDefined();
  }
  expect(await tools.europepmc_search.handler({query: "Inspect grant identity and institution metadata", category: "workflows", max_results: 5}, {})).toMatchObject({content: expect.any(Array), structuredContent: {success: true}});
  expect(await tools.mcp_europepmc_query_data.handler({data_access_id: "europepmc_fixture", sql: "SELECT 1"}, {})).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
  expect(europePmcCatalog.endpointCount).toBe(europePmcCatalog.endpoints.length);
});
it("stages complete grant metadata, dates/currencies and pagination context", async () => {
  const raw = {records: [{grant: {Id: "001", Amount: {Currency: "GBP", Value: "100.01"}, EndDate: null, Abstract: "α".repeat(17_000)}, institution: {Name: "Fixture"}}]};
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(raw)));
  const stored: unknown[] = [];
  const namespace = {idFromName: (name: string) => name, get: () => ({fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as {data: unknown}).data);
      return json({success: true, tables_created: ["records"], total_rows: 1, input_rows: 1, table_row_counts: {records: 1}});
    }
    return json({success: true, schema: {tables: {records: {columns: [{name: "grant"}]}}}});
  }})} as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({apiFetch: createEuropePmcApiFetch(), catalog: europePmcCatalog, doNamespace: namespace, stagingPrefix: "europepmc", maxInlineBytes: 30 * 1024});
  expect(await proxy.handler({method: "GET", path: "/grants/search", params: {query: 'gid:"001"'}}, {sql: () => []})).toMatchObject({__staged: true, data_access_id: expect.any(String)});
  expect(JSON.parse(stored[0] as string)).toMatchObject({...raw, _grist: {query: 'gid:"001"', completion: "unknown"}});
  expect(stored[1]).toMatchObject(raw);
});
it.each([{__api_error: true, status: 502}, {__staged: true, data_access_id: "fixture"}, {__stage_error: true}])("preserves workflow error/staging handles %#", async handle => {
  for (const recipe of europePmcCatalog.workflows!) {
    expect(await new Function("api", `return (async () => { ${recipe.code} })()` )({get: vi.fn().mockResolvedValue(handle)})).toEqual(handle);
  }
  const run = new Function("api", `return (async () => { ${fundingPublicationWorkflows[0].code} })()`);
  if (!("__staged" in handle)) expect(await run({post: vi.fn().mockResolvedValue(handle)})).toEqual(handle);
  else expect(await run({post: vi.fn().mockResolvedValue(handle), query: vi.fn().mockResolvedValue({results: []})})).toMatchObject({projects: handle, publications: handle, europepmc_next: null});
});
it("funding-graph handoff uses source-qualified PMIDs and retains award organization context", async () => {
  const projects = {results: [{core_project_num: "R01CA183929", organization: {org_name: "Award organization", org_uei: "UEI"}}]};
  const publications = {meta: {total: 100}, results: [{coreproject: "R01CA183929", pmid: 123}, {coreproject: "R01CA183929", pmid: 123}, {coreproject: "OTHER", pmid: 456}, {coreproject: "R01CA183929", pmid: "invalid"}]};
  const post = vi.fn().mockResolvedValueOnce(projects).mockResolvedValueOnce(publications);
  const run = new Function("api", `return (async () => { ${fundingPublicationWorkflows[0].code} })()`);
  expect(await run({post})).toMatchObject({projects, publications, complete: false, europepmc_next: {server: "europepmc", path: "/search", params: {query: "SRC:MED AND (EXT_ID:123)", resultType: "core"}}});
  expect(post.mock.calls[1]).toEqual(["/reporter/publications/search", {criteria: {core_project_nums: ["R01CA183929"]}, offset: 0, limit: 25, sort_field: "pmid", sort_order: "asc"}]);
});
it("retains a staged publication page with preceding project metadata", async () => {
  const projects = {results: []}; const handle = {__staged: true, data_access_id: "pubs"};
  const post = vi.fn().mockResolvedValueOnce(projects).mockResolvedValueOnce(handle);
  const run = new Function("api", `return (async () => { ${fundingPublicationWorkflows[0].code} })()`);
  expect(await run({post, query: vi.fn().mockResolvedValue({results: [{coreproject: "R01CA183929", pmid: 24173311}]})})).toMatchObject({projects, publications: handle, europepmc_next: {params: {query: "SRC:MED AND (EXT_ID:24173311)"}}});
});
it("funding-graph exposes its publication recipe under both tool aliases", async () => {
  const {registerCodeMode: registerFunding} = await import("../../../funding-graph-mcp-server/src/tools/code-mode");
  const {registerQueryData: registerFundingQuery} = await import("../../../funding-graph-mcp-server/src/tools/query-data");
  const {registerGetSchema: registerFundingSchema} = await import("../../../funding-graph-mcp-server/src/tools/get-schema");
  const server = new McpServer({name: "fixture", version: "1"});
  registerFunding(server, {CODE_MODE_LOADER: {get: () => ({})}} as unknown as Parameters<typeof registerFunding>[1]);
  registerFundingQuery(server, {}); registerFundingSchema(server, {});
  const tools = (server as unknown as {_registeredTools: Record<string, {handler: (args: unknown, extra: unknown) => Promise<unknown>}>})._registeredTools;
  for (const suffix of ["search", "execute", "query_data", "get_schema"]) {
    expect(tools[`funding_graph_${suffix}`]).toBeDefined(); expect(tools[`mcp_funding_graph_${suffix}`]).toBeDefined();
  }
  expect(await tools.mcp_funding_graph_search.handler({query: "NIH award publications with Europe PMC follow-up", category: "workflows", max_results: 5}, {})).toMatchObject({content: expect.any(Array), structuredContent: {success: true}});
});
