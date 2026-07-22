import type { NextApiResponse } from "next";
import { aiGateway } from "@/lib/ai/gateway/AIGateway";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";
import { isRateLimitError } from "@/lib/rate-limit/RateLimitErrors";
import { tokenBudgetEngine } from "@/lib/context/token-budget-engine";

const HF_IMAGE_MODEL = "stabilityai/stable-diffusion-2";

type ThumbnailIdea = {
  concept: string;
  text: string;
  visual_style: string;
  composition: string;
  image: string | null;
};

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

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
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

    const gatewayResponse = await aiGateway.executePrepared({
      userId: req.auth.id,
      conversationId: "00000000-0000-4000-8000-000000000000",
      workflowType: "production",
      prompt: topic,
      finalPrompt: ideaPrompt,
      maxTokens: tokenBudgetEngine.getOutputTokenBudget({
        workflow: "production",
        workflowId: "generate-thumbnail"
      }),
      temperature: 0.8,
      metadata: {
        source: "generate-thumbnail",
        gatewaySkipOutputValidation: true
      }
    });
    const raw = gatewayResponse.rawText;
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
    if (isRateLimitError(error)) {
      return res.status(200).json(error.toResponse());
    }
    console.error(error);
    return res.status(500).json({ error: "Thumbnail generation failed" });
  }
}

export default withApiAuth(handler);
