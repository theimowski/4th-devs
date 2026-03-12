import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import { chat, extractToolCalls, extractText } from "../../01_02_tool_use/src/api.js";
import { executeToolCalls } from "../../01_02_tool_use/src/executor.js";
import { createMcpClient, listMcpTools, mcpToolsToOpenAI } from "./src/mcp/client.js";
import { nativeTools, nativeHandlers } from "./src/tools/index.js";

const MODEL = "gpt-5.2";
const MAX_STEPS = 100;
const BASE_URL = "https://hub.ag3nts.org/dane/doc/";

const INSTRUCTIONS = `You are a logistics agent. Your ULTIMATE GOAL is to create a correctly filled transport declaration for the SPK (System Przesyłek Konduktorskich).

The declaration must follow the format found in the documents you download. Use Polish (język polski) for all fields in the declaration.

PREREQUISITE (Information Gathering):
1. Start by downloading 'https://hub.ag3nts.org/dane/doc/index.md' and all its references (recursive) using 'download_files' and 'fs_read'. References are in '[include file="filename.ext"]' format.
2. Store all downloaded files in the 'docs' directory.
3. Use 'understand_image' to analyze all images found and get descriptions.
4. Read the downloaded documents to understand all rules and regulations. 
IMPORTANT: You MUST NOT read any existing 'declaration_XX.md' files that might be present in the 'docs/' directory.

MAIN CHALLENGE (Transport Declaration):
You must submit a correctly filled transport declaration for a shipment from Gdańsk to Żarnowiec. It is verified by humans and automatons, so it must be logically consistent with the SPK regulations you crawl.
- Sender (ID): 450202122
- Departure: Gdańsk
- Destination: Żarnowiec
- Weight: 2800 kg
- Content: reactor fuel cassettes
- Budget: 0 PP (The shipment MUST be free or System-financed). You must find the specific rules in the documents (e.g., fee tables, categories, or exemptions) that allow for a 0 PP cost.
- Special remarks: None (do not add any).

IMPORTANT: It DOES NOT matter that the track between Gdańsk and Żarnowiec is closed. This will be handled later. You MUST NOT attempt to find an alternative route; use the direct connection despite its status.

FINAL ACTIONS:
At the very end of the process, you MUST perform BOTH of these actions:
1. Write 'docs/declaration_XX.md' (where XX is a two-digit counter: 01, 02, etc.), incrementing based on existing files in 'docs/'. This file must contain ONLY the filled declaration form in Polish (WITHOUT any rationales).
2. Return a final response to the user containing the full text of the declaration where for all fields you MUST append " --> " followed by a brief rationale (reasoning) explaining why you chose that specific value (e.g., "POLE: Wartość --> Rationale").`;

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

      // Log usage
      const usage = response.usage;
      if (usage) {
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
        const cachePercent = inputTokens > 0 ? (cachedTokens / inputTokens * 100).toFixed(1) : 0;
        console.log(`[Usage] In: ${inputTokens}, Out: ${outputTokens}, Cached: ${cachedTokens} (${cachePercent}%)`);
      }

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
      console.error("\n[Error] Maximum steps reached (100). The task may be incomplete.");
    }

    // --- Verification Step ---
    const DOCS_DIR = path.join(import.meta.dirname, "docs");
    if (fs.existsSync(DOCS_DIR)) {
      const files = fs.readdirSync(DOCS_DIR);
      const declarations = files
        .filter(f => f.startsWith("declaration_") && f.endsWith(".md"))
        .sort()
        .reverse();

      if (declarations.length > 0) {
        const latestFile = declarations[0];
        const latestPath = path.join(DOCS_DIR, latestFile);
        console.log(`\nReading latest declaration from ${latestFile}...`);
        const declarationContent = fs.readFileSync(latestPath, "utf-8");

        console.log(`Sending verification for task "sendit" to https://hub.ag3nts.org/verify...`);
        const verifyResponse = await fetch("https://hub.ag3nts.org/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apikey: process.env.HUB_AG3NTS_KEY,
            task: "sendit",
            answer: {
              declaration: declarationContent
            }
          })
        });

        const verifyData = await verifyResponse.json();
        console.log(`Verification Status: ${verifyResponse.status}`);
        console.log("Verification Response:", JSON.stringify(verifyData, null, 2));
      } else {
        console.log("\nNo declaration_XX.md files found in docs/ directory to verify.");
      }
    }
  } finally {
    await mcpClient.close();
  }
}

runAgent().catch(console.error);
