const sessionID = Bun.argv[2] || "default-session";
console.log(`--- Interactive Test Client (Session: ${sessionID}) ---`);
console.log("Type your message and press Enter. Type 'exit' to quit.\n");

while (true) {
  const input = prompt("You: ");
  
  if (!input || input.toLowerCase() === "exit") {
    console.log("Goodbye!");
    process.exit(0);
  }

  try {
    const response = await fetch("http://localhost:3000/operator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionID: sessionID,
        msg: input
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Assistant: ${data.msg}\n`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}
