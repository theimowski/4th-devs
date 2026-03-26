
import { handleCitiesQuery } from "./cities.ts";
import { handleItemsQuery } from "./items.ts";
import { initTracing, flush } from "../utils/langfuse.js";

initTracing("S03E04-LogisticsAssistant");

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST") {
      if (url.pathname === "/api/items") {
        try {
          const body = await req.json();
          const userQuery = body.params;
          
          if (typeof userQuery !== "string") {
            return new Response(JSON.stringify({ error: "params must be a string" }), { status: 400 });
          }

          console.log(`[items] Query: ${userQuery}`);

          const finalOutput = await handleItemsQuery(userQuery);

          await flush();

          return Response.json({ output: finalOutput });
        } catch (e: any) {
          console.error(`[Error] ${e.message}`);
          return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
      }

      if (url.pathname === "/api/cities") {
        try {
          const body = await req.json();
          const userQuery = body.params;

          if (typeof userQuery !== "string") {
            return new Response(JSON.stringify({ error: "params must be a string" }), { status: 400 });
          }

          console.log(`[cities] Query: ${userQuery}`);

          const finalOutput = await handleCitiesQuery(userQuery);

          await flush();

          return Response.json({ output: finalOutput });
        } catch (e: any) {
          console.error(`[Error] ${e.message}`);
          return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server listening on http://localhost:${server.port}...`);
