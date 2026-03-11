import { chat, extractText } from "../../01_02_tool_use/src/api.js";

const MODEL = "anthropic/claude-haiku-4.5";
const INSTRUCTIONS = "You are a helpful and natural-speaking assistant. Keep the conversation natural and concise.";

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/operator") {
      try {
        const body = await req.json();
        const userMessage = body.msg;

        console.log(`[Operator] Input: ${userMessage}`);

        // Relay to model
        const response = await chat({
          model: MODEL,
          instructions: INSTRUCTIONS,
          input: [{ role: "user", content: userMessage }]
        });

        const reply = extractText(response) || "I'm sorry, I couldn't process that.";
        console.log(`[Assistant] Reply: ${reply}`);

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

console.log(`Interactive Chat Server listening on http://localhost:${server.port}...`);
