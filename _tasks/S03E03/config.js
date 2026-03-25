export const MODEL = 'anthropic/claude-sonnet-4-6';

export const AGENT_TASK = 'describe board state';
export const TRACE_NAME = 'v1: ' + AGENT_TASK;
export const MAX_STEPS = 3;

export const USER_MESSAGE = 'Look at the board and explain its state. Describe where the player and goal are, what is the position of all blocks and their direction. What happens if the player takes any action from the available actions?';

export const SYSTEM_PROMPT = `
You are an expert game analyst.
Your goal is to understand the mechanics of a grid-based game and explain them.

The aim of the game is for the player to reach the goal without touching blocks.

Board size is 5 rows and 7 columns. The player can only move in the last, 5th row.
The game works in turns - a turn happens when player's action (move) is performed.

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
