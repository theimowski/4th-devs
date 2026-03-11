import fs from "node:fs";
import path from "node:path";
import config from "config.js";

const __dirname = import.meta.dirname;
const answerPath = path.join(__dirname, "answer.json");

if (!fs.existsSync(answerPath)) {
  console.error(`Error: ${answerPath} not found.`);
  process.exit(1);
}

const answer = JSON.parse(fs.readFileSync(answerPath, "utf-8"));

const payload = {
  apikey: process.env.HUB_AG3NTS_KEY,
  task: "proxy",
  answer: answer
};

console.log("Submitting payload:");
console.log(JSON.stringify(payload, null, 2));

console.log("Sending verification for task: proxy...");
try {
  const response = await fetch("https://hub.ag3nts.org/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  console.log(`Status: ${response.status}`);
  console.log("Response:", JSON.stringify(data, null, 2));
} catch (error) {
  console.error("Verification failed:", error.message);
}
