import type { NextApiRequest, NextApiResponse } from "next";
import Ajv from "ajv";
import { saveScript } from "@/lib/storage";

type Body = {
  topic: string;
  audience: string;
  tone: string;
  length: number;
  videoType?: "long" | "long_form" | "shorts";
  includeResearch?: boolean;
  includeCaseStudy?: boolean;
};

type LongFormScript = {
  hooks: string[];
  title_suggestions: string[];
  script_timeline: Array<{
    time_range: string;
    section_title: string;
    content: string;
  }>;
};

type ShortsScript = {
  hook: string;
  pattern_interrupt: string;
  main_script: string;
  cta: string;
};

const longFormSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hooks: {
      type: "array",
      items: { type: "string" }
    },
    title_suggestions: {
      type: "array",
      items: { type: "string" }
    },
    script_timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          time_range: { type: "string" },
          section_title: { type: "string" },
          content: { type: "string" }
        },
        required: ["time_range", "section_title", "content"]
      }
    }
  },
  required: ["hooks", "title_suggestions", "script_timeline"]
} as const;

const shortsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hook: { type: "string" },
    pattern_interrupt: { type: "string" },
    main_script: { type: "string" },
    cta: { type: "string" }
  },
  required: ["hook", "pattern_interrupt", "main_script", "cta"]
} as const;

const ajv = new Ajv();
const validateLongForm = ajv.compile(longFormSchema);
const validateShorts = ajv.compile(shortsSchema);

function buildTimeline(length: number) {
  if (length === 15) {
    return `
0:00-0:45 Hook + Pattern Interrupt
0:45-3:00 Problem Setup
3:00-7:00 Psychological Explanation
7:00-11:00 Case Study / Real Scenario
11:00-14:00 Practical Framework
14:00-15:00 CTA + Engagement Trigger
`;
  }

  if (length === 12) {
    return `
0:00-0:40 Hook + Pattern Interrupt
0:40-2:30 Problem Setup
2:30-6:30 Psychological Breakdown
6:30-9:30 Case Study
9:30-11:30 Practical Framework
11:30-12:00 CTA
`;
  }

  if (length === 8) {
    return `
0:00-0:30 Hook + Pattern Interrupt
0:30-2:00 Problem Setup
2:00-5:00 Core Psychological Insight
5:00-7:00 Practical Application
7:00-8:00 CTA
`;
  }

  return `
0:00-0:30 Hook + Pattern Interrupt
0:30-2:00 Core Insight
2:00-4:00 Application
4:00-End CTA
`;
}

function buildResearchRule(includeResearch?: boolean) {
  if (includeResearch) {
    return "- Include 2-4 research-backed points with concrete stats and named studies or institutions.";
  }
  return "- Do not include research stats, study citations, or institution references.";
}

function buildCaseStudyRule(includeCaseStudy?: boolean) {
  if (includeCaseStudy) {
    return "- Include at least one realistic case study example with context, action, and outcome.";
  }
  return "- Do not include case study narratives or detailed scenario examples.";
}

function buildContentToggleRules(includeResearch?: boolean, includeCaseStudy?: boolean) {
  return `
CONTENT TOGGLE RULES:
- Keep the exact same formatting style from STRICT RULES above.
${buildResearchRule(includeResearch)}
${buildCaseStudyRule(includeCaseStudy)}
`;
}

async function callHuggingFace(prompt: string, maxTokens: number) {
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
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: maxTokens
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

function toStringList(value: unknown): string[] {
  const unwrapStructuredString = (raw: string): string => {
    const trimmed = raw.trim();
    if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) return raw;

    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const preferredKeys = [
        "hook_content",
        "title_suggestion",
        "text",
        "content",
        "hook",
        "title"
      ];

      for (const key of preferredKeys) {
        if (typeof obj[key] === "string") return obj[key] as string;
      }
    } catch {
      return raw;
    }

    return raw;
  };

  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return unwrapStructuredString(item);
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (typeof obj.hook_content === "string") return obj.hook_content;
      if (typeof obj.title_suggestion === "string") return obj.title_suggestion;
      if (typeof obj.text === "string") return obj.text;
      if (typeof obj.content === "string") return obj.content;
      if (typeof obj.hook === "string") return obj.hook;
      if (typeof obj.title === "string") return obj.title;
      return JSON.stringify(obj);
    }
    return String(item ?? "");
  });
}

function normalizeLongForm(input: unknown): LongFormScript {
  const data = (input ?? {}) as Record<string, unknown>;
  const rawTimeline = Array.isArray(data.script_timeline) ? data.script_timeline : [];

  const script_timeline = rawTimeline.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      time_range: String(row.time_range ?? ""),
      section_title: String(row.section_title ?? ""),
      content: String(row.content ?? "")
    };
  });

  return {
    hooks: toStringList(data.hooks),
    title_suggestions: toStringList(data.title_suggestions),
    script_timeline
  };
}

async function ensureHooksAndTitles(
  payload: LongFormScript,
  topic: string,
  audience: string,
  tone: string
): Promise<LongFormScript> {
  const hooks = payload.hooks.filter((x) => x.trim().length > 0).slice(0, 3);
  const titleSuggestions = payload.title_suggestions
    .filter((x) => x.trim().length > 0)
    .slice(0, 3);

  if (hooks.length === 3 && titleSuggestions.length === 3) {
    return payload;
  }

  const fillPrompt = `
Return ONLY valid JSON:
{
  "hooks": [],
  "title_suggestions": []
}

Generate EXACTLY 3 high-retention hooks and EXACTLY 3 title suggestions.
Hooks under 20 words. Titles under 12 words.

Topic: ${topic}
Audience: ${audience}
Tone: ${tone}
`;

  try {
    const raw = await callHuggingFace(fillPrompt, 500);
    const parsed = JSON.parse(cleanJsonString(extractJsonBlock(raw))) as {
      hooks?: unknown;
      title_suggestions?: unknown;
    };

    const mergedHooks = [...hooks, ...toStringList(parsed.hooks)]
      .filter((x) => x.trim().length > 0)
      .slice(0, 3);
    const mergedTitles = [...titleSuggestions, ...toStringList(parsed.title_suggestions)]
      .filter((x) => x.trim().length > 0)
      .slice(0, 3);

    return {
      ...payload,
      hooks: mergedHooks,
      title_suggestions: mergedTitles
    };
  } catch {
    return {
      ...payload,
      hooks,
      title_suggestions: titleSuggestions
    };
  }
}

function normalizeShorts(input: unknown): ShortsScript {
  const data = (input ?? {}) as Record<string, unknown>;
  return {
    hook: String(data.hook ?? ""),
    pattern_interrupt: String(data.pattern_interrupt ?? ""),
    main_script: String(data.main_script ?? ""),
    cta: String(data.cta ?? "")
  };
}

async function parseOrRepairLongForm(rawText: string): Promise<LongFormScript> {
  let candidate = "";
  try {
    candidate = cleanJsonString(extractJsonBlock(rawText));
    const parsed = JSON.parse(candidate) as LongFormScript;
    if (validateLongForm(parsed)) return parsed;
    return normalizeLongForm(parsed);
  } catch {
    candidate = rawText;
  }

  const repairPrompt = `Fix this into valid JSON only, no commentary, preserving meaning:\n\n${candidate}`;

  try {
    const repaired = await callHuggingFace(repairPrompt, 3000);
    const repairedCandidate = cleanJsonString(extractJsonBlock(repaired));
    const repairedParsed = JSON.parse(repairedCandidate) as LongFormScript;
    if (validateLongForm(repairedParsed)) return repairedParsed;
    return normalizeLongForm(repairedParsed);
  } catch {
    return normalizeLongForm({});
  }
}

async function parseOrRepairShorts(rawText: string): Promise<ShortsScript> {
  let candidate = "";
  try {
    candidate = cleanJsonString(extractJsonBlock(rawText));
    const parsed = JSON.parse(candidate) as ShortsScript;
    if (validateShorts(parsed)) return parsed;
    return normalizeShorts(parsed);
  } catch {
    candidate = rawText;
  }

  const repairPrompt = `Fix this into valid JSON only, no commentary, preserving meaning:\n\n${candidate}`;

  try {
    const repaired = await callHuggingFace(repairPrompt, 800);
    const repairedCandidate = cleanJsonString(extractJsonBlock(repaired));
    const repairedParsed = JSON.parse(repairedCandidate) as ShortsScript;
    if (validateShorts(repairedParsed)) return repairedParsed;
    return normalizeShorts(repairedParsed);
  } catch {
    return normalizeShorts({});
  }
}

function isValidBody(body: unknown): body is Body {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  const hasValidVideoType =
    b.videoType === undefined ||
    b.videoType === "long" ||
    b.videoType === "long_form" ||
    b.videoType === "shorts";

  return (
    typeof b.topic === "string" &&
    typeof b.audience === "string" &&
    typeof b.tone === "string" &&
    typeof b.length === "number" &&
    hasValidVideoType
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!isValidBody(req.body)) {
      return res.status(400).json({ error: "Invalid request body." });
    }

    const isShorts = req.body.videoType === "shorts";

    if (process.env.MOCK_GENERATE_SCRIPT === "true") {
      if (isShorts) {
        return res.status(200).json({
          hook: "Stop scrolling. This one idea changes your output.",
          pattern_interrupt: "Pause. Write one task. Set 15 minutes. Start now.",
          main_script: "Clarity beats motivation. One focused action creates momentum.",
          cta: "Comment 'focus' if you are doing this today."
        });
      }

      return res.status(200).json({
        hooks: ["test"],
        title_suggestions: ["test title"],
        script_timeline: [
          {
            time_range: "0:00-0:30",
            section_title: "Hook + Pattern Interrupt",
            content: "test timeline content"
          }
        ]
      });
    }

    if (isShorts) {
      const prompt = `
You are a viral YouTube Shorts scriptwriter.

Return ONLY valid JSON:

{
  "hook": "",
  "pattern_interrupt": "",
  "main_script": "",
  "cta": ""
}

STRICT RULES:
- Total length must fit within 45-60 seconds spoken
- High energy
- Fast pacing
- Short punchy sentences
- Strong pattern interrupt
- Clear CTA
- No filler language
- Use bullet points when listing steps, tips, or examples
- Use Markdown formatting in all text fields
- Use **bold** for mini headings when needed
- Add clear line breaks between ideas
- Do not separate ideas with commas
- Do NOT output HTML tags like <h1>, <h2>, <p>, <ul>, <li>, <br>, or <div>
${buildContentToggleRules(req.body.includeResearch, req.body.includeCaseStudy)}

Topic: ${req.body.topic}
Audience: ${req.body.audience}
Tone: ${req.body.tone}
`;

      const raw = await callHuggingFace(prompt, 800);
      const parsed = await parseOrRepairShorts(raw);

      saveScript({
        topic: req.body.topic,
        audience: req.body.audience,
        tone: req.body.tone,
        length: req.body.length,
        videoType: "shorts",
        output: parsed
      });

      return res.status(200).json(parsed);
    }

    const timeline = buildTimeline(req.body.length);

    const prompt = `
You are a professional YouTube scriptwriter.

Generate a COMPLETE ${req.body.length}-minute script.

Return ONLY valid JSON in this format:

{
  "hooks": [],
  "title_suggestions": [],
  "script_timeline": [
    {
      "time_range": "",
      "section_title": "",
      "content": ""
    }
  ]
}

STRICT RULES:
- Generate EXACTLY 3 hooks
- Generate EXACTLY 3 title_suggestions
- Each timeline section must contain 250-400 words
- Include a strong Pattern Interrupt in the opening section
- Make the script natural for voiceover
- Complete ALL sections fully
- Prefer bullet points for frameworks, steps, tactics, examples, and takeaways
- Avoid long unbroken paragraphs when list-style formatting is clearer
- Use Markdown formatting in every "content" field
- Use **bold** headings for sub-sections
- Use "-" for bullet lists and numbered lists for sequences
- Add blank lines between paragraphs
- Do not use commas as section separators
- Do NOT output HTML tags like <h1>, <h2>, <p>, <ul>, <li>, <br>, or <div>
${buildContentToggleRules(req.body.includeResearch, req.body.includeCaseStudy)}

Timeline Structure:
${timeline}

Topic: ${req.body.topic}
Audience: ${req.body.audience}
Tone: ${req.body.tone}
`;

    const raw = await callHuggingFace(prompt, 3000);
    const parsed = await parseOrRepairLongForm(raw);
    const enriched = await ensureHooksAndTitles(
      parsed,
      req.body.topic,
      req.body.audience,
      req.body.tone
    );

    saveScript({
      topic: req.body.topic,
      audience: req.body.audience,
      tone: req.body.tone,
      length: req.body.length,
      videoType: "long",
      output: enriched
    });

    return res.status(200).json(enriched);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}
