import type { ContextWorkflow } from "@/backend/context/context-engine";

export type AdvisorSection = {
  title: string;
  content?: string;
  bullets?: string[];
  callout?: string;
  table?: {
    headers: string[];
    rows: string[][];
  };
};

export type AdvisorResponse = {
  workflow: ContextWorkflow;
  executiveSummary: string;
  assessment: string;
  recommendations: string[];
  keyInsights: string[];
  sections: AdvisorSection[];
  nextActionPrompt: string | null;
};

export type AdvisorLayerInput = {
  workflow: ContextWorkflow;
  userMessage: string;
  rawOutput: unknown;
};

const INTERNAL_KEYS = new Set([
  "workflow_id",
  "workflow_title",
  "conversation_id",
  "user_id",
  "message_id",
  "metadata",
  "backend_tags",
  "context_snapshot",
  "memory_state"
]);

const TRANSITION_SECTION_TITLES = new Set([
  "next step",
  "next steps",
  "next action",
  "next actions",
  "recommended workflow",
  "recommended workflows",
  "workflow recommendation",
  "workflow recommendations",
  "what i would do next",
  "summary",
  "executive summary"
]);

const GENERIC_SECTION_TITLES = new Set([
  "answer",
  "response",
  "guidance",
  "generated content",
  "generated content or guidance",
  "helpful details",
  "details"
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toStrings(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

function cleanGeneratedText(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return meaningfulText(JSON.parse(trimmed));
    } catch {
      // Fall through to line-level cleanup.
    }
  }

  return trimmed
    .replace(/^```(?:markdown|md|json)?\s*/i, "")
    .replace(/```$/i, "")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().replace(/^["']+/, "").toLowerCase();
      return !Array.from(INTERNAL_KEYS).some((key) =>
        normalized.startsWith(`${key}:`)
        || normalized.startsWith(`${key}=`)
        || normalized.startsWith(`${key.replace(/_/g, " ")}:`)
      ) && normalized !== "workflow output";
    })
    .join("\n")
    .trim();
}

function meaningfulText(value: unknown): string {
  if (typeof value === "string") return cleanGeneratedText(value);
  if (Array.isArray(value)) return value.map(meaningfulText).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !INTERNAL_KEYS.has(key.toLowerCase()))
      .map(([, nested]) => meaningfulText(nested))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function workflowOutput(rawOutput: unknown) {
  const raw = asRecord(rawOutput);
  return asRecord(raw.workflow_output ?? raw);
}

function extractSections(rawOutput: unknown): AdvisorSection[] {
  const output = workflowOutput(rawOutput);
  const rawSections = Array.isArray(output.sections) ? output.sections : [];
  const sections = rawSections.map((section, index) => {
    const row = asRecord(section);
    const content = meaningfulText(row.content);
    const normalizedContent = content.toLowerCase();
    const rawTitle = cleanGeneratedText(String(row.title ?? `Section ${index + 1}`));
    return {
      title: GENERIC_SECTION_TITLES.has(rawTitle.trim().toLowerCase()) ? "" : rawTitle,
      content,
      bullets: toStrings(row.items)
        .map(cleanGeneratedText)
        .filter((item) => item && !normalizedContent.includes(item.toLowerCase()))
    };
  }).filter((section) =>
    !TRANSITION_SECTION_TITLES.has(section.title.trim().toLowerCase())
    && (section.content || section.bullets?.length)
  );

  const seen = new Set<string>();
  return sections.filter((section) => {
    const body = [
      section.content?.trim().toLowerCase() ?? "",
      section.bullets?.join("|").toLowerCase() ?? ""
    ].filter(Boolean).join("::");
    const signature = body || section.title.trim().toLowerCase();
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function scriptSections(rawOutput: unknown): AdvisorSection[] {
  const output = asRecord(rawOutput);
  const timeline = Array.isArray(output.script_timeline) ? output.script_timeline : [];
  const sections: AdvisorSection[] = [];

  const hooks = toStrings(output.hooks);
  const titles = toStrings(output.title_suggestions);
  if (hooks.length) sections.push({ title: "Hooks", bullets: hooks });
  if (titles.length) sections.push({ title: "Title Options", bullets: titles });

  for (const item of timeline) {
    const row = asRecord(item);
    sections.push({
      title: `${String(row.time_range ?? "Script")} - ${String(row.section_title ?? "Section")}`,
      content: meaningfulText(row.content)
    });
  }

  if (typeof output.main_script === "string") {
    sections.push({
      title: "Script",
      content: [
        meaningfulText(output.hook),
        meaningfulText(output.pattern_interrupt),
        meaningfulText(output.main_script),
        meaningfulText(output.cta)
      ].filter(Boolean).join("\n\n")
    });
  }
  return sections;
}

function workflowSpecificSections(workflow: ContextWorkflow, rawOutput: unknown): AdvisorSection[] {
  const baseSections = workflow === "script" ? scriptSections(rawOutput) : extractSections(rawOutput);
  if (baseSections.length) return baseSections;

  const text = meaningfulText(workflowOutput(rawOutput));
  return text ? [{ title: "Guidance", content: text }] : [];
}

function defaultAssessment(workflow: ContextWorkflow) {
  const assessments: Record<ContextWorkflow, string> = {
    general: "The strongest response is the one that turns this request into a clear creator decision, not just more options.",
    research: "The useful research angle is the one that changes what you create or how you position it. Facts without a creator decision are not enough.",
    strategy: "A strategy is only strong if it gives you a clear audience, platform focus, repeatable themes, and a way to learn from performance.",
    script: "The script should earn attention quickly, sustain curiosity, and deliver a concrete payoff. Anything that does not serve those jobs should be tightened.",
    production: "The production plan should make the creative idea easier to execute, not merely make it look more elaborate.",
    distribution: "Distribution should be designed around the audience's behavior and the objective of the content, not a generic posting calendar."
  };
  return assessments[workflow];
}

function defaultRecommendations(workflow: ContextWorkflow) {
  const recommendations: Record<ContextWorkflow, string[]> = {
    general: [
      "Choose the clearest creator objective before expanding the idea.",
      "Prefer one strong direction with a reason over a long list of equal options."
    ],
    research: [
      "Separate verified evidence from assumptions and creative hypotheses.",
      "Prioritize insights that can become a distinctive content angle."
    ],
    strategy: [
      "Commit to one primary audience and one primary platform for the first testing cycle.",
      "Build repeatable content pillars around audience problems, not broad subject labels."
    ],
    script: [
      "Strengthen the opening promise before adding more information.",
      "Use specific examples and pattern changes to protect retention."
    ],
    production: [
      "Design the shot plan around the minimum viable production that still communicates the idea clearly.",
      "Reserve visual complexity for the moments with the highest narrative value."
    ],
    distribution: [
      "Create platform-native packaging instead of reposting the same asset unchanged.",
      "Measure one primary outcome per post so the next iteration has a clear lesson."
    ]
  };
  return recommendations[workflow];
}

function outputSummary(rawOutput: unknown, userMessage: string) {
  const output = workflowOutput(rawOutput);
  const summary = cleanGeneratedText(meaningfulText(output.summary));
  if (summary && !summary.includes('"workflow_output"') && !summary.includes('"workflow_id"')) return summary;
  const firstSection = extractSections(rawOutput)[0];
  if (firstSection?.content) return firstSection.content;
  return `Here is my recommended direction for: ${userMessage}`;
}

function nextActionPrompt(workflow: ContextWorkflow) {
  const prompts: Record<ContextWorkflow, string | null> = {
    general: null,
    research: "I can turn this research into a focused content strategy next. Would you like me to do that?",
    strategy: "I can turn this strategy into a compelling script next. Would you like me to write it?",
    script: "I can turn this script into a practical production kit next. Would you like me to build it?",
    production: "I can build the posting strategy for this production next. Would you like me to continue?",
    distribution: "I can turn this into a ready-to-use posting calendar with platform-specific copy. Would you like me to do that?"
  };
  return prompts[workflow];
}

export class AdvisorLayer {
  transform(input: AdvisorLayerInput): AdvisorResponse {
    const executiveSummary = outputSummary(input.rawOutput, input.userMessage);
    const normalizedSummary = executiveSummary.trim().toLowerCase();
    const sections = workflowSpecificSections(input.workflow, input.rawOutput)
      .filter((section) => section.content?.trim().toLowerCase() !== normalizedSummary);
    const keyInsights = sections
      .flatMap((section) => section.bullets ?? [])
      .slice(0, 5);

    return {
      workflow: input.workflow,
      executiveSummary,
      assessment: defaultAssessment(input.workflow),
      recommendations: defaultRecommendations(input.workflow),
      keyInsights: keyInsights.length
        ? keyInsights
        : ["Focus the output on the audience decision, creative tradeoff, and measurable outcome."],
      sections,
      nextActionPrompt: nextActionPrompt(input.workflow)
    };
  }
}

export const advisorLayer = new AdvisorLayer();
