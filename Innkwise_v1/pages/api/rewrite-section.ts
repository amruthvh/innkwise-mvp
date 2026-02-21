import type { NextApiRequest, NextApiResponse } from "next";
import { getOpenAIClient } from "@/lib/openai";
import { SYSTEM_PROMPT, buildRewritePrompt } from "@/lib/prompt";

type Body = {
  section: string;
  existingText: string;
  tone: string;
};

function isValidBody(body: unknown): body is Body {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.section === "string" &&
    typeof b.existingText === "string" &&
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
    const prompt = buildRewritePrompt(req.body.section, req.body.tone, req.body.existingText);

    const response = await getOpenAIClient().responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "rewrite_response",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              text: { type: "string" }
            },
            required: ["text"]
          },
          strict: true
        }
      }
    });

    const parsed = JSON.parse(response.output_text) as { text: string };
    return res.status(200).json({ text: parsed.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}
