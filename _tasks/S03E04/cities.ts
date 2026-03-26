
import fs from "node:fs";
import path from "node:path";
import { chat, extractToolCalls, extractText } from "../../01_02_tool_use/src/api.js";
import { 
  withTrace, 
  withAgent, 
  startGeneration, 
  advanceTurn, 
  withTool 
} from "../utils/langfuse.js";
import { extractTokenUsage } from "../utils/utils.js";

const citiesCsvPath = path.join(import.meta.dirname, "cities.csv");
const connectionsCsvPath = path.join(import.meta.dirname, "connections.csv");

const cityCodeToName: Record<string, string> = {};
const itemCodeToCities: Record<string, string[]> = {};

function loadData() {
  if (!fs.existsSync(citiesCsvPath) || !fs.existsSync(connectionsCsvPath)) {
    console.warn("[cities] Data files not found. Tool lookups will fail.");
    return;
  }

  const citiesCsv = fs.readFileSync(citiesCsvPath, "utf-8");
  const citiesLines = citiesCsv.split("\n").filter(line => line.trim());
  for (let i = 1; i < citiesLines.length; i++) {
    const [name, code] = citiesLines[i].split(",").map(s => s.trim());
    if (name && code) {
      cityCodeToName[code] = name;
    }
  }

  const connectionsCsv = fs.readFileSync(connectionsCsvPath, "utf-8");
  const connectionsLines = connectionsCsv.split("\n").filter(line => line.trim());
  for (let i = 1; i < connectionsLines.length; i++) {
    const [itemCode, cityCode] = connectionsLines[i].split(",").map(s => s.trim());
    if (itemCode && cityCode) {
      const cityName = cityCodeToName[cityCode];
      if (cityName) {
        if (!itemCodeToCities[itemCode]) {
          itemCodeToCities[itemCode] = [];
        }
        if (!itemCodeToCities[itemCode].includes(cityName)) {
          itemCodeToCities[itemCode].push(cityName);
        }
      }
    }
  }
}

loadData();

const MODEL = "openai/gpt-5-mini";
const SYSTEM_PROMPT = `You are a helpful assistant that finds cities where a specific item is located.
You have access to a tool 'cities' which takes an item code and returns a list of cities.
Your goal is to answer the user's query about item locations.
Respond with information about the items found in a natural sentence. Do not include any conversational filler or unrelated text.
If you find the cities, list them. If no cities are found or the item code is unknown, say so clearly.
Always use the 'cities' tool if the user provides an item code or asks about one.`;

const tools = [
  {
    type: "function",
    name: "cities",
    description: "Get the list of cities where a specific item is found.",
    parameters: {
      type: "object",
      properties: {
        itemCode: {
          type: "string",
          description: "The code of the item to search for (e.g., '87WZTF')."
        }
      },
      required: ["itemCode"],
      additionalProperties: false
    }
  }
];

const handlers = {
  cities: async ({ itemCode }: { itemCode: string }) => {
    return withTool({ name: "cities", input: { itemCode } }, async () => {
      console.log(`[Tool] Looking up itemCode: ${itemCode}`);
      const cities = itemCodeToCities[itemCode];
      if (cities && cities.length > 0) {
        return JSON.stringify(cities);
      }
      return JSON.stringify({ error: `Item ${itemCode} not found or has no city assignments.` });
    });
  }
};

export async function handleCitiesQuery(userQuery: string): Promise<string> {
  const sessionId = `cities-${Date.now()}`;
  const traceName = "City Search: " + (userQuery.length > 30 ? userQuery.substring(0, 30) + "..." : userQuery);

  return withTrace({ name: traceName, sessionId, input: userQuery }, async () => {
    return withAgent({ name: "city-finder", agentId: "finder-1", task: "find cities for item" }, async () => {
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
