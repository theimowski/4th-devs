
import { handleCitiesQuery } from "./cities.ts";

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST") {
      if (url.pathname === "/api/items") {
        try {
          const body = await req.json();
          return Response.json({ output: body.params });
        } catch (e) {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
        }
      }

      if (url.pathname === "/api/cities") {
        try {
          const body = await req.json();
          const userQuery = body.params;
          console.log(`[cities] Query: ${userQuery}`);

          const finalOutput = await handleCitiesQuery(userQuery);

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
