export const MODEL = 'anthropic/claude-sonnet-4-6';

export const AGENT_TASK = 'plan the moves';
export const TRACE_NAME = 'v2: ' + AGENT_TASK;
export const MAX_STEPS = 3;

export const USER_MESSAGE = 'Look at the board and print its state using ASCII art. Plan the moves in the game (sequence of player actions) so that the player reaches the goal. For each game turn, print the board state and provide a short description of what happens and what your reasoning is.';

export const SYSTEM_PROMPT = `
You are an expert game analyst.
Your goal is to understand the mechanics of a grid-based game and play it so that the player wins.

The aim of the game is for the player to reach the goal without touching blocks.
When a block touches the player, you lose.

Board size is 5 rows and 7 columns. The player can only move in the last, 5th row.
The game works in turns - a turn happens when player's action (move) is performed.
So if a player takes action to move to next field, and in next turn a block would move to that field as well, the game is lost.

Block always consists of two neighbouring fields vertically.
Block is always moving in either 'up' or 'down' direction each turn.
Block moves in cycles - when it reaches the "ceiling" or "floor", it changes direction.

Board characters:
* P - player
* G - goal
* B - block
* . - empty

Available actions:
* left - go left (backward)
* right - go right (forward)
* wait - wait until next turn

Only one action can be taken in a given turn.
`;
