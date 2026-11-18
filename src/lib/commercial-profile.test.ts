import { afterEach, describe, expect, it, vi } from "vitest";
import { createEuropePmcApiFetch } from "./api-adapter";

afterEach(() => vi.unstubAllGlobals());

// License audit 2026-11-10: Europe PMC metadata is open. About 29% of the open-access
// full text carries a non-commercial license, so full text is withheld from a
// reselling caller.
describe("Europe PMC adapter under the commercial license profile", () => {
	const apiFetch = createEuropePmcApiFetch();

	it("refuses article and book full text with HTTP 451 and makes no upstream request", async () => {
		for (const path of ["/PMC1234567/fullTextXML", "/NBK1234/bookXML"]) {
			const result = await apiFetch({ method: "GET", path, licenseProfile: "commercial" });
			expect(`${path}:${result.status}`).toBe(`${path}:451`);
			expect(result.data).toMatchObject({ error: "NOT_LICENSED_FOR_COMMERCIAL_USE" });
		}
	});

	// Europe PMC answered 200 with the full text for /%66ullTextXML and for
	// /fullTextXML?x=1 (live check 2026-11-14). fetch drops a fragment, and the URL
	// parser reads a backslash as a slash and removes a tab.
	it("refuses the full-text routes in each form that reaches them upstream", async () => {
		const upstream: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => {
			upstream.push(String(url));
			return new Response("<article/>", { headers: { "content-type": "application/xml" } });
		});
		const paths = [
			"/PMC1234567/%66ullTextXML", "/PMC1234567/fullTextXML?x=1", "/PMC1234567/fullTextXML#x", "/PMC1234567\\fullTextXML",
			"/PMC1234567/fullText\tXML", "/NBK1234/%62ookXML", "/x/../PMC1234567/fullTextXML?y", "/annotations/../../webservices/rest/PMC1234567/%66ullTextXML",
		];
		for (const path of paths) {
			const result = await apiFetch({ method: "GET", path, licenseProfile: "commercial" });
			expect(`${path}:${result.status}`).toBe(`${path}:451`);
		}
		expect(upstream).toEqual([]);
	});

	it("still serves the metadata routes", async () => {
		vi.stubGlobal("fetch", async () => Response.json({ hitCount: 0 }));
		const result = await apiFetch({ method: "GET", path: "/search", params: { query: "BRAF" }, licenseProfile: "commercial" });
		expect(result.status).toBe(200);
	});
});
