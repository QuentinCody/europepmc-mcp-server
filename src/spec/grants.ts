import type { ApiEndpoint, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";
export const grantEndpoints: ApiEndpoint[] = [
  { method: "GET", path: "/grants/search", category: "grants", featured: true,
    summary: "Adapter route to the separate Grants RESTful (Grist) API; one numbered page of up to 25 grants.",
    description: "Native path is /GristAPI/rest/get/query=...&parameters. Use ga/grant_agency for funder name, abbreviation or FundRef ID; gid/gr/grant_id for award ID; pi/pi_id for investigators; aff for institution; date for active date. Preserve leading zeros, aliases, amounts/currencies and optional dates. Core includes full metadata. Publications are queried separately through Articles. Native rorid filtering is verified for a returned institution ROR ID. Grant DOI values are retained, but doid filtering remains unverified and must not be used to infer absence.",
    queryParams: [
      {name: "query", type: "string", required: true, description: 'Native fielded query, e.g. ga:"Wellcome Trust" gid:"081052". Terms are space-separated ANDs, not ampersand-separated.'},
      {name: "page", type: "number", required: false, default: 1, description: "One-based page number; fixed provider limit 25. No cursorMark/pageSize."},
      {name: "resultType", type: "string", required: false, default: "core", enum: ["core", "lite"], description: "Adapter defaults to full metadata."},
      {name: "format", type: "string", required: false, default: "json", enum: ["json", "xml", "cerif"], description: "JSON or preserved XML/CERIF document; pagination headers retained where present; JSON body HitCount/Request.Page are used when available."},
    ], example: 'return await api.get("/grants/search", {query: \'ga:"Wellcome Trust" gid:"081052"\', resultType: "core", page: 1});' },
  { method: "GET", path: "/grants/publications", category: "grants", featured: true,
    summary: "One cursor page of article candidates for a funder–award pair, with same-record evidence checks.",
    description: "Adapter uses Articles /search with core metadata and quoted GRANT_AGENCY/GRANT_ID. All candidates, grant lists, authors/affiliations and identifiers are retained. _grant_match requires exact grant ID and agency equality after case/whitespace normalization on the SAME grant row. Missing or differing aliases remain unresolved. Search hitCount is not a count of verified links.",
    queryParams: [
      {name: "funder", type: "string", required: true, description: "Article grant agency label; reconcile aliases explicitly, not by award number alone."},
      {name: "grant_id", type: "string", required: true, description: "Exact source award ID as text, preserving leading zeros and punctuation."},
      {name: "cursorMark", type: "string", required: false, default: "*", description: "Articles cursor, not Grist page number."},
      {name: "pageSize", type: "number", required: false, default: 25, description: "Adapter bound 1–100 candidates per call."},
    ], example: 'return await api.get("/grants/publications", {funder: "Wellcome Trust", grant_id: "069683", cursorMark: "*", pageSize: 25});' },
];
export const grantWorkflows: WorkflowRecipe[] = [
  { title: "Inspect grant identity and institution metadata", keywords: ["Grist", "grant", "funder", "institution", "FundRef"],
    description: "Preserve raw records before joining. Grist supports one-based pages; Native JSON body counts or CERIF headers support continuation; missing count evidence remains unknown. An institution name is not a verified organization identifier.",
    code: 'return await api.get("/grants/search", {query: \'ga:"Wellcome Trust" gid:"081052"\', page: 1, resultType: "core"});' },
  { title: "Grant to publication and organization evidence", keywords: ["grant", "publication", "organization", "funding-graph"],
    description: "Retain full core article metadata, same-pair evidence and source-qualified article IDs. Compare grant institution records with author affiliations as separate evidence, not automatic organization identity. Use funding-graph's NIH/NSF/CORDIS award namespaces only after reconciling the funder.",
    code: 'return await api.get("/grants/publications", {funder: "Wellcome Trust", grant_id: "069683", cursorMark: "*", pageSize: 25});' },
  { title: "Preserve CERIF grant records and pagination headers", keywords: ["CERIF", "XML", "grants", "page"],
    description: "Return the complete XML document or staging handle. _grist keeps HitCount/Page headers separately; no invented JSON record layout or completeness claim.",
    code: 'return await api.get("/grants/search", {query: "pi:smith", page: 1, format: "cerif"});' },
];
