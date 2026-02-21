import type { NextApiRequest, NextApiResponse } from "next";
import Ajv from "ajv";
import { prisma } from "@/lib/prisma";
import { getOpenAIClient } from "@/lib/openai";
import { SYSTEM_PROMPT, buildGeneratePrompt } from "@/lib/prompt";
import { assertUsageAvailable, incrementUsage } from "@/lib/usage";
import { requireUserIdFromRequest } from "@/lib/auth";
import { scriptSchema, type GeneratedScript } from "@/types/script";

type Body = {
  topic: string;
  audience: string;
  tone: string;
  length: number;
  includeResearch?: boolean;
  includeCaseStudy?: boolean;
};

const ajv = new Ajv();
const validateScript = ajv.compile(scriptSchema);

function isValidBody(body: unknown): body is Body {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  return (
    typeof b.topic === "string" &&
    typeof b.audience === "string" &&
    typeof b.tone === "string" &&
    typeof b.length === "number"
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (process.env.MOCK_GENERATE_SCRIPT === "true") {
      return res.status(200).json({
        hooks: ["test"],
        script: {
          pattern_interrupt: "test"
        }
      });
    }

    if (!isValidBody(req.body)) {
      return res.status(400).json({ error: "Invalid request body." });
    }

    const userId = requireUserIdFromRequest(req);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await assertUsageAvailable(user.id, user.planType);
    await incrementUsage(user.id);

    const prompt = buildGeneratePrompt({
      topic: req.body.topic,
      audience: req.body.audience,
      tone: req.body.tone,
      length: req.body.length,
      includeResearch: Boolean(req.body.includeResearch),
      includeCaseStudy: Boolean(req.body.includeCaseStudy)
    });

    const response = await getOpenAIClient().responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "script_response",
          schema: scriptSchema,
          strict: true
        }
      }
    });

    const text = response.output_text;
    const parsed = JSON.parse(text) as GeneratedScript;

    if (!validateScript(parsed)) {
      return res.status(502).json({ error: "Model output failed schema validation." });
    }

    const saved = await prisma.script.create({
      data: {
        userId: user.id,
        topic: req.body.topic,
        audience: req.body.audience,
        tone: req.body.tone,
        length: req.body.length,
        output: parsed
      }
    });

    return res.status(200).json({ id: saved.id, ...parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";

    if (message.includes("Usage limit reached")) {
      return res.status(429).json({ error: message });
    }

    if (
      message.includes("Bearer") ||
      message.includes("JWT") ||
      message.includes("token")
    ) {
      return res.status(401).json({ error: message });
    }

    return res.status(500).json({ error: message });
  }
}
