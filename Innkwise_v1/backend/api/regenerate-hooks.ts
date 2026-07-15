import type { NextApiResponse } from "next";
import { aiGateway } from "@/lib/ai/gateway/AIGateway";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";
import { isRateLimitError } from "@/lib/rate-limit/RateLimitErrors";

type Body = {
  topic: string;
  audience: string;
  tone: string;
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

function toHooksList(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { hooks?: unknown };
      if (Array.isArray(parsed.hooks)) {
        return parsed.hooks.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 5);
      }
    }
  } catch {
    // Fall through to line parsing.
  }

  return trimmed
    .split("\n")
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
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
      return res.status(200).json({
        hooks: [
          "You are one mindset shift away from total momentum.",
          "This mental model can change your next 90 days.",
          "Most people fail here. You do not have to.",
          "Use this 3-step reset when motivation drops.",
          "One decision today can fix your focus for weeks."
        ]
      });
    }

    const prompt = `
Return ONLY valid JSON:
{
  "hooks": []
}

Generate EXACTLY 3 high-retention hooks for a YouTube video.
Rules:
- Each hook under 20 words
- Punchy and curiosity-driven
- No emojis
- No hashtags

Topic: ${req.body.topic}
Audience: ${req.body.audience}
Tone: ${req.body.tone}
`;

    const gatewayResponse = await aiGateway.executePrepared({
      userId: req.auth.id,
      conversationId: "00000000-0000-4000-8000-000000000000",
      workflowType: "script",
      prompt: req.body.topic,
      finalPrompt: prompt,
      maxTokens: 400,
      temperature: 0.8,
      metadata: {
        source: "regenerate-hooks",
        gatewaySkipOutputValidation: true
      }
    });
    const raw = gatewayResponse.rawText;
    const hooks = toHooksList(raw);

    if (hooks.length === 0) {
      return res.status(502).json({ error: "Failed to generate hooks." });
    }

    return res.status(200).json({ hooks });
  } catch (error) {
    if (isRateLimitError(error)) {
      return res.status(200).json(error.toResponse());
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}

export default withApiAuth(handler);
