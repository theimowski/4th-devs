import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";
import { 
  AI_API_KEY, 
  EXTRA_API_HEADERS, 
  RESPONSES_API_ENDPOINT 
} from "../../../../config.js";

const DOCS_DIR = path.join(import.meta.dirname, "../../docs");

const getMimeType = (filepath) => {
  const ext = path.extname(filepath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp"
  };
  return mimeTypes[ext] || "image/jpeg";
};

async function vision({ imageBase64, mimeType, question }) {
  const response = await fetch(RESPONSES_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
      ...EXTRA_API_HEADERS
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: question },
            { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}` }
          ]
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data?.error?.message || `Vision request failed (${response.status})`);
  }

  const message = data.output.find((item) => item.type === "message");
  return message?.content?.[0]?.text ?? "No response";
}

export const nativeTools = [
  {
    type: "function",
    name: "download_files",
    description: "Downloads one or more files from the provided URLs to the local 'docs' directory. Skips existing files.",
    parameters: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          description: "Array of absolute URLs to download"
        }
      },
      required: ["urls"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "understand_image",
    description: "Analyze an image in the 'docs' directory and answer questions about it. Use this to identify content in images.",
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Filename of the image in the 'docs' directory (e.g., 'photo.jpg')"
        },
        question: {
          type: "string",
          description: "Question to ask about the image"
        }
      },
      required: ["filename", "question"],
      additionalProperties: false
    },
    strict: true
  }
];

export const nativeHandlers = {
  async download_files({ urls }) {
    console.log(`[Tool] Downloading ${urls.length} files...`);
    const results = [];

    if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

    for (const url of urls) {
      const filename = path.basename(new URL(url).pathname);
      const filePath = path.join(DOCS_DIR, filename);

      if (fs.existsSync(filePath)) {
        results.push({ url, status: "skipped", message: "File already exists" });
        continue;
      }

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));
        results.push({ url, status: "success", filename });
      } catch (error) {
        results.push({ url, status: "error", message: error.message });
      }
    }
    return results;
  },

  async understand_image({ filename, question }) {
    console.log(`[Tool] Analyzing image ${filename}...`);
    const filePath = path.join(DOCS_DIR, filename);

    try {
      const imageBuffer = fs.readFileSync(filePath);
      const imageBase64 = imageBuffer.toString("base64");
      const mimeType = getMimeType(filename);

      const answer = await vision({
        imageBase64,
        mimeType,
        question
      });

      return { answer, filename };
    } catch (error) {
      console.error(`[Tool] Vision error for ${filename}:`, error.message);
      return { error: error.message, filename };
    }
  }
};
