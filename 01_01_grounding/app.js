import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { paths, cli } from "./src/config.js";
import { splitParagraphs } from "./src/utils/text.js";
import { resolveMarkdownPath } from "./src/utils/file.js";
import { extractConcepts } from "./src/pipeline/extract.js";
import { dedupeConcepts } from "./src/pipeline/dedupe.js";
import { searchConcepts } from "./src/pipeline/search.js";
import { generateAndApplyTemplate } from "./src/pipeline/ground.js";

const main = async () => {
  const sourceFile = await resolveMarkdownPath(paths.notes, cli.inputFile);
  const markdown = await readFile(sourceFile, "utf8");
  const paragraphs = splitParagraphs(markdown);

  const baseName = path.basename(sourceFile, ".md");
  const groundedPath = path.join(paths.output, `grounded-${baseName}.html`);

  console.log(`\n📄 Source: ${sourceFile}`);
  console.log(`   Paragraphs: ${paragraphs.length}\n`);

  console.log("1. Extracting concepts...");
  const conceptsData = await extractConcepts(paragraphs, sourceFile);
  console.log(`   Total: ${conceptsData.conceptCount} concepts\n`);

  console.log("2. Deduplicating concepts...");
  const dedupeData = await dedupeConcepts(conceptsData);
  console.log(`   Groups: ${dedupeData.groups.length}\n`);

  console.log("3. Web search grounding...");
  const searchData = await searchConcepts(conceptsData, dedupeData);
  console.log(`   Results: ${Object.keys(searchData.resultsByCanonical).length}\n`);

  console.log("4. Generating HTML...");
  if (cli.force || !existsSync(groundedPath)) {
    await generateAndApplyTemplate(markdown, conceptsData, dedupeData, searchData, groundedPath);
    console.log(`   Created: ${groundedPath}\n`);
  } else {
    console.log(`   Skipped (exists, use --force to regenerate)\n`);
  }

  console.log("✅ Done! Output files:");
  console.log(`   ${paths.concepts}`);
  console.log(`   ${paths.dedupe}`);
  console.log(`   ${paths.search}`);
  console.log(`   ${groundedPath}`);
};

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
