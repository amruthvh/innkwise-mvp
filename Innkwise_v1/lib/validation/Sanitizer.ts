const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type SanitizedText = {
  value: string;
  removedInvisibleChars: number;
};

export class Sanitizer {
  sanitizeText(value: unknown): SanitizedText {
    const raw = typeof value === "string" ? value : "";
    const normalized = raw
      .normalize("NFKC")
      .replace(/\r\n?/g, "\n");
    const invisibleMatches = normalized.match(ZERO_WIDTH_PATTERN) ?? [];
    const withoutInvisible = normalized
      .replace(ZERO_WIDTH_PATTERN, "")
      .replace(CONTROL_PATTERN, "");
    const collapsed = withoutInvisible
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      value: collapsed,
      removedInvisibleChars: invisibleMatches.length
    };
  }

  sanitizeShortText(value: unknown) {
    return this.sanitizeText(value).value.replace(/\s+/g, " ").trim();
  }
}

export const sanitizer = new Sanitizer();
