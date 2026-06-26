import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { ARTICLES_BASE, ANNOTATIONS_BASE, epmcFetch } from "./http";

/** Full-text endpoints return XML only (no JSON variant). */
const XML_ENDPOINT = /\/(fullTextXML|bookXML)$/;

/**
 * Create an ApiFetchFn for Europe PMC, routing across two upstream bases:
 *   - /annotations/...  → Annotations API (the "/annotations" prefix is stripped)
 *   - everything else   → Articles RESTful API
 *
 * Response handling:
 *   - JSON endpoints: `format=json` (Articles) / `format=JSON` (Annotations) is injected
 *     when the caller omits it; the body is parsed and returned.
 *   - fullTextXML / bookXML (or any non-JSON body): returned as a single text document
 *     ({ id, format: "xml", content }) so the Code Mode staging path materializes it as a
 *     queryable payload (these bodies are large — ~234KB — and exceed the transport cap).
 */
export function createEuropePmcApiFetch(): ApiFetchFn {
    return async (request) => {
        let path = request.path.startsWith("/") ? request.path : `/${request.path}`;
        const params = { ...((request.params as Record<string, unknown>) ?? {}) };

        const isAnnotations = path.startsWith("/annotations/");
        const base = isAnnotations ? ANNOTATIONS_BASE : ARTICLES_BASE;
        if (isAnnotations) path = path.replace(/^\/annotations/, "");

        const isXml = XML_ENDPOINT.test(path);

        // Inject a default response format unless the caller set one.
        if (isAnnotations) {
            if (!("format" in params)) params.format = "JSON";
        } else if (!isXml && !("format" in params)) {
            params.format = "json";
        }

        const res = await epmcFetch(base, path, params);

        const looksJson = res.contentType.includes("json");
        if (isXml || !looksJson) {
            const idMatch = path.match(/\/([^/]+)\/(fullTextXML|bookXML)$/);
            return {
                status: res.status,
                data: {
                    id: idMatch ? idMatch[1] : undefined,
                    format: "xml",
                    content_type: res.contentType,
                    bytes: res.text.length,
                    content: res.text,
                },
            };
        }

        try {
            return { status: res.status, data: JSON.parse(res.text) };
        } catch {
            // Upstream sometimes returns an HTML error page with a JSON content-type.
            return { status: res.status, data: { raw: res.text } };
        }
    };
}
