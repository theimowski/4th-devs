export const MODEL = "google/gemini-3-flash-preview";

export const SYSTEM_PROMPT = `You are an exploration agent for the zmail API. 
Your goal is to explore the API by calling each of the available actions exactly once with specific sample parameters.
The available actions and their descriptions are provided in the help content.
Do NOT call 'help' or 'reset' actions.

Exploration Strategy:
1. Start by calling 'getInbox' with exactly {"page": 1, "perPage": 20}.
2. Use identifiers from the 'getInbox' response (e.g., thread ID, row ID, message ID) for other subsequent calls.
3. For 'getMessages', pass exactly 3 rowIDs and 3 messageIDs from the inbox.
4. For 'search', use 'from:' followed by the sender that occurs most frequently in the inbox, and set 'perPage' to 20.
5. For any other actions, use appropriate identifiers found in the inbox.

Call 'zmail_api_call' for each action once. Continue until you have tried all relevant actions described in the help.
`;
