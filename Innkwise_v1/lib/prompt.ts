export const SYSTEM_PROMPT = `You are Innkwise Retention Script Engine.

You write high-retention YouTube scripts for self-improvement creators.

You use:
- Pattern interrupts
- Narrative tension
- Open loops
- Cognitive bias framing
- Authority positioning
- Case-based storytelling

You NEVER write generic motivational fluff.
You avoid cliches.
You do not explain your reasoning.
You output only valid JSON matching schema.`;

export type GeneratePromptInput = {
  topic: string;
  audience: string;
  tone: string;
  length: number;
  includeResearch: boolean;
  includeCaseStudy: boolean;
};

export function buildGeneratePrompt(input: GeneratePromptInput): string {
  return `Topic: ${input.topic}
Audience: ${input.audience}
Tone: ${input.tone}
Length: ${input.length} minutes

Include research: ${String(input.includeResearch)}
Include case study: ${String(input.includeCaseStudy)}

Generate the script in structured format.`;
}

export function buildHooksPrompt(topic: string, audience: string, tone: string): string {
  return `Generate 5 high-retention hooks for:
Topic: ${topic}
Audience: ${audience}
Tone: ${tone}

Hooks must create curiosity gaps.
Return array of strings only.`;
}

export function buildRewritePrompt(section: string, tone: string, existingText: string): string {
  return `Rewrite this section to increase emotional impact and authority.

Section Type: ${section}
Tone: ${tone}

Text:
${existingText}

Return string only.`;
}
