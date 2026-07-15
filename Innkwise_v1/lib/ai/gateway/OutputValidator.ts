import type { ContextWorkflow } from "@/backend/context/context-engine";
import type { OutputValidationResult } from "@/lib/ai/gateway/GatewayTypes";

const requiredSections: Partial<Record<ContextWorkflow, string[]>> = {
  research: ["Executive Summary", "Key Insights", "Research Findings", "Recommendations"],
  script: ["Hook", "Outline", "Script", "CTA"],
  production: ["Creative Direction", "Shot List", "Editing Notes"],
  distribution: ["Titles", "Description", "SEO", "Publishing Plan"]
};

const synonyms: Record<string, string[]> = {
  "Executive Summary": ["summary", "topic overview", "overview"],
  "Key Insights": ["key insights", "key findings", "findings"],
  "Research Findings": ["research findings", "evidence", "caveats"],
  "Recommendations": ["recommendations", "creator content angles", "next steps"],
  "Hook": ["hook", "hooks"],
  "Outline": ["outline", "timeline", "script_timeline", "script sections"],
  "Script": ["script", "main_script", "content"],
  "CTA": ["cta", "call to action"],
  "Creative Direction": ["creative direction", "scene notes", "visual style"],
  "Shot List": ["shot list", "shots"],
  "Editing Notes": ["editing notes", "editing plan"],
  "Titles": ["titles", "captions and titles", "title"],
  "Description": ["description", "caption", "primary post package"],
  "SEO": ["seo", "keywords", "metadata"],
  "Publishing Plan": ["publishing plan", "posting sequence", "repurposing plan"]
};

export class OutputValidator {
  validate(workflow: ContextWorkflow, output: string): OutputValidationResult {
    const trimmed = output.trim();
    if (!trimmed) {
      return {
        valid: false,
        missingSections: requiredSections[workflow] ?? [],
        reason: "Empty model output.",
        retryable: true
      };
    }

    if (workflow === "general" || workflow === "strategy") {
      return {
        valid: true,
        missingSections: [],
        retryable: false
      };
    }

    const required = requiredSections[workflow] ?? [];
    if (!required.length) {
      return {
        valid: true,
        missingSections: [],
        retryable: false
      };
    }

    const normalized = trimmed.toLowerCase();
    const missingSections = required.filter((section) => {
      const candidates = synonyms[section] ?? [section];
      return !candidates.some((candidate) => normalized.includes(candidate.toLowerCase()));
    });

    return {
      valid: missingSections.length === 0,
      missingSections,
      reason: missingSections.length ? `Missing sections: ${missingSections.join(", ")}` : undefined,
      retryable: missingSections.length > 0
    };
  }
}

export const outputValidator = new OutputValidator();
