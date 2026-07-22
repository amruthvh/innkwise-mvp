import type { ContextAssembly } from "@/backend/context/context-engine";
import type { RankedContext, RankedContextItem } from "@/lib/context/context-ranking-engine";
import { estimateTextTokens, tokenChars, type WorkflowTokenBudget } from "@/lib/context/token-budget-engine";

export type CompressedContextResult = {
  prompt: string;
  estimatedTokens: number;
  budget: WorkflowTokenBudget;
  metadata: {
    included: Record<string, number>;
    dropped: Record<string, number>;
    compressed: boolean;
  };
};

function cleanText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/["']?workflow_id["']?\s*:\s*["']?[^,\n}]+["']?/gi, "")
    .replace(/["']?workflow_title["']?\s*:\s*["']?[^,\n}]+["']?/gi, "")
    .trim();
}

function trimToTokenBudget(text: string, maxTokens: number) {
  const maxChars = tokenChars(maxTokens);
  const cleaned = cleanText(text);
  if (estimateTextTokens(cleaned) <= maxTokens) return cleaned;
  return `${cleaned.slice(0, maxChars).trim()}...`;
}

function formatItem(item: RankedContextItem, maxTokens: number) {
  return `- ${item.label}: ${trimToTokenBudget(item.text, maxTokens)}`;
}

function addSection(input: {
  sections: string[];
  title: string;
  items: RankedContextItem[];
  itemTokenLimit: number;
  remainingTokens: number;
}): {
  included: RankedContextItem[];
  dropped: RankedContextItem[];
} {
  const lines: string[] = [];
  let localRemaining = input.remainingTokens;
  const included: RankedContextItem[] = [];
  const dropped: RankedContextItem[] = [];

  for (const item of input.items) {
    const line = formatItem(item, Math.min(input.itemTokenLimit, Math.max(80, localRemaining)));
    const cost = estimateTextTokens(line);
    if (cost <= localRemaining) {
      lines.push(line);
      localRemaining -= cost;
      included.push(item);
    } else {
      dropped.push(item);
    }
  }

  if (lines.length) {
    input.sections.push(`## ${input.title}\n${lines.join("\n")}`);
  }

  return {
    included,
    dropped
  };
}

function increment(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

export class ContextCompressionEngine {
  compress(context: ContextAssembly, ranked: RankedContext, budget: WorkflowTokenBudget): CompressedContextResult {
    const maxContextTokens = budget.maxContextTokens + budget.softExpansionTokens;
    let usedTokens = 0;
    const sections: string[] = [];
    const included: Record<string, number> = {};
    const dropped: Record<string, number> = {};
    const include = (item: RankedContextItem) => increment(included, item.kind);
    const drop = (item: RankedContextItem) => increment(dropped, item.kind);
    const remainingTokens = () => Math.max(0, maxContextTokens - usedTokens);

    const header = [
      "# Creator Context",
      `Active mode: ${context.workflow}`,
      `Current request: ${context.topic ?? "Not provided"}`
    ].join("\n");
    usedTokens += estimateTextTokens(header);
    sections.push(header);

    const addBudgetedSection = (
      title: string,
      items: RankedContextItem[],
      itemTokenLimit: number
    ) => {
      const before = usedTokens;
      const nextSections: string[] = [];
      const sectionResult = addSection({
        sections: nextSections,
        title,
        items,
        itemTokenLimit,
        remainingTokens: remainingTokens()
      });
      const text = nextSections.join("\n\n");
      usedTokens += estimateTextTokens(text);
      if (usedTokens <= maxContextTokens) {
        sections.push(text);
        sectionResult.included.forEach(include);
        sectionResult.dropped.forEach(drop);
        return;
      }
      usedTokens = before;
      for (const item of items) drop(item);
    };

    addBudgetedSection("Creator Preferences", ranked.creator.slice(0, 6), 140);
    addBudgetedSection("Durable Memories", ranked.memory.slice(0, 4), 120);
    addBudgetedSection("Relevant Knowledge", ranked.knowledge.slice(0, budget.knowledgeSourceLimit), 260);
    addBudgetedSection("Recent Conversation Signals", ranked.conversation.slice(0, budget.messagesPerConversation), 160);

    const prompt = sections.filter(Boolean).join("\n\n");
    return {
      prompt,
      estimatedTokens: estimateTextTokens(prompt),
      budget,
      metadata: {
        included,
        dropped,
        compressed: Object.values(dropped).some((count) => count > 0)
      }
    };
  }
}

export const contextCompressionEngine = new ContextCompressionEngine();
