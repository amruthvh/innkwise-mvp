import type { AdvisorResponse, AdvisorSection } from "@/lib/advisor/advisor-layer";

function cleanText(value: string | undefined) {
  return (value ?? "")
    .replace(/^```(?:markdown|md|json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function conciseDescription(value: string | undefined, maxSentences = 2) {
  const text = cleanText(value).replace(/\n{3,}/g, "\n\n");
  if (!text || text.includes("\n- ") || text.includes("\n1. ")) return text;

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return sentences.slice(0, maxSentences).map((sentence) => sentence.trim()).join(" ");
}

function formatBullets(items: string[] | undefined) {
  return (items ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
}

function formatTable(table: AdvisorSection["table"]) {
  if (!table?.headers.length || !table.rows.length) return "";
  const header = `| ${table.headers.join(" | ")} |`;
  const divider = `| ${table.headers.map(() => "---").join(" | ")} |`;
  const rows = table.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [header, divider, rows].join("\n");
}

function formatSection(section: AdvisorSection, workflow: AdvisorResponse["workflow"]) {
  const maxSentences = workflow === "general" ? 2 : 3;
  const body = [
    conciseDescription(section.content, maxSentences),
    formatBullets(section.bullets),
    section.callout ? `**Note:** ${section.callout.trim()}` : "",
    formatTable(section.table)
  ].filter(Boolean).join("\n\n");
  if (!body) return "";
  return section.title.trim() ? `## ${section.title}\n\n${body}` : body;
}

function conversationalOpening(workflow: AdvisorResponse["workflow"]) {
  const openings: Record<AdvisorResponse["workflow"], string> = {
    general: "Here’s the clearest way I’d approach this.",
    research: "Here’s what matters most for this topic.",
    strategy: "Here’s the strategy I’d use.",
    script: "Here’s the script direction I’d recommend.",
    production: "Here’s the production plan I’d use.",
    distribution: "Here’s the posting plan I’d use."
  };
  return openings[workflow];
}

function workflowSections(response: AdvisorResponse) {
  return response.sections
    .slice(0, 8)
    .map((section) => formatSection(section, response.workflow))
    .filter(Boolean);
}

export function formatAdvisorResponse(response: AdvisorResponse) {
  return [
    conversationalOpening(response.workflow),
    "",
    conciseDescription(response.executiveSummary),
    "",
    ...workflowSections(response),
    response.nextActionPrompt ? "" : null,
    response.nextActionPrompt
  ].filter((value): value is string => typeof value === "string" && value !== "").join("\n");
}

export class ResponseFormatter {
  format(response: AdvisorResponse) {
    return formatAdvisorResponse(response);
  }
}

export const responseFormatter = new ResponseFormatter();
