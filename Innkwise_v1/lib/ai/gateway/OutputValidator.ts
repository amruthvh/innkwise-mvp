import type { ContextWorkflow } from "@/backend/context/context-engine";
import type { OutputValidationResult } from "@/lib/ai/gateway/GatewayTypes";

const requiredSections: Partial<Record<ContextWorkflow, string[]>> = {
  research: ["Topic Overview", "Key Findings", "Evidence and Caveats", "Creator Content Angles"],
  script: ["Hook", "Script", "CTA"],
  production: ["Shot List", "Scene Notes", "Asset Checklist", "Editing Plan"],
  distribution: ["Primary Post Package", "Repurposing Plan", "Captions and Titles", "Posting Sequence"]
};

const synonyms: Record<string, string[]> = {
  "Executive Summary": ["summary", "topic overview", "overview"],
  "Topic Overview": ["topic overview", "overview", "summary"],
  "Key Insights": ["key insights", "key findings", "findings"],
  "Key Findings": ["key findings", "findings", "insights"],
  "Research Findings": ["research findings", "evidence", "caveats"],
  "Evidence and Caveats": ["evidence and caveats", "evidence", "caveats", "uncertainty"],
  "Creator Content Angles": ["creator content angles", "content angles", "angles"],
  "Recommendations": ["recommendations", "creator content angles", "next steps"],
  "Hook": ["hook", "hooks"],
  "Outline": ["outline", "timeline", "script_timeline", "script sections"],
  "Script": ["script", "main_script", "content"],
  "CTA": ["cta", "call to action"],
  "Creative Direction": ["creative direction", "scene notes", "visual style"],
  "Shot List": ["shot list", "shots"],
  "Scene Notes": ["scene notes", "scene direction", "visual style"],
  "Asset Checklist": ["asset checklist", "assets", "checklist"],
  "Editing Notes": ["editing notes", "editing plan"],
  "Editing Plan": ["editing plan", "editing notes"],
  "Titles": ["titles", "captions and titles", "title"],
  "Primary Post Package": ["primary post package", "post package", "packaging"],
  "Repurposing Plan": ["repurposing plan", "repurposing"],
  "Captions and Titles": ["captions and titles", "titles", "captions"],
  "Posting Sequence": ["posting sequence", "publishing plan", "publishing sequence"],
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
