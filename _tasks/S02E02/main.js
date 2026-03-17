import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fetchHubFile } from '../utils/utils.js';
import { AI_API_KEY, EXTRA_API_HEADERS, RESPONSES_API_ENDPOINT } from '../../config.js';

const __dirname = import.meta.dirname;
const inputPath = path.join(__dirname, 'electricity.png');
const MODEL = 'openai/gpt-5.4';
const outputPath = path.join(__dirname, `electricity-grid.png`);

async function extractText(data) {
    if (typeof data?.output_text === "string" && data.output_text.trim()) {
        return data.output_text;
    }
    const messages = Array.isArray(data?.output) ? data.output.filter((item) => item?.type === "message") : [];
    const textPart = messages
        .flatMap((message) => (Array.isArray(message?.content) ? message.content : []))
        .find((part) => part?.type === "output_text" && typeof part?.text === "string");
    return textPart?.text ?? "";
}

async function run() {
    if (!fs.existsSync(inputPath)) {
        console.log("Fetching electricity.png...");
        await fetchHubFile('electricity.png', __dirname);
    }

    const imageBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(imageBuffer).metadata();
    const base64Image = imageBuffer.toString('base64');

    console.log(`Calling vision model: ${MODEL}...`);
    
    const prompt = `Find the 3x3 grid in the image. The grid has black framing and consists of a 3x3 grid of squares. 
Note that each square in the grid contains black lines which are thicker than the framing of the grid itself. Do not confuse the thicker lines inside the squares with the thinner grid framing.
Extract the coordinates for the entire 3x3 grid. The bounding box returned should have the black framing at its edges, i.e. there should be as many black pixels at every edge (top, bottom, left, right) as possible.
Return ONLY a JSON object with the following keys: ymin, xmin, ymax, xmax. The coordinates should be in pixels.
Image size is ${ metadata.width }x${ metadata.height }.
IMPORTANT: ymax and xmax MUST be within the bounds of the original image (ymax <= ${ metadata.height }, xmax <= ${ metadata.width }).

Example response:
{
  "ymin": 100,
  "xmin": 150,
  "ymax": 200,
  "xmax": 250
}`;

    const response = await fetch(RESPONSES_API_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AI_API_KEY}`,
            ...EXTRA_API_HEADERS
        },
        body: JSON.stringify({
            model: MODEL,
            input: [
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: prompt },
                        { type: "input_image", image_url: `data:image/png;base64,${base64Image}` }
                    ]
                }
            ]
        })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`API Error: ${JSON.stringify(data)}`);

    const resultText = await extractText(data);
    console.log("Model response:", resultText);

    const match = resultText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found in response");
    
    const coords = JSON.parse(match[0]);
    console.log("Coordinates:", coords);

    const top = Math.max(0, Math.round(coords.ymin));
    const left = Math.max(0, Math.round(coords.xmin));
    const width = Math.min(metadata.width - left, Math.round(coords.xmax - coords.xmin));
    const height = Math.min(metadata.height - top, Math.round(coords.ymax - coords.ymin));

    console.log(`Cropping: top=${top}, left=${left}, width=${width}, height=${height}`);

    await sharp(inputPath)
        .extract({ left, top, width, height })
        .toFile(outputPath);

    console.log(`Saved crop to ${outputPath}`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
