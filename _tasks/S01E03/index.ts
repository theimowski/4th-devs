import { chat, extractText } from "../../01_02_tool_use/src/api.js";

const MODEL = "anthropic/claude-haiku-4.5";
const INSTRUCTIONS = "You are a human operator named Alex. Speak naturally, be concise, and never mention that you are an AI or a language model. Your goal is to be helpful and maintain a natural, human-like conversation.";

// In-memory conversation storage
let conversationHistory = [];

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/operator") {
      try {
        const body = await req.json();
        const userMessage = body.msg;

        console.log(`[Operator] Input: ${userMessage}`);

        // Add user message to history
        conversationHistory.push({ role: "user", content: userMessage });

        console.log(`[Main] Sending request to chat API with ${conversationHistory.length} messages...`);

        // Relay to model with full history
        const response = await chat({
          model: MODEL,
          instructions: INSTRUCTIONS,
          input: conversationHistory
        });

        const reply = extractText(response) || "I'm sorry, I couldn't process that.";
        console.log(`[Assistant] Reply: ${reply}`);

        // Add assistant reply to history
        conversationHistory.push({ role: "assistant", content: reply });

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

console.log(`Interactive Chat Server (with history) listening on http://localhost:${server.port}...`);
