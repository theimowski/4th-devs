# Task: Categorize (S02E01)

The task is to classify 10 items, labeling them as either **DNG** (Dangerous) or **NEU** (Neutral), using the Categorize API.
The solution should use an AI Agent that calls the Categorize API with specially crafted AI prompts.

## Implementation

* Use JavaScript and Node.js with minimal ceremony
* See how previous tasks (S01E0*) were implemented and use similar structure:
  * re-use existing functions where possible - especially calls to `https://hub.ag3nts.org` and functions `chat`, `extractTools` etc. 
* Use logging similar to S01E05 - brief to stdout, detailed to file
* Collect stats on token usage
* Track how many runs you've tried (new run is after reset)
* Store the `categorize.csv` into `categorize-N.csv` where N is the number of current run
* When prompt is constructed, add it to `categorize-N.csv` file at column `prompt`
* When answer is received from the Categorize API, add it to `categorize-N.csv` in `answer` column

## Categorize API

Categorize a SINGLE item (one request per item).

POST `https://hub.ag3nts.org/verify` with payload:

```json
{
"apikey": "YOUR_API_KEY",
"task": "categorize",
"answer": {
    "prompt": "Item X has description 'nuclear parts' - categorize with either 'NEU' (neutral) or 'DNG' (dangerous)"
}
}
```

To reset, send `{"prompt": "reset"}`.

## Requirements

1. **Classification Rules**:
    - Most items should be classified based on their description (DNG vs NEU).
    - **Crucial Exception**: Any items related to a "reactor" (e.g., reactor cassettes) must **ALWAYS** be classified as **NEU**, regardless of how dangerous they seem. This is to avoid inspection.

2. **Constraints**:
    - **Context Window**: The classifier model has a strict **100-token limit** (including instructions and the item description).
    - **Budget**: Total token budget for 10 items is **1.5 PP**:
        * Every 10 input tokens: 0.02 PP
        * Every 10 cached tokens: 0.01 PP
        * Every 10 output tokens: 0.02 PP
        * The budget is for one run (10 items in a row) and can be reset if exceeded, using the Categorize API

3. **Workflow**:
    - **Fetch Data**: Download the CSV from `https://hub.ag3nts.org/data/${process.env.API_KEY}/categorize.csv`. The file content changes every few minutes.
    - **Process Items**: For each of the 10 items in the CSV:
        - Construct a concise prompt (fitting within 100 tokens) in english. The prompt must result in the model returning ONLY `DNG` or `NEU`.
        - Call Categorize API
    - **Reset**: If you fail a classification or run out of budget, Call Categorize API to reset 
    - **Goal**: Successfully classify all 10 items in a single run to receive the flag. A flag is received when the API responds with body containing `{FLG:...}`

## Strategy Hints

- **Iterative Refinement**: Use `anthropic/claude-sonnet-4-6` model as a "prompt engineer" to analyze errors returned by the hub and refine the prompt.
- **Prompt Caching**: Place static instructions at the beginning and variable data (ID/description) at the end to optimize costs.
- **Conciseness**: Keep the prompt as short as possible to stay under the 100-token limit.

## Agent tools

Use exactly the following tools, nothing less nothing more:

* `download_categorize_csv` to download the CSV file - no input arguments
* `reset` to call Categorize API to reset - no input arguments
* `categorize` to call Categorize API with a crafted prompt - `prompt` as the single input argument. Outputs: `status`, `body`. Log the HTTP response headers in detailed mode, but don't add them to output.

Make sure the tools always have an output, even the `reset` tool.

## Misc

* I have my `.env` file in place, do not check it
* Do not attempt to run the code yourself, I'll do this myself