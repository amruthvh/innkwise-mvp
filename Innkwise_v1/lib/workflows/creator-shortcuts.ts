import type { ContextWorkflow } from "@/backend/context/context-engine";
import type { ClarificationField } from "@/lib/clarification/clarification-engine";
import type { WorkflowId, WorkflowTemplate } from "@/lib/workflows/registry";
import { getWorkflowTemplate, workflowTemplates } from "@/lib/workflows/registry";

export type CreatorShortcut = {
  id: Exclude<WorkflowId, "creator-chat">;
  workflow: ContextWorkflow;
  title: string;
  invocationPrompt: string;
  requiredContext: ClarificationField[];
  acceptsConversationContext: true;
};

const shortcutDefinitions: CreatorShortcut[] = [
  {
    id: "research-topic",
    workflow: "research",
    title: "Research a Topic",
    invocationPrompt: "Research a Topic",
    requiredContext: ["topic"],
    acceptsConversationContext: true
  },
  {
    id: "content-strategy",
    workflow: "strategy",
    title: "Plan Content Strategy",
    invocationPrompt: "Plan Content Strategy",
    requiredContext: ["audience", "platform", "goal"],
    acceptsConversationContext: true
  },
  {
    id: "generate-script",
    workflow: "script",
    title: "Generate Script",
    invocationPrompt: "Generate Script",
    requiredContext: ["topic", "audience", "platform", "content_format"],
    acceptsConversationContext: true
  },
  {
    id: "production-kit",
    workflow: "production",
    title: "Create Production Kit",
    invocationPrompt: "Create Production Kit",
    requiredContext: ["source_content", "platform", "content_format"],
    acceptsConversationContext: true
  },
  {
    id: "posting-strategy",
    workflow: "distribution",
    title: "Build Posting Strategy",
    invocationPrompt: "Build Posting Strategy",
    requiredContext: ["platform", "objective"],
    acceptsConversationContext: true
  }
];

export const creatorShortcuts = shortcutDefinitions;

export function getCreatorShortcut(id: string | null | undefined) {
  return creatorShortcuts.find((shortcut) => shortcut.id === id) ?? null;
}

export function getCreatorShortcutByWorkflow(workflow: ContextWorkflow) {
  return creatorShortcuts.find((shortcut) => shortcut.workflow === workflow) ?? null;
}

export function isShortcutInvocation(message: string, shortcut: CreatorShortcut | null) {
  if (!shortcut) return false;
  const normalized = message.trim().toLowerCase().replace(/[.!?]+$/, "");
  return normalized === shortcut.invocationPrompt.toLowerCase()
    || normalized === shortcut.title.toLowerCase();
}

export function getShortcutTemplate(shortcut: CreatorShortcut): WorkflowTemplate {
  return getWorkflowTemplate(shortcut.id);
}

export function getShortcutTemplates() {
  return workflowTemplates.map((template) => {
    const shortcut = getCreatorShortcut(template.id);
    return {
      ...template,
      starterPrompt: shortcut?.invocationPrompt ?? template.starterPrompt
    };
  });
}
