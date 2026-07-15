"use client";

import type { ReactNode } from "react";

export type WorkflowRenderResult = {
  advisor_markdown?: string;
  workflow_output?: {
    summary?: string;
    sections?: Array<{
      title?: string;
      content?: string;
      items?: string[];
    }>;
    next_steps?: string[];
    recommended_workflows?: Array<{
      title?: string;
      reason?: string;
    }>;
  };
  hooks?: string[];
  title_suggestions?: string[];
  script_timeline?: Array<{
    time_range?: string;
    section_title?: string;
    content?: string;
  }>;
  hook?: string;
  pattern_interrupt?: string;
  main_script?: string;
  cta?: string;
};

const backendMetadataKeys = new Set([
  "workflow_id",
  "workflow_title",
  "conversation_id",
  "user_id",
  "message_id",
  "source_message_id",
  "context_snapshot",
  "memory_state",
  "metadata",
  "backend_tags",
  "token_count",
  "model",
  "parameters"
]);

const internalHeadings = new Set([
  "creator advisor guidance",
  "research advisory",
  "script advisory",
  "content strategy",
  "production direction",
  "posting strategy",
  "executive summary",
  "workflow output",
  "summary",
  "next step",
  "next steps",
  "next action",
  "next actions",
  "recommended workflow",
  "recommended workflows",
  "what i would do next",
  "answer",
  "response",
  "guidance",
  "generated content",
  "generated content or guidance",
  "helpful details"
]);

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bullets(items: unknown) {
  if (!Array.isArray(items)) return "";
  return items
    .map(cleanText)
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
}

function removeMetadataLines(markdown: string) {
  return markdown
    .replace(/^```(?:markdown|md|json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(
      /(?:^|\n)#{1,6}\s*(?:Next Steps?|Next Actions?|Recommended Workflows?|What I Would Do Next)\s*\n[\s\S]*?(?=\n#{1,6}\s|$)/gi,
      "\n"
    )
    .split("\n")
    .filter((line) => {
      const normalized = line
        .trim()
        .replace(/^#{1,6}\s*/, "")
        .replace(/^[-*]\s*/, "")
        .replace(/^["']+|["'],?$/g, "")
        .toLowerCase();
      if (internalHeadings.has(normalized)) return false;
      return !Array.from(backendMetadataKeys).some((key) =>
        normalized.startsWith(`${key}:`)
        || normalized.startsWith(`${key}=`)
        || normalized.startsWith(`"${key}":`)
        || normalized.startsWith(`${key.replace(/_/g, " ")}:`)
      );
    })
    .join("\n")
    .replace(/^\s*[>#*]+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeJsonMarkdown(value: unknown, headingLevel = 2): string {
  if (typeof value === "string") return removeMetadataLines(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "string" ? `- ${item}` : safeJsonMarkdown(item, headingLevel))
      .filter(Boolean)
      .join("\n");
  }
  if (!value || typeof value !== "object") return "";

  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !backendMetadataKeys.has(key.toLowerCase()))
    .map(([key, nested]) => {
      const title = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      const body = safeJsonMarkdown(nested, Math.min(headingLevel + 1, 3));
      return body ? `${"#".repeat(headingLevel)} ${title}\n\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

export function workflowResultToMarkdown(
  result: WorkflowRenderResult | undefined,
  fallbackContent = ""
) {
  if (result?.advisor_markdown?.trim()) {
    return removeMetadataLines(result.advisor_markdown);
  }

  const output = result?.workflow_output;
  if (output) {
    const parts: string[] = [];
    if (output.summary?.trim()) parts.push(output.summary.trim());

    for (const section of output.sections ?? []) {
      const content = [cleanText(section.content), bullets(section.items)].filter(Boolean).join("\n\n");
      if (!content) continue;
      const title = cleanText(section.title);
      parts.push(title ? `## ${title}\n\n${content}` : content);
    }

    return removeMetadataLines(parts.join("\n\n"));
  }

  if (result?.main_script || result?.hook || result?.pattern_interrupt || result?.cta) {
    return removeMetadataLines([
      result.hook ? `## Hook\n\n${result.hook}` : "",
      result.pattern_interrupt ? `## Pattern Interrupt\n\n${result.pattern_interrupt}` : "",
      result.main_script ? `## Script\n\n${result.main_script}` : "",
      result.cta ? `## Call to Action\n\n${result.cta}` : ""
    ].filter(Boolean).join("\n\n"));
  }

  const scriptParts: string[] = [];
  if (result?.hooks?.length) scriptParts.push(`## Hooks\n\n${bullets(result.hooks)}`);
  if (result?.title_suggestions?.length) scriptParts.push(`## Title Options\n\n${bullets(result.title_suggestions)}`);
  for (const section of result?.script_timeline ?? []) {
    const title = [cleanText(section.time_range), cleanText(section.section_title)].filter(Boolean).join(" - ");
    const content = cleanText(section.content);
    if (content) scriptParts.push(`${title ? `## ${title}\n\n` : ""}${content}`);
  }
  if (scriptParts.length) return removeMetadataLines(scriptParts.join("\n\n"));

  const parsed = parseJsonContent(fallbackContent);
  return parsed
    ? removeMetadataLines(safeJsonMarkdown(parsed))
    : removeMetadataLines(fallbackContent);
}

export function WorkflowRenderer({
  result,
  content,
  renderMarkdown
}: {
  result?: WorkflowRenderResult;
  content?: string;
  renderMarkdown: (markdown: string) => ReactNode;
}) {
  const markdown = workflowResultToMarkdown(result, content);
  if (!markdown) return null;
  return <>{renderMarkdown(markdown)}</>;
}
