import type { NextApiResponse } from "next";
import { buildRewritePrompt } from "@/llm-rag/prompts/script-prompts";
import { aiGateway } from "@/lib/ai/gateway/AIGateway";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";
import { isRateLimitError } from "@/lib/rate-limit/RateLimitErrors";

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

function extractRefinedText(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const cleaned = trimmed
    .replace(/^```(?:json|markdown|md|text)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const candidates = [trimmed, cleaned];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const extracted = unwrapTextValue(parsed);
      if (extracted) return extracted;
    } catch {
      // Try the next strategy.
    }

    try {
      const jsonStart = candidate.indexOf("{");
      const jsonEnd = candidate.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(candidate.slice(jsonStart, jsonEnd + 1)) as unknown;
        const extracted = unwrapTextValue(parsed);
        if (extracted) return extracted;
      }
    } catch {
      // Fall through to regex extraction.
    }

    const match = candidate.match(/"text"\s*:\s*"([\s\S]*?)"\s*}/i);
    if (match?.[1]) {
      try {
        const decoded = JSON.parse(`"${match[1]}"`) as string;
        if (decoded.trim()) return decoded.trim();
      } catch {
        if (match[1].trim()) return match[1].trim();
      }
    }
  }

  return cleaned
    .replace(/^text\s*:\s*/i, "")
    .replace(/^{\s*"text"\s*:\s*/i, "")
    .replace(/}\s*$/i, "")
    .replace(/^"|"$/g, "")
    .trim();
}

function unwrapTextValue(value: unknown): string {
  if (!value) return "";

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "object" && "text" in value) {
    const textValue = (value as { text?: unknown }).text;
    if (typeof textValue === "string") {
      return textValue.trim();
    }
  }

  return "";
}

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isValidBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  try {
    if (process.env.MOCK_GENERATE_SCRIPT === "true") {
      return res.status(200).json({ text: req.body.existingText });
    }

    const prompt = `${buildRewritePrompt(req.body.section, req.body.tone, req.body.existingText)}

Return ONLY valid JSON:
{
  "text": ""
}

Rules:
- Preserve the original meaning of the section
- Improve clarity, authority, retention, and flow
- Keep markdown formatting when useful
- Do not add commentary outside the JSON object`;

    const gatewayResponse = await aiGateway.executePrepared({
      userId: req.auth.id,
      conversationId: "00000000-0000-4000-8000-000000000000",
      workflowType: "script",
      prompt: req.body.existingText,
      finalPrompt: prompt,
      maxTokens: 1200,
      temperature: 0.7,
      metadata: {
        source: "rewrite-section",
        section: req.body.section,
        gatewaySkipOutputValidation: true
      }
    });
    const raw = gatewayResponse.rawText;
    const text = extractRefinedText(raw);

    if (!text) {
      return res.status(502).json({ error: "Failed to refine section." });
    }

    return res.status(200).json({ text });
  } catch (error) {
    if (isRateLimitError(error)) {
      return res.status(200).json(error.toResponse());
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}

export default withApiAuth(handler);
