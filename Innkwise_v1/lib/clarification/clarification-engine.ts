import type { ContextWorkflow } from "@/backend/context/context-engine";
import type { JsonObject, JsonValue } from "@/shared/types/creator-os";

export type ClarificationField =
  | "topic"
  | "audience"
  | "platform"
  | "goal"
  | "objective"
  | "content_format"
  | "source_content";

export type ClarificationContext = Partial<Record<ClarificationField, string | string[]>>;

export type ContextCompletenessResult = {
  completenessScore: number;
  missingFields: ClarificationField[];
  shouldAskQuestions: boolean;
  availableContext: ClarificationContext;
};

export type ClarificationQuestion = {
  field: ClarificationField;
  question: string;
};

export type PendingWorkflowState = {
  workflow: ContextWorkflow;
  originalMessage: string;
  collectedContext: ClarificationContext;
  missingFields: ClarificationField[];
  questions: ClarificationQuestion[];
  createdAt: string;
  updatedAt: string;
};

export type EvaluateContextInput = {
  workflow: ContextWorkflow;
  message: string;
  creatorProfile?: {
    goals?: JsonObject;
    audience?: JsonObject;
    platformPreferences?: JsonObject;
    niche?: JsonObject;
    writingPreferences?: JsonObject;
    memory?: JsonObject;
  } | null;
  metadata?: JsonObject;
  pendingContext?: ClarificationContext;
};

const requirements: Record<ContextWorkflow, ClarificationField[]> = {
  general: [],
  research: ["topic"],
  strategy: ["audience", "platform", "goal"],
  script: ["topic", "audience", "platform", "content_format"],
  production: ["source_content", "platform", "content_format"],
  distribution: ["platform", "objective"]
};

const questionByField: Record<ClarificationField, string> = {
  topic: "What specific topic or question should I research?",
  audience: "Who is the target audience?",
  platform: "Which platform are you creating for?",
  goal: "What is the primary goal for this strategy?",
  objective: "What outcome should this posting strategy optimize for?",
  content_format: "What content format are you creating, such as a short, reel, long-form video, carousel, article, or email?",
  source_content: "Share the script you want to produce, or tell me the topic or idea the production kit should be built around."
};

const knownPlatforms = ["youtube", "instagram", "tiktok", "linkedin", "x", "twitter", "blog", "newsletter", "podcast"];
const knownFormats = ["short", "shorts", "reel", "reels", "long-form", "long form", "video", "carousel", "thread", "article", "email", "podcast"];

function hasMeaningfulValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (value && typeof value === "object") return Object.values(value).some(hasMeaningfulValue);
  return false;
}

function findJsonValue(value: JsonValue | undefined, keys: string[]): string | string[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonValue(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (keys.includes(key.toLowerCase()) && hasMeaningfulValue(nestedValue)) {
      if (typeof nestedValue === "string") return nestedValue;
      if (Array.isArray(nestedValue)) {
        return nestedValue
          .map((item) => typeof item === "string" ? item : "")
          .filter(Boolean);
      }
      return JSON.stringify(nestedValue);
    }
    const found = findJsonValue(nestedValue, keys);
    if (found) return found;
  }
  return undefined;
}

function matchKnownValues(message: string, values: string[]) {
  const normalized = message.toLowerCase();
  return values.filter((value) => normalized.includes(value));
}

function extractFromMessage(message: string): ClarificationContext {
  const context: ClarificationContext = {};
  const platforms = matchKnownValues(message, knownPlatforms);
  const formats = matchKnownValues(message, knownFormats);

  if (platforms.length) context.platform = platforms;
  if (formats.length) context.content_format = formats;

  const audienceMatch = message.match(/\b(?:audience|for)\s+(?:is\s+)?([^.!?\n]+)/i);
  if (audienceMatch?.[1] && !/^(this|the|a|an)\s+(video|post|script|topic)/i.test(audienceMatch[1])) {
    context.audience = audienceMatch[1].trim();
  }

  const goalMatch = message.match(/\b(?:goal|objective)\s+(?:is|to)\s+([^.!?\n]+)/i);
  if (goalMatch?.[1]) {
    context.goal = goalMatch[1].trim();
    context.objective = goalMatch[1].trim();
  }

  return context;
}

function inferAnswersForMissingFields(
  message: string,
  missingFields: ClarificationField[]
): ClarificationContext {
  const inferred: ClarificationContext = {};
  const answers = message
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[.)-]?\s*/, "").trim())
    .filter(Boolean);

  if (answers.length >= missingFields.length && missingFields.length > 0) {
    missingFields.forEach((field, index) => {
      if (answers[index]) inferred[field] = answers[index];
    });
    return inferred;
  }

  const normalized = message.toLowerCase();
  if (missingFields.includes("audience") && /\b(children|kids|parents|creators|founders|students|professionals|beginners|experts|marketers)\b/i.test(message)) {
    inferred.audience = message.match(/\b(children|kids|parents|creators|founders|students|professionals|beginners|experts|marketers)\b/i)?.[0] ?? "";
  }
  if (missingFields.includes("platform")) {
    const matchedPlatforms = matchKnownValues(message, knownPlatforms);
    if (matchedPlatforms.length) inferred.platform = matchedPlatforms;
  }
  if (missingFields.includes("content_format")) {
    const matchedFormats = matchKnownValues(message, knownFormats);
    if (matchedFormats.length) inferred.content_format = matchedFormats;
  }
  if ((missingFields.includes("goal") || missingFields.includes("objective"))
    && /\b(growth|sales|leads|authority|awareness|community|revenue|engagement|watch time|conversion)\b/i.test(normalized)) {
    const objective = message.match(/\b(growth|sales|leads|authority|awareness|community|revenue|engagement|watch time|conversion)\b/i)?.[0] ?? "";
    if (missingFields.includes("goal")) inferred.goal = objective;
    if (missingFields.includes("objective")) inferred.objective = objective;
  }

  return inferred;
}

function metadataValue(metadata: JsonObject | undefined, field: ClarificationField) {
  if (!metadata) return undefined;
  const aliases: Record<ClarificationField, string[]> = {
    topic: ["topic", "query"],
    audience: ["audience"],
    platform: ["platform", "primaryplatform"],
    goal: ["goal", "primarygoal"],
    objective: ["objective", "goal", "primarygoal"],
    content_format: ["contentformat", "format", "videotype"],
    source_content: ["sourcecontent", "script", "content", "topic"]
  };
  const value = findJsonValue(metadata, aliases[field]);
  if (field === "audience" && typeof value === "string"
    && ["creators", "general audience"].includes(value.trim().toLowerCase())) {
    return undefined;
  }
  return value;
}

function profileValue(input: EvaluateContextInput, field: ClarificationField) {
  const profile = input.creatorProfile;
  if (!profile) return undefined;

  if (field === "audience") {
    return findJsonValue(profile.audience, ["audience", "detectedaudience", "targetaudience"]);
  }
  if (field === "platform") {
    return findJsonValue(profile.platformPreferences, ["platforms", "detectedplatforms", "primaryplatform", "secondaryplatforms"]);
  }
  if (field === "goal" || field === "objective") {
    return findJsonValue(profile.goals, ["goals", "detectedgoals", "primarygoal", "objective"]);
  }
  if (field === "content_format") {
    return findJsonValue(profile.platformPreferences, ["contentformats", "format", "contentformat"]);
  }
  return undefined;
}

function mergeContext(...contexts: Array<ClarificationContext | undefined>): ClarificationContext {
  const merged: ClarificationContext = {};
  for (const context of contexts) {
    if (!context) continue;
    for (const [field, value] of Object.entries(context)) {
      if (hasMeaningfulValue(value)) {
        merged[field as ClarificationField] = value;
      }
    }
  }
  return merged;
}

export function evaluateContextCompleteness(input: EvaluateContextInput): ContextCompletenessResult {
  const requiredFields = requirements[input.workflow];
  const messageContext = extractFromMessage(input.message);
  const previouslyMissing = requiredFields.filter((field) => !hasMeaningfulValue(input.pendingContext?.[field]));
  const inferredAnswers = inferAnswersForMissingFields(input.message, previouslyMissing);
  const availableContext = mergeContext(input.pendingContext, messageContext, inferredAnswers);

  for (const field of requiredFields) {
    if (hasMeaningfulValue(availableContext[field])) continue;
    const fromMetadata = metadataValue(input.metadata, field);
    const fromProfile = profileValue(input, field);
    if (hasMeaningfulValue(fromMetadata)) availableContext[field] = fromMetadata;
    else if (hasMeaningfulValue(fromProfile)) availableContext[field] = fromProfile;
  }

  const missingFields = requiredFields.filter((field) => !hasMeaningfulValue(availableContext[field]));
  const completenessScore = requiredFields.length === 0
    ? 100
    : Math.round(((requiredFields.length - missingFields.length) / requiredFields.length) * 100);

  return {
    completenessScore,
    missingFields,
    shouldAskQuestions: missingFields.length > 0,
    availableContext
  };
}

export function generateClarificationQuestions(missingFields: ClarificationField[]) {
  return missingFields.map((field) => ({
    field,
    question: questionByField[field]
  }));
}

export function buildClarificationResponse(input: {
  workflowTitle: string;
  questions: ClarificationQuestion[];
  memoryAcknowledgement?: string | null;
}) {
  const questionText = input.questions
    .map((question, index) => `${index + 1}. ${question.question}`)
    .join("\n");

  return [
    input.memoryAcknowledgement?.trim() || "",
    `I can help with ${input.workflowTitle.toLowerCase()}.`,
    "",
    "Before I build it, I need a little more context:",
    "",
    questionText,
    "",
    "This will help me give you a sharper, more useful recommendation."
  ].filter(Boolean).join("\n");
}

export function createPendingWorkflowState(input: {
  workflow: ContextWorkflow;
  originalMessage: string;
  evaluation: ContextCompletenessResult;
}): PendingWorkflowState {
  const now = new Date().toISOString();
  return {
    workflow: input.workflow,
    originalMessage: input.originalMessage,
    collectedContext: input.evaluation.availableContext,
    missingFields: input.evaluation.missingFields,
    questions: generateClarificationQuestions(input.evaluation.missingFields),
    createdAt: now,
    updatedAt: now
  };
}

export function isPendingWorkflowState(value: unknown): value is PendingWorkflowState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.workflow === "string"
    && typeof row.originalMessage === "string"
    && Array.isArray(row.missingFields)
    && row.collectedContext !== null
    && typeof row.collectedContext === "object";
}
