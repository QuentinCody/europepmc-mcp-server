import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const europePmcCatalog: ApiCatalog = {
    name: "Europe PMC",
    baseUrl: "https://www.ebi.ac.uk/europepmc/webservices/rest",
    version: "v1",
    auth: "none",
    endpointCount: 7,
    notes:
        "- Europe PMC: 45M+ biomedical abstracts + OA full text + text-mined annotations. Two upstreams in one isolate: Articles API (default) and the Annotations API (paths under /annotations/...).\n" +
        "- Pagination is cursorMark, NOT page: start cursorMark='*', then pass the response's nextCursorMark. The 'page' param is silently ignored. pageSize default 25, max 1000.\n" +
        "- format=json is injected automatically; you do not need to pass it.\n" +
        "- resultType on /search: 'idlist' (IDs only), 'lite' (default-ish, key fields), 'core' (full metadata incl. the per-article 'license' field, abstract, full-text URLs).\n" +
        "- Full text is XML ONLY (no JSON): GET /{PMCID}/fullTextXML (bare ID, e.g. /PMC4302049/fullTextXML). It is returned as { format:'xml', content } and auto-staged (large).\n" +
        "- Metadata/abstracts are open + commercial-OK; per-article FULL-TEXT licenses are MIXED (CC-BY vs CC-BY-NC/-ND) — check the 'license' field (resultType=core) before caching/redistributing full text.\n" +
        "- Content paths take a bare prefixed ID; metadata/link paths use /{source}/{id}/... where source is MED|PMC|PPR|PAT|AGR|CBA. Rate ~10 req/s per IP (shared egress) — keep concurrency low.",
    endpoints: [
        {
            method: "GET",
            path: "/search",
            summary:
                "Search Europe PMC across abstracts, full text, and preprints. Returns {hitCount, nextCursorMark, resultList.result[]}. Use cursorMark for paging; resultType=core for full metadata + license.",
            category: "search",
            queryParams: [
                { name: "query", type: "string", required: true, description: "Search query, e.g. 'BRAF V600E AND melanoma' or 'EXT_ID:24508103 AND SRC:MED' or 'AUTH:\"Ioannidis\"'" },
                { name: "resultType", type: "string", required: false, description: "'idlist' | 'lite' | 'core' (core adds abstract, license, full-text URLs)", enum: ["idlist", "lite", "core"] },
                { name: "pageSize", type: "number", required: false, description: "Results per page (default 25, max 1000)" },
                { name: "cursorMark", type: "string", required: false, description: "Pagination cursor; start with '*', then pass the previous response's nextCursorMark" },
                { name: "sort", type: "string", required: false, description: "Sort order, e.g. 'CITED desc' or 'P_PDATE_D desc'" },
                { name: "synonym", type: "string", required: false, description: "'true' to expand query synonyms" },
            ],
        },
        {
            method: "GET",
            path: "/{source}/{id}/citations",
            summary: "List articles that cite a given article (source = MED|PMC|PPR|...; id = the article ID).",
            category: "citations",
            pathParams: [
                { name: "source", type: "string", required: true, description: "Source database: MED, PMC, PPR, PAT, AGR, CBA" },
                { name: "id", type: "string", required: true, description: "Article ID within that source (e.g. PMID for MED)" },
            ],
            queryParams: [
                { name: "page", type: "number", required: false, description: "Page number (citations/references use page-based paging with hitCount)" },
                { name: "pageSize", type: "number", required: false, description: "Results per page (max 1000)" },
            ],
        },
        {
            method: "GET",
            path: "/{source}/{id}/references",
            summary: "List the reference list (works cited by) a given article.",
            category: "references",
            pathParams: [
                { name: "source", type: "string", required: true, description: "Source database: MED, PMC, PPR, PAT, AGR, CBA" },
                { name: "id", type: "string", required: true, description: "Article ID within that source" },
            ],
            queryParams: [
                { name: "page", type: "number", required: false, description: "Page number" },
                { name: "pageSize", type: "number", required: false, description: "Results per page (max 1000)" },
            ],
        },
        {
            method: "GET",
            path: "/{source}/{id}/databaseLinks",
            summary: "Cross-references from an article to external databases (UniProt, ENA, PDB, etc.).",
            category: "links",
            pathParams: [
                { name: "source", type: "string", required: true, description: "Source database: MED, PMC, PPR, ..." },
                { name: "id", type: "string", required: true, description: "Article ID within that source" },
            ],
            queryParams: [
                { name: "database", type: "string", required: false, description: "Restrict to one external DB, e.g. 'UNIPROT', 'EMBL', 'PDB'" },
                { name: "pageSize", type: "number", required: false, description: "Results per page" },
            ],
        },
        {
            method: "GET",
            path: "/{pmcid}/fullTextXML",
            summary: "Retrieve OA full-text JATS XML for a PMC article (bare ID, e.g. /PMC4302049/fullTextXML). XML-only; returned as { format:'xml', content } and auto-staged. OA subset only.",
            category: "fulltext",
            pathParams: [
                { name: "pmcid", type: "string", required: true, description: "PMC ID including the 'PMC' prefix, e.g. PMC4302049" },
            ],
        },
        {
            method: "GET",
            path: "/annotations/annotationsByArticleIds",
            summary: "Text-mined annotations (genes, diseases, chemicals, organisms, accessions) for one or more articles. articleIds are SRC:EXT_ID, e.g. MED:24508103.",
            category: "annotations",
            queryParams: [
                { name: "articleIds", type: "string", required: true, description: "Article IDs as SRC:EXT_ID, comma-separated, e.g. 'MED:24508103,PMC:PMC4302049'" },
                { name: "type", type: "string", required: false, description: "Filter by annotation type, e.g. 'Gene_Proteins', 'Diseases', 'Chemicals', 'Organisms'" },
                { name: "section", type: "string", required: false, description: "Filter by article section, e.g. 'Methods', 'Results'" },
            ],
        },
        {
            method: "GET",
            path: "/annotations/annotationsByEntity",
            summary: "Find articles annotated with a given entity (reverse lookup), e.g. entity='p53'.",
            category: "annotations",
            queryParams: [
                { name: "entity", type: "string", required: true, description: "Entity name to search, e.g. 'p53' or 'vemurafenib'" },
                { name: "filter", type: "number", required: false, description: "0 or 1 — restrict to a curated subset" },
            ],
        },
    ],
};
