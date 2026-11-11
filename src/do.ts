import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class EuropePmcDataDO extends RestStagingDO {
    async fetch(request: Request): Promise<Response> {
        if (request.method !== "POST" || new URL(request.url).pathname !== "/process") return super.fetch(request);
        const body = await request.clone().json() as {data?: unknown};
        const data = body.data;
        if (!data || typeof data !== "object" || Array.isArray(data)) return super.fetch(request);
        const root = data as Record<string, unknown>;
        const articleList = root.resultList as {result?: unknown} | undefined;
        const grantList = root.RecordList as {Record?: unknown} | undefined;
        const grants = grantList?.Record;
        const rows = Array.isArray(articleList?.result) ? articleList.result : Array.isArray(grants) ? grants : grants && typeof grants === "object" ? [grants] : undefined;
        if (!rows?.length) return super.fetch(request);
        // Retain the original envelope before projecting its nested record collection.
        const retained = await super.fetch(request);
        if (!retained.ok) return retained;
        const table = Array.isArray(articleList?.result) ? "articles" : "grants";
        return super.fetch(new Request("https://do/process", {method: "POST", headers: {"Content-Type": "application/json"},
            body: JSON.stringify({...body, data: {[table]: rows}})}));
    }

    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        if (Array.isArray(data)) {
            const sample = data[0];
            if (
                sample &&
                typeof sample === "object" &&
                "source" in sample &&
                ("title" in sample || "pmid" in sample || "id" in sample)
            ) {
                // Europe PMC search results (resultList.result[]).
                const candidates = ["id", "source", "pmid", "pmcid", "doi"];
                const indexes = candidates.filter((k) => k in (sample as Record<string, unknown>));
                return { tableName: "articles", indexes };
            }
        }

        return undefined; // fall back to generic inference (annotations, full-text payloads, etc.)
    }
}
