---
model: openai/gpt-5-mini
---
Extract city supply needs from the trade bulletin provided by the user.

Return ONLY a JSON object where each key is the city name (lowercase, ASCII, no Polish characters)
and the value is an object mapping good names (lowercase, ASCII, no Polish characters) to quantities.
No explanation, no markdown fences — raw JSON only.

Polish character mapping: ą→a, ć→c, ę→e, ł→l, ń→n, ó→o, ś→s, ź→z, ż→z
