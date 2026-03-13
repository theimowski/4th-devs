export async function verify(task, answer) {
  const apikey = process.env.HUB_AG3NTS_KEY;
  const response = await fetch("https://hub.ag3nts.org/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey,
      task,
      answer
    })
  });
  return response;
}
