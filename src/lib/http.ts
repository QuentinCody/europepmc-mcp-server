// Europe PMC — low-level fetch for two upstream bases (Articles + Annotations APIs).
// No auth. Keyless, open-CORS, ~10 req/s per IP (shared across Cloudflare egress → be gentle).

export const ARTICLES_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";
export const ANNOTATIONS_BASE = "https://www.ebi.ac.uk/europepmc/annotations_api";

const USER_AGENT = "europepmc-mcp-server/0.1.0 (bio-mcp)";

export interface EpmcResponse {
    status: number;
    contentType: string;
    text: string;
}

function buildUrl(base: string, path: string, params?: Record<string, unknown>): string {
    const url = new URL(base + (path.startsWith("/") ? path : `/${path}`));
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null || v === "") continue;
            url.searchParams.set(k, String(v));
        }
    }
    return url.toString();
}

/** GET against a Europe PMC base. Returns raw text + content-type (caller decides JSON vs XML). */
export async function epmcFetch(
    base: string,
    path: string,
    params?: Record<string, unknown>,
): Promise<EpmcResponse> {
    const url = buildUrl(base, path, params);
    const res = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json, application/xml;q=0.9, */*;q=0.8",
        },
    });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!res.ok) {
        const error = new Error(
            `Europe PMC HTTP ${res.status}: ${text.slice(0, 200)}`,
        ) as Error & { status: number; data: unknown };
        error.status = res.status;
        error.data = text;
        throw error;
    }
    return { status: res.status, contentType, text };
}
