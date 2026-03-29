import type { NextApiRequest, NextApiResponse } from "next";
import { getOpenAIClient } from "@/lib/openai";
import { buildRewritePrompt } from "@/lib/prompt";

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

function extractJsonBlock(text: string): string {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}") + 1;

  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error("Model response did not contain a JSON object.");
  }

  return text.slice(jsonStart, jsonEnd);
}

function cleanJsonString(jsonString: string): string {
  return jsonString
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u0000-\u001F]+/g, " ")
    .trim();
}

function extractRefinedText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(cleanJsonString(extractJsonBlock(trimmed))) as {
      text?: unknown;
      content?: unknown;
    };

    if (typeof parsed.text === "string" && parsed.text.trim()) {
      return parsed.text.trim();
    }

    if (typeof parsed.content === "string" && parsed.content.trim()) {
      return parsed.content.trim();
    }
  } catch {
    // Fall through to plain-text cleanup.
  }

  return trimmed
    .replace(/^```(?:json|text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function callHuggingFace(prompt: string): Promise<string> {
  const token = process.env.HF_API_TOKEN;
  if (!token) {
    throw new Error("HF_API_TOKEN is missing.");
  }

  const model = process.env.HF_MODEL ?? "meta-llama/Llama-3.1-8B-Instruct";
  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Return valid JSON only in the format {\"text\":\"...\"} with no extra commentary."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 1200
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Hugging Face request failed.");
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? "";
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
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

    if (hasOpenAIKey) {
      const response = await getOpenAIClient().responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: "Return valid JSON matching the requested schema. Do not include extra commentary."
          },
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
    }

    const raw = await callHuggingFace(prompt);
    const text = extractRefinedText(raw);

    if (!text) {
      throw new Error("Refine response was empty.");
    }

    return res.status(200).json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}
