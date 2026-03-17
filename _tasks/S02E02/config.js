export const MODEL = 'openai/gpt-5.4';
export const CATEGORIZATION_MODEL = 'google/gemini-3-flash-preview';

export const AGENT_MODEL = 'openai/gpt-5-mini';
export const SYSTEM_PROMPT = `You are a puzzle-solving agent. Your task is to solve the "electricity" puzzle.
The puzzle consists of a 3x3 grid of squares. Each square contains a line pattern.
You must transform each square from its original state in "electricity.png" to match its "solved" state in "solved_electricity.png".
Transformation is done by turning a square 90 degrees right.

Knowledge:
A square pattern is represented by a number 0-15 (binary bits: Left=8, Top=4, Right=2, Bottom=1).
To calculate turns from original 'x' to solved 'y':
- Rotation function: turn(val) = ((val >> 1) | ((val & 1) << 3))
- Try rotating 'x' up to 3 times. If x == y after N turns, call 'turn' tool N times.

Workflow:
1. Extract grid from "electricity.png" to "electricity-grid.png".
2. Extract grid from "solved_electricity.png" to "solved-grid.png".
3. For each square (start with first row: 1x1, 1x2, 1x3):
   a. Extract square from "electricity-grid.png" to "electricity-RxC.png".
   b. Extract square from "solved-grid.png" to "solved-RxC.png".
   c. Classify both squares to get their numeric values.
   d. Calculate turns and call 'turn' tool for that position.

Focus ONLY on the first row (1x1, 1x2, 1x3) for now.
Use tools for every action. Do not guess coordinates or values.`;

export const getGridPrompt = (width, height) => `Find the 3x3 grid in the image. The grid has black framing and consists of a 3x3 grid of squares. 
Note that each square in the grid contains black lines which are thicker than the framing of the grid itself. Do not confuse the thicker lines inside the squares with the thinner grid framing.
Extract the coordinates for the entire 3x3 grid. The bounding box returned should have the black framing at its edges, i.e. there should be as many black pixels at every edge (top, bottom, left, right) as possible.
Return ONLY a JSON object with the following keys: ymin, xmin, ymax, xmax. The coordinates should be in pixels.

Example response:
{
  "ymin": 100,
  "xmin": 150,
  "ymax": 200,
  "xmax": 250
}

Image size is ${width}x${height}.
IMPORTANT: ymax and xmax MUST be within the bounds of the original image (ymax <= ${height}, xmax <= ${width}).`;

export const getSquarePromptForPos = (row, col, width, height) => `This image is a 3x3 grid of squares. 
Extract the coordinates for a specific square in this grid. 
The crop should be tight enough so that the thin black frames of the grid are NOT visible. 
Inside the squares there are thick black lines - these are part of the square's content and should NOT be confused with the thin grid framing.
Return ONLY a JSON object with the following keys: ymin, xmin, ymax, xmax. The coordinates should be in pixels.

Example response:
{
  "ymin": 50,
  "xmin": 50,
  "ymax": 150,
  "xmax": 150
}

Image size is ${width}x${height}.
Target square position: row ${row}, column ${col} (1-indexed).`;

export const getCategorizationPrompt = () => `The image represents a set of black lines on a bright background. 
A line always originates at the center of the image and can go towards one of the edges: left, top, right, bottom. 

You must return a single decimal number between 0 and 15 representing the set of detected lines. 
The number is constructed using a 4-bit binary format where:
- 1st bit (MSB, value 8): Left edge
- 2nd bit (value 4): Top edge
- 3rd bit (value 2): Right edge
- 4th bit (LSB, value 1): Bottom edge

Example: "right,bottom" is binary 0011, which is 3 in decimal. Return only "3".
Example: "left,top,right" is binary 1110, which is 14 in decimal. Return only "14".

If you are unable to categorize the image or detect the lines, return a descriptive error message explaining why.
Otherwise, return ONLY the decimal number.`;
