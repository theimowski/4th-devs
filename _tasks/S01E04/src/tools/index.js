import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";

const DOCS_DIR = path.join(import.meta.dirname, "../../docs");

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
        const text = await response.text();
        fs.writeFileSync(filePath, text);
        results.push({ url, status: "success", filename });
      } catch (error) {
        results.push({ url, status: "error", message: error.message });
      }
    }
    return results;
  }
};
