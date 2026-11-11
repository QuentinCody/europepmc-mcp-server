import { grantSearch, grantPublications } from "./grants";
import { fail, parseJson } from "./response";
import { type ApiFetchFn, commercialUseRefusal } from "@bio-mcp/shared/codemode/catalog";
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
 *   - fullTextXML / bookXML (or a native XML body): returned as a single text document
 *     ({ id, format: "xml", content }) so the Code Mode staging path materializes it as a
 *     queryable payload (these bodies are large — ~234KB — and exceed the transport cap).
 */
export function createEuropePmcApiFetch(): ApiFetchFn {
    return async (request) => {
        // License audit 2026-11-10: metadata is open. About 29% of the open-access
        // full text carries a non-commercial license, and this route does not
        // filter by license.
        if (request.licenseProfile === "commercial" && XML_ENDPOINT.test(request.path)) {
            return commercialUseRefusal("Article full text (fullTextXML, bookXML)", "part of the open-access subset carries a non-commercial license; search and metadata stay available");
        }
        if (request.method.toUpperCase() !== "GET" || request.body !== undefined) fail("Europe PMC routes require GET without a body", 405);
        if (request.path === "/grants/search") return grantSearch(request.params ?? {});
        if (request.path === "/grants/publications") return grantPublications(request.params ?? {});
        if (request.path.startsWith("/grants/")) fail("Unknown grant operation", 404);
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

        const looksXml = /^\s*</.test(res.text);
        if (isXml && !looksXml) throw Object.assign(new Error("Europe PMC full text is not XML"), {status: 502, data: {provider_response: res.text}});
        if (isXml || looksXml) {
            const idMatch = path.match(/\/([^/]+)\/(fullTextXML|bookXML)$/);
            return {
                status: res.status,
                data: {
                    id: idMatch ? idMatch[1] : undefined,
                    format: "xml",
                    content_type: res.contentType,
                    bytes: new TextEncoder().encode(res.text).byteLength,
                    content: res.text,
                },
            };
        }

        return { status: res.status, data: parseJson(res.text) };
    };
}
