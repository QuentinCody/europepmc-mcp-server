import { buildHealthResponse, configureCitationSigning } from "@bio-mcp/shared";
// Europe PMC MCP Server — Code Mode only.
// Tools: europepmc_search, europepmc_execute, europepmc_query_data, europepmc_get_schema
import { StatelessMcpWorker } from "@bio-mcp/shared/mcp";
import { McpServer } from "@bio-mcp/shared/mcp";
import { registerQueryData } from "./tools/query-data";
import { registerGetSchema } from "./tools/get-schema";
import { registerCodeMode } from "./tools/code-mode";
import { EuropePmcDataDO } from "./do";

export { EuropePmcDataDO };

export class MyMCP extends StatelessMcpWorker<Env> {
    server = new McpServer({
        name: "europepmc",
        version: "0.1.0",
    });

    async init() {

    	configureCitationSigning(this.env);
        const env = this.env;
        registerQueryData(this.server, env);
        registerGetSchema(this.server, env);
        registerCodeMode(this.server, env);
    }
}

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return buildHealthResponse("europepmc");
        }

        if (url.pathname === "/mcp") {
            return MyMCP.serve("/mcp").fetch(request, env, ctx);
        }

        return new Response("Not found", { status: 404 });
    },
};
