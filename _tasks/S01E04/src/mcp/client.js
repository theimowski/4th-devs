import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile } from "fs/promises";
import path from "node:path";

const loadMcpConfig = async () => {
  const configPath = path.join(import.meta.dirname, "../../mcp.json");
  const content = await readFile(configPath, "utf-8");
  return JSON.parse(content);
};

export const createMcpClient = async (serverName = "files") => {
  const config = await loadMcpConfig();
  const serverConfig = config.mcpServers[serverName];

  if (!serverConfig) {
    throw new Error(`MCP server "${serverName}" not found in mcp.json`);
  }

  const client = new Client(
    { name: "crawler-client", version: "1.0.0" },
    { capabilities: {} }
  );

  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args,
    env: {
      ...process.env,
      ...serverConfig.env
    },
    cwd: path.join(import.meta.dirname, "../../"),
    stderr: "inherit"
  });

  await client.connect(transport);
  return client;
};

export const listMcpTools = async (client) => {
  const result = await client.listTools();
  return result.tools;
};

export const mcpToolsToOpenAI = (mcpTools) =>
  mcpTools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    strict: false
  }));
