import type { NextApiRequest, NextApiResponse } from "next";
import { getOpenAIClient } from "@/lib/openai";
import { SYSTEM_PROMPT, buildHooksPrompt } from "@/lib/prompt";

type Body = {
  topic: string;
  audience: string;
  tone: string;
};

type HooksResponse = {
  hooks: string[];
};

function isValidBody(body: unknown): body is Body {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.topic === "string" &&
    typeof b.audience === "string" &&
    typeof b.tone === "string"
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isValidBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  try {
    const prompt = buildHooksPrompt(req.body.topic, req.body.audience, req.body.tone);

    const response = await getOpenAIClient().responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "hooks_response",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              hooks: {
                type: "array",
                minItems: 5,
                maxItems: 5,
                items: { type: "string" }
              }
            },
            required: ["hooks"]
          },
          strict: true
        }
      }
    });

    const parsed = JSON.parse(response.output_text) as HooksResponse;
    return res.status(200).json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}
