import type {
  ContextAssembly,
  ContextConversation,
  ContextCreatorProfile,
  ContextKnowledgeSource,
  ContextWorkflow
} from "@/backend/context/context-engine";

export type LlmPromptMessage = {
  role: "system" | "user";
  content: string;
};

export type LlmReadyPrompt = {
  workflow: ContextWorkflow;
  systemPrompt: string;
  contextPrompt: string;
  userPrompt: string;
  messages: LlmPromptMessage[];
};

const workflowSystemPrompts: Record<ContextWorkflow, string> = {
  general: [
    "You are Innkwise Creator Chat.",
    "Your job is to answer naturally while staying useful for creators, content strategy, production, research, and distribution.",
    "If the user asks for content, create the content directly before suggesting any workflow.",
    "Use recent conversation messages as continuity and use creator profile and knowledge sources when they are relevant.",
    "When the user follows up after a workflow, answer the follow-up directly within the existing conversation context. Do not restart or repeat the completed workflow unless asked."
  ].join("\n"),
  research: [
    "You are Innkwise Research Mode.",
    "Your job is to produce a thorough, creator-relevant research brief rather than a short summary.",
    "Explain the topic clearly, identify important findings and tensions, map audience questions and misconceptions, and translate the research into distinctive content opportunities.",
    "Prioritize evidence, definitions, source distinctions, assumptions, examples, counterpoints, and open questions.",
    "Use supplied knowledge sources when available. Do not invent citations, studies, statistics, or institutions. Label unsupported claims as requiring verification.",
    "Provide enough depth for the creator to confidently move into strategy or script development."
  ].join("\n"),
  strategy: [
    "You are Innkwise Strategy Mode.",
    "Your job is to produce a complete, decision-ready content strategy rather than a short list of ideas.",
    "Define the strategic objective, audience promise, positioning, repeatable content pillars, specific angle examples, publishing cadence, and measurement plan.",
    "Prioritize clarity, tradeoffs, sequencing, creator-market fit, and actions the creator can execute immediately.",
    "Ground every recommendation in the supplied creator profile, goals, audience, platforms, conversation context, and memory."
  ].join("\n"),
  script: [
    "You are Innkwise Script Mode.",
    "Your job is to write structured, high-retention content that matches the creator voice and audience.",
    "Prioritize hooks, narrative flow, audience psychology, platform fit, and concrete payoff.",
    "Use knowledge sources as grounding material while preserving the creator's writing preferences."
  ].join("\n"),
  production: [
    "You are Innkwise Production Mode.",
    "Your job is to translate the current idea, strategy, or script into a complete production kit that can be handed directly to a creator or editor.",
    "Include sequenced shots, scene purpose, visual direction, required assets, thumbnail concepts, editing notes, pacing, audio, graphics, and practical preparation.",
    "Prioritize execution detail and publishing readiness while keeping the plan realistic for the creator's resources and platform."
  ].join("\n"),
  distribution: [
    "You are Innkwise Distribution Mode.",
    "Your job is to produce a complete posting and distribution plan for the current content.",
    "Include platform-native packaging, title and caption options, publishing sequence, repurposing, launch engagement, metrics, and specific iteration rules.",
    "Use the same creator and conversation context, but optimize each action for reach, conversion, audience learning, and sustainable execution."
  ].join("\n")
};

function compactJson(value: unknown, maxChars = 900) {
  const text = JSON.stringify(value ?? {});
  if (!text || text === "{}" || text === "[]") return "";
  return text.length > maxChars ? `${text.slice(0, maxChars).trim()}...` : text;
}

function truncateText(value: unknown, maxChars = 900) {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars).trim()}...` : trimmed;
}

function formatLine(label: string, value: unknown) {
  const text = Array.isArray(value)
    ? value.filter(Boolean).join(", ")
    : typeof value === "object"
      ? compactJson(value)
      : truncateText(String(value ?? ""));

  return text && text !== "Not set" ? `${label}: ${text}` : "";
}

function formatCreatorProfile(profile: ContextCreatorProfile | null) {
  if (!profile) {
    return "No creator profile is available yet.";
  }

  return [
    formatLine("Creator name", profile.creatorName),
    formatLine("Brand name", profile.brandName),
    formatLine("Tagline", profile.tagline),
    formatLine("Bio", profile.bio),
    formatLine("Experience level", profile.experienceLevel),
    formatLine("Archetypes", profile.archetypes),
    formatLine("Goals", profile.goals),
    formatLine("Niche", profile.niche),
    formatLine("Audience", profile.audience),
    formatLine("Platform preferences", profile.platformPreferences),
    formatLine("Writing preferences", profile.writingPreferences),
    formatLine("AI controls", profile.aiControls)
  ].filter(Boolean).join("\n") || "Creator profile exists but has no filled fields yet.";
}

function formatKnowledgeSource(source: ContextKnowledgeSource, index: number) {
  return [
    `[${index + 1}] ${source.title}`,
    `Type: ${source.sourceType}`,
    source.url ? `URL: ${source.url}` : "",
    source.tags.length ? `Tags: ${source.tags.join(", ")}` : "",
    source.summary ? `Summary: ${truncateText(source.summary, 500)}` : "",
    source.extractedTextSnippet ? `Extracted text: ${truncateText(source.extractedTextSnippet, 800)}` : ""
  ].filter(Boolean).join("\n");
}

function formatKnowledgeSources(sources: ContextKnowledgeSource[]) {
  if (!sources.length) {
    return "No knowledge sources were assembled.";
  }

  return sources.map(formatKnowledgeSource).join("\n\n");
}

function formatConversation(conversation: ContextConversation, index: number) {
  const messages = conversation.recentMessages.length
    ? conversation.recentMessages
        .map((message) => `- ${message.role}: ${truncateText(message.content ?? compactJson(message.contentJson, 500), 700)}`)
        .join("\n")
    : "No recent messages available.";

  return [
    `[${index + 1}] ${conversation.title ?? "Untitled conversation"}`,
    `Recent messages:`,
    messages
  ].join("\n");
}

function formatRecentConversations(conversations: ContextConversation[]) {
  if (!conversations.length) {
    return "No recent conversations were assembled.";
  }

  return conversations.map(formatConversation).join("\n\n");
}

function formatMemorySummary(context: ContextAssembly) {
  if (!context.memorySummary.available) {
    return "No durable creator memories are stored yet.";
  }

  return [
    `Confidence: ${context.memorySummary.confidence ?? "Not scored"}`,
    `Last detection: ${context.memorySummary.lastDetectionAt ?? "Unknown"}`,
    `Categories: ${context.memorySummary.categories.length ? context.memorySummary.categories.join(", ") : "None"}`,
    `Durable facts: ${compactJson(context.memorySummary.durableFacts, 1200)}`
  ].filter(Boolean).join("\n");
}

export function buildContextPrompt(context: ContextAssembly) {
  return [
    "# Innkwise Context",
    `Workflow: ${context.workflow}`,
    `Topic: ${context.topic ?? "Not provided"}`,
    "",
    "## Creator Profile",
    formatCreatorProfile(context.creatorProfile),
    "",
    "## Relevant Knowledge Sources",
    formatKnowledgeSources(context.relevantKnowledgeSources),
    "",
    "## Recent Conversations",
    formatRecentConversations(context.recentConversations),
    "",
    "## Memory Summary",
    formatMemorySummary(context)
  ].join("\n");
}

export function buildUserPrompt(context: ContextAssembly, userInstruction?: string) {
  const instruction = userInstruction?.trim() || context.topic || "Use the assembled context to produce the requested output.";

  return [
    "Use the supplied Innkwise Context Assembly as the source of truth.",
    "Follow the active workflow mode.",
    "Respect creator voice, audience, goals, platform preferences, and available knowledge sources.",
    "Do not mention internal context assembly mechanics unless the user asks.",
    "",
    "User request:",
    instruction
  ].join("\n");
}

export function buildSystemPrompt(workflow: ContextWorkflow) {
  return [
    workflowSystemPrompts[workflow],
    "",
    "Creator Advisor behavior:",
    "- Act as a content strategist, creative director, producer, and growth advisor.",
    "- Give a clear professional opinion instead of presenting every option as equally strong.",
    "- Recommend the strongest direction and explain why it is more likely to work.",
    "- Challenge weak assumptions, vague positioning, and low-value creative choices respectfully.",
    "- Suggest a better alternative when the user's initial direction is unlikely to achieve the stated goal.",
    "- Begin like a human advisor continuing a conversation, not with a report title or category label.",
    "- Never begin with Summary, Executive Summary, Script Advisory, Content Strategy, Production Direction, Posting Strategy, or Workflow Output.",
    "- Sound natural and decisive. Avoid robotic labels, repetitive disclaimers, and unnecessary structure.",
    "",
    "Global rules:",
    "- Use only the provided context and the user's request unless general reasoning is clearly needed.",
    "- Preserve uncertainty; do not fabricate facts, memories, source details, or prior conversations.",
    "- Prefer specific, usable output over broad explanation.",
    "- Keep descriptions to one or two sentences. Prefer short bullets for actions, choices, shots, tactics, and recommendations.",
    "- Avoid long paragraphs and repeated summaries.",
    "- Never expose workflow IDs, workflow titles, backend tags, metadata, JSON keys, context assembly labels, or other implementation details.",
    "- Return clean Markdown only. Use headings and bullets correctly; never leave raw formatting markers visible.",
    "- Optimize for future AI memory by keeping reasoning tied to creator profile, knowledge, conversations, and metadata."
  ].join("\n");
}

export function buildLlmPrompt(context: ContextAssembly, userInstruction?: string): LlmReadyPrompt {
  const systemPrompt = buildSystemPrompt(context.workflow);
  const contextPrompt = buildContextPrompt(context);
  const userPrompt = buildUserPrompt(context, userInstruction);

  return {
    workflow: context.workflow,
    systemPrompt,
    contextPrompt,
    userPrompt,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: `${contextPrompt}\n\n${userPrompt}`
      }
    ]
  };
}

export class PromptBuilder {
  constructor(private readonly context: ContextAssembly) {}

  build(userInstruction?: string) {
    return buildLlmPrompt(this.context, userInstruction);
  }

  buildSystemPrompt() {
    return buildSystemPrompt(this.context.workflow);
  }

  buildContextPrompt() {
    return buildContextPrompt(this.context);
  }

  buildUserPrompt(userInstruction?: string) {
    return buildUserPrompt(this.context, userInstruction);
  }
}
