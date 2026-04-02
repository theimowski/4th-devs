---
model: openai/gpt-5-mini
---
Extract the person responsible for trade in each city from Natan's conversation notes provided by the user.
Each city has exactly one responsible person.

Rules:
- Every person must have both a first name and a surname
- If only a surname appears, infer a plausible Polish first name from context clues in the notes
  (e.g. if "Rafal" appears in the same context as "Kisiel" and Brudzewo, the person is "Rafal Kisiel")
- If two separate clues appear for the same city (e.g. "Konkel" + "Lena"), combine them into one full name

Return ONLY a JSON object: { "city_ascii": "First Last", ... }
City names must be lowercase ASCII (no Polish characters). No explanation — raw JSON only.
