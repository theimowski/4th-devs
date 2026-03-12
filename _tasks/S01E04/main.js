import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import { chat, extractToolCalls, extractText } from "../../01_02_tool_use/src/api.js";
import { executeToolCalls } from "../../01_02_tool_use/src/executor.js";
import { createMcpClient, listMcpTools, mcpToolsToOpenAI } from "./src/mcp/client.js";
import { nativeTools, nativeHandlers } from "./src/tools/index.js";

const MODEL = "gpt-5-mini";
const MAX_STEPS = 20;
const BASE_URL = "https://hub.ag3nts.org/dane/doc/";

const INSTRUCTIONS = `You are a web crawler agent. Your goal is to download all interconnected documents starting from index.md and summarize them.
Documents use a special notation for inclusions: [include file="filename.md"].
The base URL for all files is ${BASE_URL}.

Strategy:
1. Start by downloading the index.md using 'download_files'.
2. Use 'fs_read' (from files-mcp) to read the downloaded files.
3. Identify new files mentioned in [include file="..."] tags.
4. Download those new files only if they do not yet exist in the directory.
5. Repeat until you have explored all references.
6. Once all files are downloaded, create a one-sentence summary of the contents of the 'docs' directory.
7. Write this summary to 'declaration.md' inside the 'docs' directory using 'fs_write'.

You are sandboxed to the 'docs' directory. All 'fs_*' operations are relative to it.`;

async function runAgent() {
  console.log("Connecting to MCP server...");
  const mcpClient = await createMcpClient();
  const mcpToolsRaw = await listMcpTools(mcpClient);
  const mcpTools = mcpToolsToOpenAI(mcpToolsRaw);

  const allTools = [...nativeTools, ...mcpTools];
  
  const allHandlers = { 
    ...nativeHandlers,
    // Add MCP tool handlers that call the client
    ...Object.fromEntries(mcpToolsRaw.map(tool => [
      tool.name, 
      async (args) => {
        const result = await mcpClient.callTool({ name: tool.name, arguments: args });
        const textContent = result.content.find((c) => c.type === "text");
        if (textContent) {
          try { return JSON.parse(textContent.text); } catch { return textContent.text; }
        }
        return result;
      }
    ]))
  };

  let conversation = [{ role: "user", content: "Start crawling from index.md, download all references, then write a summary to declaration.md." }];
  
  console.log("Starting Crawler Agent with MCP support...");

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      console.log(`\n--- Step ${step + 1} ---`);
      
      const response = await chat({
        model: MODEL,
        input: conversation,
        instructions: INSTRUCTIONS,
        tools: allTools
      });

      const toolCalls = extractToolCalls(response);

      if (toolCalls.length === 0) {
        console.log("\nFinal Agent Response:");
        console.log(extractText(response));
        break;
      }

      // Importing executeToolCalls from S01E02 logic
      const toolResults = await executeToolCalls(toolCalls, allHandlers);

      conversation = [
        ...conversation,
        ...toolCalls,
        ...toolResults
      ];
    }
  } finally {
    await mcpClient.close();
  }
}

runAgent().catch(console.error);
