
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST") {
      if (url.pathname === "/api/items" || url.pathname === "/api/cities") {
        try {
          const body = await req.json();
          const params = body.params;
          
          console.log(`[${url.pathname}] Received: ${params}`);

          return Response.json({ output: params });
        } catch (e) {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server listening on http://localhost:${server.port}...`);
