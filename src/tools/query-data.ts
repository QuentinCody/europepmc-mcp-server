import { europePmcResponse } from "../lib/tool-result";
import type { McpServer } from "@bio-mcp/shared/mcp";
import { z } from "zod";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";

interface QueryDataArgs {
    data_access_id: string;
    sql: string;
    limit?: number;
}

interface ExtraWithEnv {
    env?: Partial<Env>;
}

export function registerQueryData(server: McpServer, env?: Partial<Env>): void {
    const handler = createQueryDataHandler("EUROPEPMC_DATA_DO", "europepmc");

  for (const name of ["europepmc_query_data", "mcp_europepmc_query_data"]) {
    server.registerTool(
        name,
        {
            title: "Query Staged Europe PMC Data",
            description:
                "Query staged Europe PMC data using SQL. Use this when search results, annotations, or full-text payloads were too large and got staged with a data_access_id.",
            inputSchema: {
                data_access_id: z.string().min(1).describe("Data access ID for the staged dataset"),
                sql: z.string().min(1).describe("SQL query to execute against the staged data"),
                limit: z.number().int().positive().max(10000).optional().describe("Maximum number of rows to return (default: 100)"),
            },
        },
        async (args: QueryDataArgs, extra) => {
            const runtimeEnv = env ?? (extra as ExtraWithEnv).env ?? {};
            const handlerArgs: Record<string, unknown> = {
                data_access_id: args.data_access_id,
                sql: args.sql,
                limit: args.limit,
            };
            return europePmcResponse(() => handler(handlerArgs, runtimeEnv), runtimeEnv, name, extra, args);
        },
    );
  }
}
