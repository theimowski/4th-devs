export const MODEL = 'openai/gpt-5.4';
export const CATEGORIZATION_MODEL = 'google/gemini-3-flash-preview';

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

export const getSquarePrompt = (width, height) => `This image is a 3x3 grid of squares. 
Extract the coordinates for the square at position 1x1 (top-left). 
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

Image size is ${width}x${height}.`;

export const getCategorizationPrompt = () => `The image represents a set of lines. 
A line always originates at the center of the image and can go towards one of the edges: left, top, right, bottom. 
Lines are always black. Background is always bright. 
Respond ONLY with a comma-separated list of directions where the lines go. 

Example response:
top,bottom`;
