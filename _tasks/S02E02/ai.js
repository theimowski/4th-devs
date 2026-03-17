import { AI_API_KEY, EXTRA_API_HEADERS, RESPONSES_API_ENDPOINT } from '../../config.js';

export function extractText(data) {
    if (typeof data?.output_text === "string" && data.output_text.trim()) {
        return data.output_text;
    }
    const messages = Array.isArray(data?.output) ? data.output.filter((item) => item?.type === "message") : [];
    const textPart = messages
        .flatMap((message) => (Array.isArray(message?.content) ? message.content : []))
        .find((part) => part?.type === "output_text" && typeof part?.text === "string");
    return textPart?.text ?? "";
}

export async function vision(model, prompt, base64Image) {
    const response = await fetch(RESPONSES_API_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AI_API_KEY}`,
            ...EXTRA_API_HEADERS
        },
        body: JSON.stringify({
            model: model,
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
    return data;
}
