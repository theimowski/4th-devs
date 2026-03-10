const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const DRY_RUN = false; // Set to true to only display the prompt without calling the API
const MODEL = "openai/gpt-5.2";
const USE_CALENDAR_YEAR_ONLY = true;
const filename = 'people.csv';
const key = process.env.HUB_AG3NTS_KEY;
const url = `https://hub.ag3nts.org/data/${key}/${filename}`;
const REFERENCE_DATE = new Date('2026-03-09');

const API_KEY = process.env.OR_AI_DEVS_4_API_KEY;
const OR_HOST = process.env.OR_HOST || 'openrouter.ai';
const ENDPOINT = `https://${OR_HOST}/api/v1/responses`;

const ALLOWED_TAGS = [
  'IT',
  'transport',
  'edukacja',
  'medycyna',
  'praca z ludźmi',
  'praca z pojazdami',
  'praca fizyczna'
];

const batchCategorySchema = {
  type: "json_schema",
  name: "batch_job_categorization",
  strict: true,
  schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            tags: {
              type: "array",
              items: { type: "string", enum: ALLOWED_TAGS }
            }
          },
          required: ["index", "tags"],
          additionalProperties: false
        }
      }
    },
    required: ["results"],
    additionalProperties: false
  }
};

async function categorizeBatch(jobs) {
  const jobsList = jobs.map((job, idx) => `ID: ${idx}\nOpis: ${job}`).join('\n\n---\n\n');
  const prompt = `Sklasyfikuj poniższą listę opisów stanowisk pracy do jednej lub więcej kategorii (tags).
Używaj wyłącznie kategorii z listy: ${ALLOWED_TAGS.join(', ')}.
Dla każdego ID zwróć listę pasujących kategorii.

Lista zadań:
---

${jobsList}`;

  if (DRY_RUN) {
    console.log('--- DRY RUN: PROMPT START ---');
    console.log(prompt);
    console.log('--- DRY RUN: PROMPT END ---');
    return jobs.map((_, idx) => ({ index: idx, tags: ['DRY_RUN'] }));
  }

  if (!API_KEY) {
    throw new Error('OR_AI_DEVS_4_API_KEY environment variable is not set');
  }

  const body = {
    model: MODEL,
    input: prompt,
    text: { format: batchCategorySchema }
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.output_text || data.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text;
  
  if (!text) {
    throw new Error('No output text in API response');
  }

  return JSON.parse(text).results;
}

(async () => {
  if (!fs.existsSync(filename)) {
    const res = await fetch(url);
    const text = await res.text();
    fs.writeFileSync(filename, text);
  }

  const content = fs.readFileSync(filename, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true
  });

  const filtered = records.filter(row => {
    const isMan = row.gender === 'M';
    const isFromGrudziadz = row.birthPlace === 'Grudziądz';
    
    let age;
    if (USE_CALENDAR_YEAR_ONLY) {
      const birthYear = parseInt(row.birthDate?.split('-')[0]);
      age = 2026 - birthYear;
    } else {
      const birthDate = new Date(row.birthDate);
      age = REFERENCE_DATE.getFullYear() - birthDate.getFullYear();
      const monthDiff = REFERENCE_DATE.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && REFERENCE_DATE.getDate() < birthDate.getDate())) {
        age--;
      }
    }

    const isAgeCorrect = age >= 20 && age <= 40;
    return isMan && isFromGrudziadz && isAgeCorrect;
  });

  // Intermediate step: save filtered entries
  fs.writeFileSync('filtered.csv', stringify(filtered, { header: true }));
  console.log(`Saved ${filtered.length} filtered records to filtered.csv`);

  const modelSafeName = MODEL.split('/').pop();
  const outputFilename = `tagged-${modelSafeName}.csv`;

  let finalRecords = filtered;

  if (fs.existsSync(outputFilename)) {
    console.log(`Results for model ${MODEL} already exist in ${outputFilename}. Skipping API call.`);
    const cachedContent = fs.readFileSync(outputFilename, 'utf-8');
    finalRecords = parse(cachedContent, { columns: true });
  } else if (filtered.length > 0) {
    try {
      const categorizationResults = await categorizeBatch(filtered.map(r => r.job));
      
      console.log('Categorization results:');
      console.log(JSON.stringify(categorizationResults, null, 2));
      
      categorizationResults.forEach(res => {
        if (filtered[res.index]) {
          filtered[res.index].tags = res.tags.join(', ');
        }
      });

      const output = stringify(filtered, { header: true });
      fs.writeFileSync(outputFilename, output);
      console.log(`Finished! Results saved to ${outputFilename} ${DRY_RUN ? '(DRY RUN mode)' : ''}`);
      finalRecords = filtered;
    } catch (error) {
      console.error('Categorization failed:', error.message);
      filtered.forEach(r => r.tags = 'ERROR');
      finalRecords = filtered;
    }
  }

  // Create results.json in requested format
  const resultsJson = finalRecords
    .filter(r => {
      const tags = r.tags ? r.tags.split(', ').map(t => t.trim()) : [];
      return tags.includes('transport');
    })
    .map(r => ({
      name: r.name,
      surname: r.surname,
      gender: r.gender,
      born: parseInt(r.birthDate?.split('-')[0]),
      city: r.birthPlace,
      tags: r.tags ? r.tags.split(', ').filter(t => t) : []
    }));

  fs.writeFileSync('results.json', JSON.stringify(resultsJson, null, 2));
  console.log(`Final results (${resultsJson.length} people with 'transport' tag) saved to results.json`);

  // Final verification step
  const verifyUrl = 'https://hub.ag3nts.org/verify';
  const verifyPayload = {
    apikey: key,
    task: "people",
    answer: resultsJson
  };

  console.log(`Sending verification to ${verifyUrl}...`);
  const verifyResponse = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(verifyPayload)
  });

  const verifyData = await verifyResponse.json();
  console.log(`Verification Status: ${verifyResponse.status}`);
  console.log('Verification Response:', JSON.stringify(verifyData, null, 2));
})();
