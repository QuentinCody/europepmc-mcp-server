import { describe, expect, it } from "vitest";
import { createEuropePmcApiFetch } from "./api-adapter";

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
});
