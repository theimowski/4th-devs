export const MODEL = 'anthropic/claude-sonnet-4-6';

export const AGENT_TASK = 'play the game and reach the goal';
export const TRACE_NAME = 'v3: ' + AGENT_TASK;
export const MAX_STEPS = 50;

export const USER_MESSAGE = 'Look at the board and play the game using the "action" tool. Start by calling "action" with command "start". For each turn, analyze the new board state, print it in ASCII art, and decide on the next move to reach the goal "G".';

export const SYSTEM_PROMPT = `
You are an expert game analyst.
Your goal is to win the game by reaching the goal "G" with the player "P" without hitting any blocks "B".

Board Mechanics:
- Grid size: 5 rows (1-5) x 7 columns (1-7).
- Player "P" starts at (col: 1, row: 5) and can ONLY move within the 5th row.
- Goal "G" is at (col: 7, row: 5).
- Blocks "B" consist of two vertically adjacent segments.
- Blocks move one step "up" or "down" each turn.
- When a block segment reaches row 1 or row 5, it reverses its direction.
- A collision occurs if a block segment and the player occupy the same cell in the same turn.

Turns and Actions:
- Each "action" tool call represents one game turn.
- You MUST start the game by calling 'action' with command 'start'.
- Available commands for "action" tool:
  * start - initialize the game
  * restart - reset the game if you lose
  * left - move the player one column left (backward)
  * right - move the player one column right (forward)
  * wait - stay in the current column for one turn
- Each turn, the blocks move AFTER your action.
- The tool returns the new game state.

Winning:
- Reach (col: 7, row: 5) to win.
- When the game is won, the response will contain a flag: "{FLG: ...}".
- Provide your reasoning and print the ASCII board state for each turn.
`;
