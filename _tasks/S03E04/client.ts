
console.log(`--- S03E04 Interactive Client ---`);
console.log("Type 'items: <msg>' or 'cities: <msg>' to call an endpoint. Type 'exit' to quit.\n");

while (true) {
  const input = prompt("> ");
  
  if (!input || input.toLowerCase() === "exit") {
    console.log("Goodbye!");
    process.exit(0);
  }

  const parts = input.split(":");
  if (parts.length < 2) {
    console.log("Invalid format. Use '<command>: <message>'\n");
    continue;
  }

  const cmd = parts[0].trim().toLowerCase();
  const msg = parts.slice(1).join(":").trim();

  let endpoint = "";
  if (cmd === "items") {
    endpoint = "http://localhost:3000/api/items";
  } else if (cmd === "cities") {
    endpoint = "http://localhost:3000/api/cities";
  } else {
    console.log(`Unknown command: ${cmd}\n`);
    continue;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params: msg })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Output: ${data.output}\n`);
  } catch (error) {
    console.error(`Error: ${error.message}\n`);
  }
}
