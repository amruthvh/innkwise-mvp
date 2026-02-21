export const scriptSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hooks: {
      type: "array",
      items: { type: "string" }
    },
    title_suggestions: {
      type: "array",
      items: { type: "string" }
    },
    thumbnail_text: {
      type: "array",
      items: { type: "string" }
    },
    script: {
      type: "object",
      additionalProperties: false,
      properties: {
        pattern_interrupt: { type: "string" },
        problem_setup: { type: "string" },
        psychological_explanation: { type: "string" },
        case_study: { type: "string" },
        practical_steps: { type: "string" },
        engagement_trigger: { type: "string" },
        cta: { type: "string" }
      },
      required: [
        "pattern_interrupt",
        "problem_setup",
        "psychological_explanation",
        "case_study",
        "practical_steps",
        "engagement_trigger",
        "cta"
      ]
    },
    retention_improvement_tips: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["hooks", "script"]
} as const;

export type GeneratedScript = {
  hooks: string[];
  title_suggestions?: string[];
  thumbnail_text?: string[];
  script: {
    pattern_interrupt: string;
    problem_setup: string;
    psychological_explanation: string;
    case_study: string;
    practical_steps: string;
    engagement_trigger: string;
    cta: string;
  };
  retention_improvement_tips?: string[];
};
