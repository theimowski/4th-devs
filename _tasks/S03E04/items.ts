
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { chat, extractToolCalls, extractText } from "../../01_02_tool_use/src/api.js";
import { 
  withTrace, 
  withAgent, 
  startGeneration, 
  advanceTurn, 
  withTool 
} from "../utils/langfuse.js";
import { extractTokenUsage } from "../utils/utils.js";

const itemsCsvPath = path.join(import.meta.dirname, "items.csv");

const MODEL = "openai/gpt-5.2";
const SYSTEM_PROMPT = `You are a helpful logistics assistant that finds items and their codes from the inventory.
Your goal is to answer the user's query by searching for items in the inventory.

You have access to an 'items' tool which literally calls the 'grep' program on the 'items.csv' file. 
Use this tool with appropriate search patterns to find what the user is looking for.
Note: 
- The inventory is in POLISH language. Use only POLISH words for your search patterns.
- The 'items' tool calls 'grep' with the '-Ei' flags (Extended Regex, case-insensitive).
- You can use extended regex patterns like 'akumulator|bateria' to search for multiple terms at once.
- Do NOT use inline flags like '(?i)'.

Logic:
- Extract item names from the user query.
- Use the 'items' tool (grep) to find available items matching the criteria.
- If there are 1 to 5 such items, report them back (name and code) in a natural sentence in the user's language.
- If there are more than 5 such items (up to 20), do NOT list them. Instead, analyze the matching item names, extract common parameters (like capacity, voltage, resistance, wattage, etc.), and ask the user to be more specific by providing these parameters. 
  Example: "Mamy prawie 100, doprecyzuj jakie mają być: pojemność elektryczna (pF) i napięcie (V)?"
- If no items are found, inform the user clearly.

CRITICAL: Your final response MUST BE between 4 and 500 bytes in size.

Respond ONLY with information about the items or the clarification request. Avoid conversational filler.`;

const tools = [
  {
    type: "function",
    name: "items",
    description: "Search for items in the inventory by calling 'grep -Ei' on the CSV file. Returns up to 20 matches. Use Polish terms.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The extended regex pattern to grep for. Use Polish words."
        }
      },
      required: ["pattern"],
      additionalProperties: false
    }
  }
];

const handlers = {
  items: async ({ pattern }: { pattern: string }) => {
    return withTool({ name: "items", input: { pattern } }, async () => {
      console.log(`[Tool] Grepping items for pattern: ${pattern}`);
      try {
        if (!fs.existsSync(itemsCsvPath)) {
          return JSON.stringify({ error: "Inventory file not found." });
        }

        const escapedPattern = pattern.replace(/'/g, "'\\''");
        const command = `grep -Ei '${escapedPattern}' '${itemsCsvPath}' | head -n 21`;
        
        let output = "";
        try {
          output = execSync(command, { encoding: "utf-8" });
        } catch (e: any) {
          if (e.status === 1) {
            return JSON.stringify({ total_matches: 0, results: [] });
          }
          throw e;
        }

        const lines = output.split("\n").filter(line => line.trim());
        const limitedMatches = lines.slice(0, 20);
        const results = limitedMatches.map(line => {
          const lastCommaIndex = line.lastIndexOf(",");
          const name = line.substring(0, lastCommaIndex).trim();
          const code = line.substring(lastCommaIndex + 1).trim();
          return { name, code };
        });

        return JSON.stringify({ 
          total_matches: lines.length > 20 ? "more than 20" : lines.length, 
          results: results,
          showing: results.length
        });
      } catch (error: any) {
        console.error(`[Tool Error] ${error.message}`);
        return JSON.stringify({ error: error.message });
      }
    });
  }
};

export async function handleItemsQuery(userQuery: string): Promise<string> {
  const sessionId = `items-${Date.now()}`;
  const traceName = "Item Search (Grep): " + (userQuery.length > 30 ? userQuery.substring(0, 30) + "..." : userQuery);

  return withTrace({ name: traceName, sessionId, input: userQuery }, async () => {
    return withAgent({ name: "item-search-agent", agentId: "searcher-1", task: "find items for user using grep" }, async () => {
      let conversation: any[] = [{ role: "user", content: userQuery }];
      let finalOutput = "I'm sorry, I couldn't find an answer.";

      for (let step = 0; step < 5; step++) {
        advanceTurn();
        const generation = startGeneration({ model: MODEL, input: conversation });

        try {
          const response = await chat({
            model: MODEL,
            input: conversation,
            tools,
            instructions: SYSTEM_PROMPT
          });

          const usage = extractTokenUsage(response);
          generation.end({ output: response, usage });

          const toolCalls = extractToolCalls(response);
          const text = extractText(response);

          if (text) {
            conversation.push({ role: "assistant", content: text });
            finalOutput = text;
          }

          if (toolCalls && toolCalls.length > 0) {
            const toolResults = [];
            for (const call of toolCalls) {
              const handler = (handlers as any)[call.name];
              if (handler) {
                const args = JSON.parse(call.arguments);
                const result = await handler(args);
                toolResults.push({ type: "function_call_output", call_id: call.call_id, output: result });
              } else {
                toolResults.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: `Unknown tool: ${call.name}` }) });
              }
            }

            conversation = [
              ...conversation,
              ...toolCalls.map(c => ({ ...c })),
              ...toolResults
            ];
          } else {
            if (text) return text;
            break;
          }
        } catch (error: any) {
          generation.error(error);
          throw error;
        }
      }

      return finalOutput;
    });
  });
}
