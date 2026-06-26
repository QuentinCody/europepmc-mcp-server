import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class EuropePmcDataDO extends RestStagingDO {
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
