import type { NextApiResponse } from "next";
import Ajv from "ajv";
import {
  chatService,
  type ChatServiceClarificationTurn,
  type ChatServiceReadyTurn
} from "@/backend/chat/chat-service";
import { advisorLayer } from "@/lib/advisor/advisor-layer";
import { toCreatorUserId } from "@/backend/auth/identifiers";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";
import { verifyConversationOwnership } from "@/lib/auth/authorization";
import { isApiError } from "@/lib/auth/errors";
import { GatewayError } from "@/lib/ai/gateway/GatewayErrors";
import { tokenBudgetEngine } from "@/lib/context/token-budget-engine";
import { TimingTracker } from "@/lib/observability/timing";
import { responseFormatter } from "@/lib/formatting/response-formatter";
import { isRateLimitError } from "@/lib/rate-limit/RateLimitErrors";
import { inputValidator } from "@/lib/validation/InputValidator";
import { isInputValidationError } from "@/lib/validation/ValidationErrors";
import { getWorkflowTemplate, workflowTemplates, type WorkflowId } from "@/lib/workflows/registry";
import type { JsonObject } from "@/shared/types/creator-os";

type Body = {
  topic: string;
  audience: string;
  tone: string;
  length: number;
  videoType?: "long" | "long_form" | "shorts";
  includeResearch?: boolean;
  includeCaseStudy?: boolean;
  workflowId?: WorkflowId;
  conversationId?: string | null;
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

type WorkflowOutput = {
  conversation_id?: string;
  advisor_markdown?: string;
  clarification?: {
    completenessScore: number;
    missingFields: string[];
    shouldAskQuestions: boolean;
  };
  workflow_output: {
    workflow_id: WorkflowId;
    workflow_title: string;
    summary: string;
    sections: Array<{
      title: string;
      content: string;
      items?: string[];
    }>;
    next_steps?: string[];
    recommended_workflows?: Array<{
      workflow_id: WorkflowId;
      title: string;
      reason: string;
    }>;
  };
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

function compactWorkflowDepthGuidance(workflowId: WorkflowId) {
  if (workflowId === "research-topic") {
    return [
      "Create 5 sections: Topic Overview, Key Findings, Audience Questions and Misconceptions, Evidence and Caveats, Creator Content Angles.",
      "Include 5-8 specific findings, 5 audience questions or misconceptions, clear caveats, and 5-7 creator angles.",
      "Do not fabricate citations, statistics, experts, or institutions."
    ].join("\n");
  }

  if (workflowId === "content-strategy") {
    return [
      "Create 5 sections: Strategic objective, Content pillars, Angle map, Publishing cadence, Measurement plan.",
      "Include 4-6 pillars, 8-12 specific angles, a weekly cadence, and clear measurement signals.",
      "Make concrete recommendations and tradeoffs for this creator, audience, platform, and goal."
    ].join("\n");
  }

  if (workflowId === "production-kit") {
    return [
      "Create 5 sections: Shot list, Scene notes, Asset checklist, Thumbnail direction, Editing plan.",
      "Include 8-15 sequenced shots, practical scene direction, required assets, 3 thumbnail concepts, and editing notes.",
      "Make the plan executable for a creator or editor."
    ].join("\n");
  }

  if (workflowId === "posting-strategy") {
    return [
      "Create 5 sections: Primary post package, Repurposing plan, Captions and titles, Posting sequence, Metrics to watch.",
      "Include platform-native packaging, 5-8 derivatives, 5 title options, 3 caption approaches, and iteration rules.",
      "Make the plan specific to the platform and objective."
    ].join("\n");
  }

  return "Make the response specific, actionable, and easy to scan.";
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

function cleanAssistantMarkdown(text: string): string {
  return text
    .replace(/^```(?:markdown|md|json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().replace(/^["']+/, "").toLowerCase();
      return !(
        normalized.startsWith("workflow_id:")
        || normalized.startsWith("workflow title:")
        || normalized.startsWith("workflow_title:")
        || normalized === "workflow output"
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tryParseJsonObjectFromText(text: string): unknown | null {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}") + 1;
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null;

  try {
    return JSON.parse(cleanJsonString(text.slice(jsonStart, jsonEnd)));
  } catch {
    return null;
  }
}

function hasWorkflowJsonText(value: string) {
  return /"workflow_output"|"workflow_id"|"workflow_title"/i.test(value);
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

  const fallbackHooks = [
    `Most ${audience.toLowerCase()} misunderstand ${topic}.`,
    `Here is the ${tone.toLowerCase()} truth about ${topic}.`,
    `If ${topic} matters to you, watch this first.`
  ];
  const fallbackTitles = [
    `${topic}: The Creator Breakdown`,
    `The Smart Way to Understand ${topic}`,
    `${topic} Explained Simply`
  ];

  return {
    ...payload,
    hooks: [...hooks, ...fallbackHooks].filter((x) => x.trim().length > 0).slice(0, 3),
    title_suggestions: [...titleSuggestions, ...fallbackTitles].filter((x) => x.trim().length > 0).slice(0, 3)
  };
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

function normalizeWorkflowOutput(input: unknown, template: ReturnType<typeof getWorkflowTemplate>): WorkflowOutput {
  const data = (input ?? {}) as Record<string, unknown>;
  if (!data.workflow_output && typeof input === "string" && hasWorkflowJsonText(input)) {
    const embedded = tryParseJsonObjectFromText(input);
    if (embedded) return normalizeWorkflowOutput(embedded, template);
  }

  const rawOutput = (data.workflow_output ?? data) as Record<string, unknown>;
  const rawSummary = String(rawOutput.summary ?? "");
  if (hasWorkflowJsonText(rawSummary)) {
    const embedded = tryParseJsonObjectFromText(rawSummary);
    if (embedded) return normalizeWorkflowOutput(embedded, template);
  }

  const summary = cleanAssistantMarkdown(rawSummary);
  const rawSections = Array.isArray(rawOutput.sections) ? rawOutput.sections : [];
  const sections = rawSections.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const content = cleanAssistantMarkdown(String(row.content ?? ""));
    return {
      title: String(row.title ?? template.outputStructure[index] ?? `Section ${index + 1}`),
      content: hasWorkflowJsonText(content) ? "" : content,
      items: Array.isArray(row.items) ? row.items.map((entry) => String(entry ?? "")).filter(Boolean) : undefined
    };
  }).filter((section) => section.title.trim() || section.content.trim() || section.items?.length);

  if (!sections.length && !summary.trim()) {
    sections.push(...template.outputStructure.map((title) => ({
      title,
      content: "No structured details were returned. Try asking Innkwise to expand this answer.",
      items: undefined
    })));
  }

  return {
    workflow_output: {
      workflow_id: template.id,
      workflow_title: template.title,
      summary,
      sections,
      next_steps: [],
      recommended_workflows: []
    }
  };
}

function buildAdvisorMarkdown(input: {
  generation: ChatServiceReadyTurn;
  userMessage: string;
  rawOutput: unknown;
}) {
  const advised = advisorLayer.transform({
    workflow: input.generation.workflow,
    userMessage: input.userMessage,
    rawOutput: input.rawOutput
  });
  const formatted = responseFormatter.format(advised);
  const acknowledgement = input.generation.memoryDetection.acknowledgement;
  return acknowledgement ? `${acknowledgement}\n\n${formatted}` : formatted;
}

function buildStoredAssistantMessage(input: {
  type: "text" | "workflow";
  workflowType: ChatServiceReadyTurn["workflow"] | ChatServiceClarificationTurn["workflow"];
  content: string;
  result: JsonObject;
}) {
  return {
    role: "assistant",
    type: input.type,
    workflowType: input.workflowType,
    content: input.content,
    result: input.result
  } as JsonObject;
}

async function buildClarificationPayload(input: {
  generation: ChatServiceClarificationTurn;
  template: ReturnType<typeof getWorkflowTemplate>;
  metadata: JsonObject;
}) {
  const payload: WorkflowOutput = {
    conversation_id: input.generation.conversationId,
    advisor_markdown: input.generation.clarification.response,
    clarification: {
      completenessScore: input.generation.clarification.evaluation.completenessScore,
      missingFields: input.generation.clarification.evaluation.missingFields,
      shouldAskQuestions: true
    },
    workflow_output: {
      workflow_id: input.template.id,
      workflow_title: input.template.title,
      summary: input.generation.clarification.response,
      sections: [],
      next_steps: [],
      recommended_workflows: []
    }
  };

  await chatService.finishTurn({
    userId: input.generation.userId,
    conversationId: input.generation.conversationId,
    assistantContent: input.generation.clarification.response,
    assistantJson: buildStoredAssistantMessage({
      type: "text",
      workflowType: input.generation.workflow,
      content: input.generation.clarification.response,
      result: payload as unknown as JsonObject
    }),
    metadata: {
      ...input.metadata,
      responseType: "clarification",
      completenessScore: input.generation.clarification.evaluation.completenessScore
    }
  });

  return payload;
}

async function parseOrRepairWorkflowOutput(rawText: string, template: ReturnType<typeof getWorkflowTemplate>): Promise<WorkflowOutput> {
  try {
    const candidate = cleanJsonString(extractJsonBlock(rawText));
    return normalizeWorkflowOutput(JSON.parse(candidate), template);
  } catch {
    if (hasWorkflowJsonText(rawText)) {
      const embedded = tryParseJsonObjectFromText(rawText);
      if (embedded) return normalizeWorkflowOutput(embedded, template);
    }
    return normalizeWorkflowOutput(markdownToWorkflowOutput(rawText, template), template);
  }
}

function markdownToWorkflowOutput(rawText: string, template: ReturnType<typeof getWorkflowTemplate>): WorkflowOutput {
  const cleaned = rawText
    .replace(/^```(?:markdown|md|json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (hasWorkflowJsonText(cleaned)) {
    const embedded = tryParseJsonObjectFromText(cleaned);
    if (embedded) return normalizeWorkflowOutput(embedded, template);
  }
  const blocks = cleaned
    .split(/\n(?=#{1,3}\s+)/g)
    .map((block) => block.trim())
    .filter(Boolean);
  const opening: string[] = [];
  const sections: WorkflowOutput["workflow_output"]["sections"] = [];

  for (const block of blocks) {
    const headingMatch = block.match(/^#{1,3}\s+(.+?)\s*\n+([\s\S]*)$/);
    if (!headingMatch) {
      opening.push(block);
      continue;
    }

    const title = headingMatch[1]
      .replace(/[*_`"]/g, "")
      .replace(/^\d+[\).]\s*/, "")
      .trim();
    const body = headingMatch[2].trim();
    const items = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+/.test(line) || /^\d+[\).]\s+/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+[\).]\s+/, "").trim())
      .filter(Boolean);
    const content = body
      .split("\n")
      .filter((line) => !/^[-*]\s+/.test(line.trim()) && !/^\d+[\).]\s+/.test(line.trim()))
      .join("\n")
      .trim();

    if (title || content || items.length) {
      sections.push({
        title,
        content,
        items: items.length ? items : undefined
      });
    }
  }

  const fallbackTitle = template.outputStructure[0] ?? "Recommended Direction";
  const summary = opening.join("\n\n").trim();
  return {
    workflow_output: {
      workflow_id: template.id,
      workflow_title: template.title,
      summary: summary || `Here is my recommended direction for this ${template.title.toLowerCase()}.`,
      sections: sections.length
        ? sections
        : [{
          title: fallbackTitle,
          content: cleaned,
          items: undefined
        }],
      next_steps: [],
      recommended_workflows: []
    }
  };
}

async function parseOrRepairLongForm(rawText: string): Promise<LongFormScript> {
  try {
    const candidate = cleanJsonString(extractJsonBlock(rawText));
    const parsed = JSON.parse(candidate) as LongFormScript;
    if (validateLongForm(parsed)) return parsed;
    return normalizeLongForm(parsed);
  } catch {
    return normalizeLongForm({
      hooks: [],
      title_suggestions: [],
      script_timeline: [
        {
          time_range: "Full response",
          section_title: "Generated Script",
          content: rawText.trim()
        }
      ]
    });
  }
}

async function parseOrRepairShorts(rawText: string): Promise<ShortsScript> {
  try {
    const candidate = cleanJsonString(extractJsonBlock(rawText));
    const parsed = JSON.parse(candidate) as ShortsScript;
    if (validateShorts(parsed)) return parsed;
    return normalizeShorts(parsed);
  } catch {
    return normalizeShorts({
      hook: "",
      pattern_interrupt: "",
      main_script: rawText.trim(),
      cta: ""
    });
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

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const timing = new TimingTracker("api.generate-script");

  try {
    if (!isValidBody(req.body)) {
      return res.status(400).json({ error: "Invalid request body." });
    }

    const requestedWorkflowTemplate = getWorkflowTemplate(req.body.workflowId);
    const creatorUserId = toCreatorUserId(req.auth.id);
    const validatedChatRequest = await timing.time("api.validate_chat_request", () =>
      inputValidator.validateChatRequest(creatorUserId, {
        prompt: req.body.topic,
        workflowType: requestedWorkflowTemplate.workflowType,
        conversationId: req.body.conversationId,
        attachments: []
      })
    );
    req.body.topic = validatedChatRequest.prompt;
    req.body.conversationId = validatedChatRequest.conversationId;

    const isShorts = req.body.videoType === "shorts";
    const shortsDuration = Math.min(3, Math.max(1, Math.round(req.body.length)));
    const workflowTemplate = requestedWorkflowTemplate;
    const workflowMetadata: JsonObject = {
      workflowId: workflowTemplate.id,
      workflowTitle: workflowTemplate.title,
      workflowDescription: workflowTemplate.description,
      specializedSystemPrompt: workflowTemplate.systemPrompt,
      expectedOutputStructure: workflowTemplate.outputStructure,
      suggestedInputs: workflowTemplate.suggestedInputs,
      audience: req.body.audience,
      tone: req.body.tone,
      length: req.body.length,
      videoType: req.body.videoType ?? "long",
      includeResearch: Boolean(req.body.includeResearch),
      includeCaseStudy: Boolean(req.body.includeCaseStudy)
    };
    const workflowTokenBudget = tokenBudgetEngine.getBudget({
      workflow: workflowTemplate.workflowType,
      workflowId: workflowTemplate.id,
      requestedAssetType: workflowTemplate.id === "generate-script" ? "script" : "other",
      videoType: req.body.videoType ?? "long",
      length: req.body.length,
      metadata: workflowMetadata
    });

    if (process.env.MOCK_GENERATE_SCRIPT === "true") {
      const turn = await chatService.startTurn({
        req,
        message: req.body.topic,
        workflow: workflowTemplate.workflowType,
        conversationId: req.body.conversationId,
        requestedAssetType: workflowTemplate.id === "generate-script" ? "script" : "other",
        metadata: workflowMetadata,
        timing
      });
      if (turn.kind === "clarification") {
        return res.status(200).json(await buildClarificationPayload({
          generation: turn,
          template: workflowTemplate,
          metadata: workflowMetadata
        }));
      }

      if (workflowTemplate.id !== "generate-script") {
        const mockOutput: WorkflowOutput = {
          conversation_id: turn.conversationId,
          workflow_output: {
            workflow_id: workflowTemplate.id,
            workflow_title: workflowTemplate.title,
            summary: `Mock ${workflowTemplate.title} output for ${req.body.topic}.`,
            sections: workflowTemplate.outputStructure.map((title) => ({
              title,
              content: `Example ${title.toLowerCase()} for ${req.body.topic}.`
            })),
            next_steps: ["Review the plan", "Refine the strongest angle", "Generate the next asset"],
            recommended_workflows: workflowTemplates.slice(0, 3).map((template) => ({
              workflow_id: template.id,
              title: template.title,
              reason: `Use this next if you want to continue with ${template.title.toLowerCase()}.`
            }))
          }
        };
        const advisorMarkdown = buildAdvisorMarkdown({
          generation: turn,
          userMessage: req.body.topic,
          rawOutput: mockOutput
        });
        mockOutput.advisor_markdown = advisorMarkdown;
        await chatService.finishTurn({
          userId: turn.userId,
          conversationId: turn.conversationId,
          assistantContent: advisorMarkdown,
          assistantJson: buildStoredAssistantMessage({
            type: "workflow",
            workflowType: turn.workflow,
            content: advisorMarkdown,
            result: mockOutput as unknown as JsonObject
          }),
          metadata: workflowMetadata
        });
        return res.status(200).json(mockOutput);
      }

      if (isShorts) {
        const mockShorts = {
          conversation_id: turn.conversationId,
          hook: "Stop scrolling. This one idea changes your output.",
          pattern_interrupt: "Pause. Write one task. Set 15 minutes. Start now.",
          main_script: "Clarity beats motivation. One focused action creates momentum.",
          cta: "Comment 'focus' if you are doing this today."
        };
        const advisorMarkdown = buildAdvisorMarkdown({
          generation: turn,
          userMessage: req.body.topic,
          rawOutput: mockShorts
        });
        const responsePayload = {
          ...mockShorts,
          advisor_markdown: advisorMarkdown
        };
        await chatService.finishTurn({
          userId: turn.userId,
          conversationId: turn.conversationId,
          assistantContent: advisorMarkdown,
          assistantJson: buildStoredAssistantMessage({
            type: "workflow",
            workflowType: turn.workflow,
            content: advisorMarkdown,
            result: responsePayload as unknown as JsonObject
          }),
          metadata: workflowMetadata
        });
        return res.status(200).json(responsePayload);
      }

      const mockLongForm = {
        conversation_id: turn.conversationId,
        hooks: ["test"],
        title_suggestions: ["test title"],
        script_timeline: [
          {
            time_range: "0:00-0:30",
            section_title: "Hook + Pattern Interrupt",
            content: "test timeline content"
          }
        ]
      };
      const advisorMarkdown = buildAdvisorMarkdown({
        generation: turn,
        userMessage: req.body.topic,
        rawOutput: mockLongForm
      });
      const responsePayload = {
        ...mockLongForm,
        advisor_markdown: advisorMarkdown
      };
      await chatService.finishTurn({
        userId: turn.userId,
        conversationId: turn.conversationId,
        assistantContent: advisorMarkdown,
        assistantJson: buildStoredAssistantMessage({
          type: "workflow",
          workflowType: turn.workflow,
          content: advisorMarkdown,
          result: responsePayload as unknown as JsonObject
        }),
        metadata: workflowMetadata
      });
      return res.status(200).json(responsePayload);
    }

    if (workflowTemplate.id !== "generate-script") {
      const isCreatorChat = workflowTemplate.id === "creator-chat";
      const sectionGuidance = isCreatorChat
        ? "Use sections only when they improve readability. Never use generic headings such as Answer, Response, Guidance, or Generated Content."
        : `Use these section titles in order unless a clearer label is needed: ${workflowTemplate.outputStructure.join(" | ")}`;
      const researchInstructions = workflowTemplate.id === "research-topic"
        ? `
RESEARCH DEPTH REQUIREMENTS:
- Produce all 5 sections: Topic Overview, Key Findings, Audience Questions and Misconceptions, Evidence and Caveats, and Creator Content Angles.
- Topic Overview: provide a clear 2-3 sentence framing of the subject and why it matters to the intended audience.
- Key Findings: include 5-8 specific, non-repetitive findings. Explain why each finding matters.
- Audience Questions and Misconceptions: include at least 5 real questions, objections, tensions, or misconceptions the audience may have.
- Evidence and Caveats: distinguish supported information, interpretation, uncertainty, counterarguments, and claims that require verification.
- Creator Content Angles: include 5-7 distinct angles with a hook or framing idea and the audience payoff.
- Put concise context in each section's content field and the detailed findings in its items array.
- Do not pad the answer with generic advice. Every item must add a new fact, implication, question, caveat, or creative angle.
- Do not fabricate citations, statistics, studies, experts, or institutions.
`
        : "";
      const strategyInstructions = workflowTemplate.id === "content-strategy"
        ? `
CONTENT STRATEGY DEPTH REQUIREMENTS:
- Produce all 5 sections: Strategic objective, Content pillars, Angle map, Publishing cadence, and Measurement plan.
- Strategic objective: define the audience, transformation or promise, primary goal, platform role, positioning, and the key strategic tradeoff.
- Content pillars: provide 4-6 distinct pillars. For each, include its purpose, audience problem, repeatable formats, and 2 example topics.
- Angle map: provide 8-12 specific content angles across educational, story-led, authority-building, contrarian, and conversion-oriented approaches.
- Publishing cadence: give a realistic weekly cadence, format mix, sequencing logic, and a repeatable 4-week operating rhythm.
- Measurement plan: define the primary outcome, leading indicators, success thresholds or directional signals, and what to change when performance is weak.
- Put concise strategic context in each content field and detailed decisions, examples, and actions in items.
- Make clear recommendations and tradeoffs. Do not return a generic list that could apply to any creator.
`
        : "";
      const productionInstructions = workflowTemplate.id === "production-kit"
        ? `
PRODUCTION KIT DEPTH REQUIREMENTS:
- Produce all 5 sections: Shot list, Scene notes, Asset checklist, Thumbnail direction, and Editing plan.
- Shot list: include 8-15 sequenced shots or beats with framing, subject/action, purpose, and approximate placement.
- Scene notes: specify setting, lighting, performance direction, composition, transitions, audio, and any continuity requirements.
- Asset checklist: include footage, B-roll, graphics, props, locations, wardrobe, music, sound effects, and export requirements where relevant.
- Thumbnail direction: provide 3 distinct concepts with focal subject, composition, expression or visual tension, text option, and why the concept should earn attention.
- Editing plan: cover pacing, pattern interrupts, cuts, captions, graphics, sound design, color, retention moments, and final quality checks.
- Keep the plan realistic for the creator's platform, content format, and available context.
- Put concise direction in each content field and executable production details in items.
`
        : "";
      const distributionInstructions = workflowTemplate.id === "posting-strategy"
        ? `
POSTING STRATEGY DEPTH REQUIREMENTS:
- Produce all 5 sections: Primary post package, Repurposing plan, Captions and titles, Posting sequence, and Metrics to watch.
- Primary post package: define the platform-native format, audience promise, hook, packaging, CTA, and publishing objective.
- Repurposing plan: provide 5-8 derivatives with platform, format, angle, opening, and relationship to the primary content.
- Captions and titles: include at least 5 title or headline options and 3 caption approaches with distinct positioning.
- Posting sequence: provide a practical launch timeline covering preparation, publish day, follow-up posts, community engagement, and reuse.
- Metrics to watch: define primary and secondary metrics, what each signal means, and specific iteration actions for strong or weak performance.
- Make recommendations platform-specific. Do not return generic advice such as post consistently or engage with your audience without concrete actions.
- Put concise strategic context in each content field and detailed packaging, scheduling, and measurement actions in items.
`
        : "";
      let responseInstructions = `Return ONLY valid JSON in this exact shape:

{
  "workflow_output": {
    "workflow_id": "${workflowTemplate.id}",
    "workflow_title": "${workflowTemplate.title}",
    "summary": "",
    "sections": [
      {
        "title": "",
        "content": "",
        "items": []
      }
    ],
    "next_steps": [],
    "recommended_workflows": []
  }
}

STRICT RULES:
- Match the workflow: ${workflowTemplate.title}
- ${sectionGuidance}
- Write the summary as a natural conversational opening of no more than 2 sentences.
- Do not repeat the workflow title or use headings such as Summary, Executive Summary, Workflow Output, Script Advisory, Content Strategy, Production Direction, or Posting Strategy.
- Never place workflow_id, workflow_title, backend tags, metadata, or JSON field names inside user-facing text fields.
- Keep the answer centered on content creation, creator strategy, production, distribution, audience growth, or creative workflow.
- For open-ended chat questions, answer conversationally first, then structure the useful details into sections.
- For Creator Chat, behave like a default ChatGPT-style conversation for creators: answer the prompt directly, generate requested content immediately, and do not force the user to choose a workflow before helping.
- If the user asks for a draft, script, caption, outline, strategy, idea list, research brief, production plan, or posting plan, create the actual deliverable.
- Use summary for the direct answer. Use sections for the full content, reasoning, examples, or implementation details.
- Leave next_steps and recommended_workflows empty. Innkwise adds one contextual next-action invitation after formatting.
- Allowed workflow_id values: ${workflowTemplates.map((template) => template.id).join(", ")}
- Use Markdown inside content fields.
- Make every section specific, practical, and useful.
- Give each workflow section enough substance to be useful: 2-4 concise sentences plus actionable items where appropriate.
- Prefer short actionable items over paragraphs. Keep each item focused on one action or decision.
- Keep items as short bullet strings when a list improves scannability.
- Do not output hooks, title_suggestions, or script_timeline unless the workflow asks for a script.
- Do NOT output HTML tags.
${researchInstructions}
${strategyInstructions}
${productionInstructions}
${distributionInstructions}
${isCreatorChat ? "- Keep Creator Chat responses natural and flexible. Put a simple answer in summary and leave sections empty when headings would feel forced." : ""}
`;

      responseInstructions = isCreatorChat
        ? [
          "Return clean Markdown, not JSON.",
          "Answer like a human creator advisor continuing the conversation.",
          "Do not use generic headings such as Summary, Answer, Generated Content, or Workflow Output.",
          "Use short bullets when listing ideas, steps, or recommendations.",
          "Keep it practical and centered on content creation.",
          "Never mention workflow IDs, backend tags, metadata, JSON, or internal context."
        ].join("\n")
        : [
          "Return ONLY valid compact JSON. No prose outside JSON.",
          `Use workflow_id "${workflowTemplate.id}" and workflow_title "${workflowTemplate.title}" only as JSON fields, never inside user-facing text.`,
          "Shape: {\"workflow_output\":{\"workflow_id\":\"\",\"workflow_title\":\"\",\"summary\":\"\",\"sections\":[{\"title\":\"\",\"content\":\"\",\"items\":[]}],\"next_steps\":[],\"recommended_workflows\":[]}}",
          `Required section guidance:\n${compactWorkflowDepthGuidance(workflowTemplate.id)}`,
          "Summary must be a natural conversational opening of 1-2 sentences.",
          "Content fields should be concise. Put detailed actionable points in items.",
          "Leave next_steps and recommended_workflows empty.",
          "Never output backend tags, metadata, raw field names in text, HTML, or markdown code fences."
        ].join("\n");

      const generation = await chatService.generate({
        req,
        message: req.body.topic,
        workflow: workflowTemplate.workflowType,
        conversationId: req.body.conversationId,
        requestedAssetType: "other",
        metadata: workflowMetadata,
        responseInstructions,
        maxTokens: workflowTokenBudget.maxOutputTokens,
        timing
      });
      if (generation.kind === "clarification") {
        const payload = await timing.time("api.build_clarification_payload", () => buildClarificationPayload({
          generation,
          template: workflowTemplate,
          metadata: workflowMetadata
        }));
        timing.log({
          workflowId: workflowTemplate.id,
          workflowType: workflowTemplate.workflowType,
          success: true,
          responseType: "clarification"
        });
        return res.status(200).json(payload);
      }
      const parsed = await timing.time("api.parse_or_repair_workflow_output", () =>
        parseOrRepairWorkflowOutput(generation.rawText, workflowTemplate)
      );
      const advisorMarkdown = timing.timeSync("api.format_advisor_markdown", () =>
        isCreatorChat
          ? cleanAssistantMarkdown(generation.rawText)
          : buildAdvisorMarkdown({
            generation,
            userMessage: req.body.topic,
            rawOutput: parsed
          })
      );
      const responsePayload = {
        ...parsed,
        conversation_id: generation.conversationId,
        advisor_markdown: advisorMarkdown
      };
      await timing.time("api.save_assistant_message", () => chatService.finishTurn({
        userId: generation.userId,
        conversationId: generation.conversationId,
        assistantContent: advisorMarkdown,
        assistantJson: buildStoredAssistantMessage({
          type: "workflow",
          workflowType: generation.workflow,
          content: advisorMarkdown,
          result: responsePayload as unknown as JsonObject
        }),
        metadata: workflowMetadata
      }));
      timing.log({
        workflowId: workflowTemplate.id,
        workflowType: workflowTemplate.workflowType,
        success: true,
        responseChars: advisorMarkdown.length
      });
      return res.status(200).json(responsePayload);
    }

    if (isShorts) {
      const responseInstructions = `Return ONLY valid JSON:

{
  "hook": "",
  "pattern_interrupt": "",
  "main_script": "",
  "cta": ""
}

STRICT RULES:
- Total length must fit within ${shortsDuration} minute${shortsDuration === 1 ? "" : "s"} spoken
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
`;

      const generation = await chatService.generate({
        req,
        message: req.body.topic,
        workflow: workflowTemplate.workflowType,
        conversationId: req.body.conversationId,
        requestedAssetType: "script",
        metadata: workflowMetadata,
        responseInstructions,
        maxTokens: workflowTokenBudget.maxOutputTokens,
        timing
      });
      if (generation.kind === "clarification") {
        const payload = await timing.time("api.build_clarification_payload", () => buildClarificationPayload({
          generation,
          template: workflowTemplate,
          metadata: workflowMetadata
        }));
        timing.log({
          workflowId: workflowTemplate.id,
          workflowType: workflowTemplate.workflowType,
          success: true,
          responseType: "clarification"
        });
        return res.status(200).json(payload);
      }
      const parsed = await timing.time("api.parse_or_repair_shorts", () => parseOrRepairShorts(generation.rawText));
      const advisorMarkdown = timing.timeSync("api.format_advisor_markdown", () => buildAdvisorMarkdown({
        generation,
        userMessage: req.body.topic,
        rawOutput: parsed
      }));
      const responsePayload = {
        ...parsed,
        conversation_id: generation.conversationId,
        advisor_markdown: advisorMarkdown
      };
      await timing.time("api.save_assistant_message", () => chatService.finishTurn({
        userId: generation.userId,
        conversationId: generation.conversationId,
        assistantContent: advisorMarkdown,
        assistantJson: buildStoredAssistantMessage({
          type: "workflow",
          workflowType: generation.workflow,
          content: advisorMarkdown,
          result: responsePayload as unknown as JsonObject
        }),
        metadata: workflowMetadata
      }));
      timing.log({
        workflowId: workflowTemplate.id,
        workflowType: workflowTemplate.workflowType,
        success: true,
        responseChars: advisorMarkdown.length
      });
      return res.status(200).json(responsePayload);
    }

    const timeline = buildTimeline(req.body.length);

    const responseInstructions = `Generate a COMPLETE ${req.body.length}-minute script.

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
`;

    const generation = await chatService.generate({
      req,
      message: req.body.topic,
      workflow: workflowTemplate.workflowType,
      conversationId: req.body.conversationId,
      requestedAssetType: "script",
      metadata: workflowMetadata,
      responseInstructions,
      maxTokens: workflowTokenBudget.maxOutputTokens,
      timing
    });
    if (generation.kind === "clarification") {
      const payload = await timing.time("api.build_clarification_payload", () => buildClarificationPayload({
        generation,
        template: workflowTemplate,
        metadata: workflowMetadata
      }));
      timing.log({
        workflowId: workflowTemplate.id,
        workflowType: workflowTemplate.workflowType,
        success: true,
        responseType: "clarification"
      });
      return res.status(200).json(payload);
    }
    const parsed = await timing.time("api.parse_or_repair_long_form", () => parseOrRepairLongForm(generation.rawText));
    const enriched = await timing.time("api.ensure_hooks_and_titles", () => ensureHooksAndTitles(
      parsed,
      req.body.topic,
      req.body.audience,
      req.body.tone
    ));
    const advisorMarkdown = timing.timeSync("api.format_advisor_markdown", () => buildAdvisorMarkdown({
      generation,
      userMessage: req.body.topic,
      rawOutput: enriched
    }));

    const responsePayload = {
      ...enriched,
      conversation_id: generation.conversationId,
      advisor_markdown: advisorMarkdown
    };
    await timing.time("api.save_assistant_message", () => chatService.finishTurn({
      userId: generation.userId,
      conversationId: generation.conversationId,
      assistantContent: advisorMarkdown,
      assistantJson: buildStoredAssistantMessage({
        type: "workflow",
        workflowType: generation.workflow,
        content: advisorMarkdown,
        result: responsePayload as unknown as JsonObject
      }),
      metadata: workflowMetadata
    }));
    timing.log({
      workflowId: workflowTemplate.id,
      workflowType: workflowTemplate.workflowType,
      success: true,
      responseChars: advisorMarkdown.length
    });

    return res.status(200).json(responsePayload);
  } catch (error) {
    timing.log({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
    if (isApiError(error)) throw error;
    if (isRateLimitError(error)) {
      return res.status(200).json(error.toResponse());
    }
    if (isInputValidationError(error)) {
      return res.status(400).json(error.toResponse());
    }
    if (error instanceof GatewayError) {
      const status = error.retryable ? 503 : 500;
      return res.status(status).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[generate-script] request failed", error);
    return res.status(500).json({ error: message });
  }
}

export default withApiAuth(handler, {
  async authorize(req, user) {
    if (req.method !== "POST") return;
    const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : null;
    if (conversationId) {
      await verifyConversationOwnership(user.id, conversationId);
    }
  }
});
