import fs from "node:fs";
import path from "node:path";
import { chat, extractText } from "../../01_02_tool_use/src/api.js";

const MODEL = "anthropic/claude-haiku-4.5";
const INSTRUCTIONS = "You are a human operator named Alex. Speak naturally, be concise, and never mention that you are an AI or a language model. Your goal is to be helpful and maintain a natural, human-like conversation.";

const getSessionPath = (sessionID: string) => path.join(import.meta.dirname, `${sessionID}.json`);

const loadHistory = (sessionID: string) => {
  const filePath = getSessionPath(sessionID);
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.error(`Error reading history for ${sessionID}:`, e.message);
    }
  }
  return [];
};

const saveHistory = (sessionID: string, history: any[]) => {
  const filePath = getSessionPath(sessionID);
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
};

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/operator") {
      try {
        const body = await req.json();
        const { sessionID, msg: userMessage } = body;

        if (!sessionID) {
          return new Response(JSON.stringify({ error: "sessionID is required" }), { status: 400 });
        }

        console.log(`[Session: ${sessionID}] Input: ${userMessage}`);

        // Load specific session history
        const conversationHistory = loadHistory(sessionID);
        
        // Add user message to history
        conversationHistory.push({ role: "user", content: userMessage });

        console.log(`[Main] Sending request for ${sessionID} with ${conversationHistory.length} messages...`);

        // Relay to model with session history
        const response = await chat({
          model: MODEL,
          instructions: INSTRUCTIONS,
          input: conversationHistory
        });

        const reply = extractText(response) || "I'm sorry, I couldn't process that.";
        console.log(`[Assistant] Reply: ${reply}`);

        // Add assistant reply and save
        conversationHistory.push({ role: "assistant", content: reply });
        saveHistory(sessionID, conversationHistory);

        return Response.json({
          msg: reply
        });
      } catch (e) {
        console.error("Error processing request:", e.message);
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Interactive Multi-Session Server listening on http://localhost:${server.port}...`);
