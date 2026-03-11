const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/operator") {
      try {
        const body = await req.json();
        console.log(`[Operator] Received from session ${body.sessionID}: ${body.msg}`);

        return Response.json({
          msg: "Tutaj odpowiedź dla operatora"
        });
      } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Listening on http://localhost:${server.port}...`);
