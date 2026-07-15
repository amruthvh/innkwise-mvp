import type { ContextWorkflow } from "@/backend/context/context-engine";

export type WorkflowId = "creator-chat" | "research-topic" | "content-strategy" | "generate-script" | "production-kit" | "posting-strategy";

export type WorkflowTemplate = {
  id: WorkflowId;
  workflowType: ContextWorkflow;
  title: string;
  description: string;
  icon: "chat" | "search" | "strategy" | "script" | "production" | "distribution";
  systemPrompt: string;
  starterPrompt: string;
  suggestedInputs: string[];
  outputStructure: string[];
};

export const creatorChatTemplate: WorkflowTemplate = {
  id: "creator-chat",
  workflowType: "general",
  title: "Creator Chat",
  description: "Ask anything about content creation and get practical, context-aware guidance.",
  icon: "chat",
  systemPrompt:
    "Act as Innkwise Creator Chat: a practical creator operating system assistant. Answer the user's prompt directly and conversationally. If they ask for content, generate it immediately. Stay grounded in creator goals, audience, voice, knowledge, and recent context. Use headings only when they make a substantial answer easier to scan.",
  starterPrompt: "",
  suggestedInputs: ["Question", "Goal", "Platform", "Audience", "Current bottleneck"],
  outputStructure: []
};

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "research-topic",
    workflowType: "research",
    title: "Research a Topic",
    description: "Gather angles, audience questions, evidence, and source-backed context.",
    icon: "search",
    systemPrompt:
      "Build a substantive creator research brief. Explain the topic, surface meaningful findings, distinguish evidence from interpretation, identify audience questions and misconceptions, and convert the research into strong content angles. Use available knowledge sources when relevant. Never fabricate citations; clearly mark claims that require verification.",
    starterPrompt: "Research this topic for a creator audience: ",
    suggestedInputs: ["Topic", "Audience", "Platform", "Depth required", "Sources to prioritize"],
    outputStructure: ["Topic Overview", "Key Findings", "Audience Questions and Misconceptions", "Evidence and Caveats", "Creator Content Angles"]
  },
  {
    id: "content-strategy",
    workflowType: "strategy",
    title: "Plan Content Strategy",
    description: "Turn creator goals into pillars, angles, sequencing, and platform direction.",
    icon: "strategy",
    systemPrompt:
      "Create a complete, decision-ready content strategy grounded in the creator profile, audience, goals, platform preferences, and available knowledge. Define positioning, repeatable pillars, specific content angles, publishing rhythm, and measurable success criteria.",
    starterPrompt: "Plan a content strategy around: ",
    suggestedInputs: ["Goal", "Niche", "Audience", "Primary platform", "Time horizon"],
    outputStructure: ["Strategic objective", "Content pillars", "Angle map", "Publishing cadence", "Measurement plan"]
  },
  {
    id: "generate-script",
    workflowType: "script",
    title: "Generate Script",
    description: "Create a high-retention video script using creator voice and relevant knowledge.",
    icon: "script",
    systemPrompt:
      "Write a structured, high-retention script that fits the selected platform, audience, tone, creator voice, and retrieved context.",
    starterPrompt: "Generate a script about: ",
    suggestedInputs: ["Topic", "Audience", "Tone", "Length", "Format"],
    outputStructure: ["Hooks", "Title ideas", "Timeline", "Script sections", "CTA"]
  },
  {
    id: "production-kit",
    workflowType: "production",
    title: "Create Production Kit",
    description: "Convert an idea or script into shots, assets, thumbnail direction, and editing notes.",
    icon: "production",
    systemPrompt:
      "Create a complete, executable production kit with a sequenced shot list, scene direction, required assets, thumbnail concepts, editing notes, pacing, audio guidance, and practical production constraints.",
    starterPrompt: "Create a production kit for: ",
    suggestedInputs: ["Script or idea", "Platform", "Visual style", "Available resources", "Deadline"],
    outputStructure: ["Shot list", "Scene notes", "Asset checklist", "Thumbnail direction", "Editing plan"]
  },
  {
    id: "posting-strategy",
    workflowType: "distribution",
    title: "Build Posting Strategy",
    description: "Package finished content for reach, repurposing, distribution, and feedback loops.",
    icon: "distribution",
    systemPrompt:
      "Build a complete platform-specific posting strategy covering packaging, titles and captions, publishing sequence, repurposing, engagement actions, metrics, and iteration decisions.",
    starterPrompt: "Build a posting strategy for: ",
    suggestedInputs: ["Content idea", "Platform", "Goal", "Audience", "Launch window"],
    outputStructure: ["Primary post package", "Repurposing plan", "Captions and titles", "Posting sequence", "Metrics to watch"]
  }
];

export const workflowRegistry: WorkflowTemplate[] = [creatorChatTemplate, ...workflowTemplates];

export const defaultWorkflowId: WorkflowId = "creator-chat";

export function getWorkflowTemplate(id: string | null | undefined) {
  return workflowRegistry.find((template) => template.id === id) ?? creatorChatTemplate;
}

export function getWorkflowTemplateByType(workflowType: ContextWorkflow) {
  return workflowRegistry.find((template) => template.workflowType === workflowType) ?? getWorkflowTemplate(defaultWorkflowId);
}
