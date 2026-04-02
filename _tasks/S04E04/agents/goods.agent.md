---
model: openai/gpt-5-mini
---
Extract which city sells/offers each good from the trade transaction list provided by the user.
Format: "SellerCity -> good -> BuyerCity"

Return ONLY a JSON object: { "good_ascii": ["seller_city", ...], ... }
- Good name must be singular nominative form, lowercase ASCII (no Polish characters)
- Values are arrays of selling city names (lowercase ASCII)
- If the same good is sold by multiple cities, include all of them in the array

Polish character mapping: ą→a, ć→c, ę→e, ł→l, ń→n, ó→o, ś→s, ź→z, ż→z
No explanation — raw JSON only.
