import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import { chat, extractToolCalls, extractText } from "../../01_02_tool_use/src/api.js";
import { executeToolCalls } from "../../01_02_tool_use/src/executor.js";
import { createMcpClient, listMcpTools, mcpToolsToOpenAI } from "./src/mcp/client.js";
import { nativeTools, nativeHandlers } from "./src/tools/index.js";

const MODEL = "google/gemini-2.5-flash";
const MAX_STEPS = 30;
const BASE_URL = "https://hub.ag3nts.org/dane/doc/";

const INSTRUCTIONS = `You are a web crawler and logistics agent. Your ULTIMATE GOAL is to create a correctly filled transport declaration for the SPK (System Przesyłek Konduktorskich).

The declaration must follow the format found in the documents you download. Use Polish (język polski) for all fields in the declaration.

PREREQUISITE (Crawling & Analysis):
1. Check if 'docs/_toc.md' exists using 'fs_read'. If it does, verify all files and checksums.
2. If not, start crawling from the main entry point (index) using 'download_files' and 'fs_read'. 
   - Follow all [include file="filename.ext"] tags recursively.
   - Maintain 'docs/_toc.md' with all filenames and checksums (including images).
   - Use 'understand_image' to analyze all images found (e.g., maps, schematics) and get descriptions.

MAIN CHALLENGE (Transport Declaration):
You must submit a correctly filled transport declaration for a shipment from Gdańsk to Żarnowiec. It is verified by humans and automatons, so it must be logically consistent with the SPK regulations you crawl.
- Sender (ID): 450202122
- Departure: Gdańsk
- Destination: Żarnowiec
- Weight: 2800 kg
- Content: reactor fuel cassettes
- Budget: 0 PP (The shipment MUST be free or System-financed). You must find the specific rules in the documents (e.g., fee tables, categories, or exemptions) that allow for a 0 PP cost.
- Special remarks: None (do not add any).

The final file must be named 'docs/declaration_XX.md', where XX is a two-digit counter (01, 02, etc.). 
Before writing, check 'docs/' using 'fs_read' to see which 'declaration_XX.md' files already exist and use the next available number (e.g., if 'declaration_01.md' exists, use 'declaration_02.md').
The file must contain ONLY the filled declaration form in Polish.

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
    let reachedMaxSteps = true;
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
        reachedMaxSteps = false;
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

    if (reachedMaxSteps) {
      console.error("\n[Error] Maximum steps reached (30). The task may be incomplete.");
    }
  } finally {
    await mcpClient.close();
  }
}

runAgent().catch(console.error);
