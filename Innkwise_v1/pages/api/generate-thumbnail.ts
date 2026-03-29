import type { NextApiRequest, NextApiResponse } from "next";

const HF_TEXT_MODEL = "meta-llama/Llama-3.1-8B-Instruct";
const HF_IMAGE_MODEL = "stabilityai/stable-diffusion-2";

type ThumbnailIdea = {
  concept: string;
  text: string;
  visual_style: string;
  composition: string;
  image: string | null;
};

async function generateThumbnailIdeas(prompt: string) {
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.HF_MODEL ?? HF_TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 600
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "Thumbnail idea generation failed.");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? "";
}

function parseThumbnailIdea(raw: string) {
  const trimmed = raw.trim();

  try {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}") + 1;
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd)) as {
        concept?: unknown;
        text?: unknown;
        visual_style?: unknown;
        composition?: unknown;
      };
    }
  } catch {
    // Fall through to a best-effort structured fallback.
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const takeValue = (label: string) => {
    const match = lines.find((line) => line.toLowerCase().startsWith(`${label}:`));
    return match ? match.slice(label.length + 1).trim() : "";
  };

  return {
    concept: takeValue("concept") || lines[0] || "High-contrast creator reaction thumbnail",
    text: takeValue("text") || "Watch This",
    visual_style: takeValue("visual_style") || takeValue("style") || "Bold, high-contrast, cinematic",
    composition:
      takeValue("composition") ||
      "Close-up subject on one side, large text on the other, strong contrast background"
  };
}

async function generateImage(prompt: string) {
  const res = await fetch(`https://api-inference.huggingface.co/models/${HF_IMAGE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: prompt
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "Thumbnail image generation failed.");
  }

  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  return `data:image/png;base64,${base64}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
    if (!topic) {
      return res.status(400).json({ error: "Topic is required." });
    }

    const ideaPrompt = `
Generate a YouTube thumbnail concept.

Return ONLY valid JSON:

{
  "concept": "",
  "text": "",
  "visual_style": "",
  "composition": ""
}

STRICT RULES:
- Text must be 2-5 words
- High curiosity / emotional trigger
- Visual must be dramatic and clickable

Topic: ${topic}
`;

    const raw = await generateThumbnailIdeas(ideaPrompt);
    const parsedRaw = parseThumbnailIdea(raw);
    const parsed: Omit<ThumbnailIdea, "image"> = {
      concept: String(parsedRaw.concept ?? "").trim(),
      text: String(parsedRaw.text ?? "").trim(),
      visual_style: String(parsedRaw.visual_style ?? "").trim(),
      composition: String(parsedRaw.composition ?? "").trim()
    };

    const imagePrompt = `
YouTube thumbnail, ${parsed.concept},
bold, high contrast, cinematic lighting,
dramatic expression, ultra realistic,
4k, highly detailed
`;

    let image: string | null = null;

    try {
      image = await generateImage(imagePrompt);
    } catch {
      console.log("Image generation failed");
    }

    return res.status(200).json({
      ...parsed,
      image
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Thumbnail generation failed" });
  }
}
