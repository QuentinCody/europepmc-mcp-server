import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { europePmcCatalog } from "../spec/catalog";
import { createEuropePmcApiFetch } from "../lib/api-adapter";

/**
 * Interface matching what createSearchTool/createExecuteTool .register() expects.
 * The shared lib calls server.tool(name, description, schema, handler).
 */
interface ToolRegisterable {
    tool: (...args: unknown[]) => void;
}

function toRegisterable(server: McpServer): ToolRegisterable {
    return {
        tool(...args: unknown[]) {
            Function.prototype.apply.call(server.tool, server, args);
        },
    };
}

/** Minimal shape required from the worker Env for Code Mode registration. */
interface CodeModeEnv {
    EUROPEPMC_DATA_DO: Pick<Env["EUROPEPMC_DATA_DO"], "get" | "idFromName">;
    CODE_MODE_LOADER: Env["CODE_MODE_LOADER"];
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const doNamespace = env.EUROPEPMC_DATA_DO;
    const loader = env.CODE_MODE_LOADER;

    if (!doNamespace || !loader) return;

    const apiFetch = createEuropePmcApiFetch();
    const registerable = toRegisterable(server);

    const searchTool = createSearchTool({
        prefix: "europepmc",
        catalog: europePmcCatalog,
    });
    searchTool.register(registerable);

    const executeTool = createExecuteTool({
        prefix: "europepmc",
        // Verifiable provenance: europepmc_execute results carry a _meta.citation.
        source: {
            id: "europepmc",
            name: "Europe PMC",
            url: "https://europepmc.org",
            license: "Metadata open (EMBL-EBI Terms of Use); full-text per-article CC license varies",
        },
        catalog: europePmcCatalog,
        apiFetch,
        doNamespace,
        loader,
    });
    executeTool.register(registerable);
}
