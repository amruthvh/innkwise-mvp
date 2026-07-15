import { createHash } from "crypto";
import { fetchCreatorProfile } from "@/backend/context/context-engine";
import { mergeCreatorMemory } from "@/backend/creator-os/crud-service";
import type { JsonObject, JsonValue } from "@/shared/types/creator-os";

export type CreatorMemoryType =
  | "creator_type"
  | "audience"
  | "goals"
  | "platforms"
  | "content_pillars"
  | "writing_preferences"
  | "brand_voice";

export type CreatorMemory = {
  type: CreatorMemoryType;
  value: string | string[];
  confidence: number;
  source: "user_message";
  durable: true;
};

export type MemoryDetectionResult = {
  memories: CreatorMemory[];
  confidence: number;
  hasMemory: boolean;
  transient: boolean;
  saved: boolean;
  acknowledgement: string | null;
  metadata: JsonObject;
};

const platforms = ["youtube", "instagram", "tiktok", "linkedin", "x", "twitter", "blog", "newsletter", "podcast"];

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "").slice(0, 240);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function durableMessage(message: string) {
  return /\b(my|our|i am|i'm|i make|i create|i help|i serve|i post|i publish|i prefer|my goal|my audience|my brand|my voice)\b/i.test(message);
}

function transientMessage(message: string) {
  return /\b(today|tomorrow|this week|this video|this post|this script|right now|for now)\b/i.test(message)
    || /^(write|generate|create|make|research|plan)\b/i.test(message.trim());
}

function addMemory(
  memories: CreatorMemory[],
  type: CreatorMemoryType,
  value: string | string[],
  confidence: number
) {
  const normalizedValue = Array.isArray(value) ? unique(value) : clean(value);
  if (Array.isArray(normalizedValue) ? normalizedValue.length === 0 : normalizedValue.length < 2) return;
  const duplicate = memories.some((memory) =>
    memory.type === type && JSON.stringify(memory.value) === JSON.stringify(normalizedValue)
  );
  if (duplicate) return;
  memories.push({
    type,
    value: normalizedValue,
    confidence,
    source: "user_message",
    durable: true
  });
}

function extractPlatforms(message: string) {
  const normalized = message.toLowerCase();
  return unique(platforms.filter((platform) => normalized.includes(platform)));
}

function extractMemories(message: string): CreatorMemory[] {
  const memories: CreatorMemory[] = [];

  const educationalCreator = message.match(/\bi\s+(?:make|create)\s+educational\s+(?:videos|content)/i);
  if (educationalCreator) addMemory(memories, "creator_type", "educational creator", 0.94);

  const creatorType = message.match(/\bi\s+(?:am|'m)\s+(?:a|an)\s+([^.!?\n]+)/i);
  if (creatorType?.[1]) addMemory(memories, "creator_type", creatorType[1], 0.88);

  const audiencePatterns = [
    /\bmy\s+(?:target\s+)?audience\s+is\s+([^.!?\n]+)/i,
    /\bi\s+(?:make|create)\s+[^.!?\n]*?\s+for\s+([^.!?\n]+?)(?:\s+on\s+|$)/i,
    /\bi\s+(?:help|serve)\s+([^.!?\n]+)/i
  ];
  for (const pattern of audiencePatterns) {
    const match = message.match(pattern);
    if (match?.[1]) addMemory(memories, "audience", match[1], 0.92);
  }

  const goalPatterns = [
    /\bmy\s+(?:primary\s+)?goal\s+is\s+([^.!?\n]+)/i,
    /\bmy\s+goals\s+are\s+([^.!?\n]+)/i,
    /\bi\s+want\s+to\s+(grow|build|sell|launch|generate|increase|become)\s+([^.!?\n]+)/i
  ];
  for (const pattern of goalPatterns) {
    const match = message.match(pattern);
    if (match) addMemory(memories, "goals", match.slice(1).filter(Boolean).join(" "), 0.86);
  }

  const detectedPlatforms = extractPlatforms(message);
  if (detectedPlatforms.length && /\b(on|platform|post|publish|use)\b/i.test(message)) {
    addMemory(memories, "platforms", detectedPlatforms, 0.94);
  }

  const pillarPatterns = [
    /\bmy\s+content\s+pillars\s+are\s+([^.!?\n]+)/i,
    /\bmy\s+niche\s+is\s+([^.!?\n]+)/i,
    /\bi\s+create\s+content\s+about\s+([^.!?\n]+)/i
  ];
  for (const pattern of pillarPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) addMemory(memories, "content_pillars", match[1], 0.9);
  }

  const writingPatterns = [
    /\bi\s+prefer\s+([^.!?\n]+?)\s+(?:writing|style|tone)/i,
    /\bmy\s+writing\s+style\s+is\s+([^.!?\n]+)/i,
    /\bi\s+like\s+content\s+that\s+is\s+([^.!?\n]+)/i
  ];
  for (const pattern of writingPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) addMemory(memories, "writing_preferences", match[1], 0.86);
  }

  const voicePatterns = [
    /\bmy\s+brand\s+voice\s+is\s+([^.!?\n]+)/i,
    /\bmy\s+voice\s+is\s+([^.!?\n]+)/i,
    /\bi\s+want\s+to\s+sound\s+([^.!?\n]+)/i
  ];
  for (const pattern of voicePatterns) {
    const match = message.match(pattern);
    if (match?.[1]) addMemory(memories, "brand_voice", match[1], 0.9);
  }

  return memories;
}

function memoryKey(memory: CreatorMemory) {
  return createHash("sha1")
    .update(`${memory.type}:${JSON.stringify(memory.value).toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}

function valuesFromJson(value: JsonValue | undefined): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => valuesFromJson(item));
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => valuesFromJson(item));
  }
  return [];
}

function buildAcknowledgement(memories: CreatorMemory[]) {
  if (!memories.length) return null;
  const labels: Record<CreatorMemoryType, string> = {
    creator_type: "Creator type",
    audience: "Audience",
    goals: "Goals",
    platforms: "Platforms",
    content_pillars: "Content pillars",
    writing_preferences: "Writing preferences",
    brand_voice: "Brand voice"
  };

  return [
    "Great. I've updated your creator profile.",
    "",
    ...memories.flatMap((memory) => [
      `**${labels[memory.type]}**`,
      Array.isArray(memory.value)
        ? memory.value.map((value) => value.replace(/\b\w/g, (letter) => letter.toUpperCase())).join(", ")
        : memory.value,
      ""
    ]),
    "I'll use this information to personalize future strategies, scripts, production kits, and posting plans."
  ].join("\n").trim();
}

function asJsonArray(values: string[]): JsonValue {
  return values as JsonValue;
}

function jsonObject(value: JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export class MemoryManager {
  detect(message: string): MemoryDetectionResult {
    const normalized = message.trim();
    const transient = transientMessage(normalized) && !durableMessage(normalized);
    const memories = transient || !durableMessage(normalized) ? [] : extractMemories(normalized);
    const confidence = memories.length
      ? Math.max(...memories.map((memory) => memory.confidence))
      : 0;

    return {
      memories,
      confidence,
      hasMemory: memories.length > 0,
      transient,
      saved: false,
      acknowledgement: null,
      metadata: {
        detector: "memory-manager-v1",
        analyzedAt: new Date().toISOString(),
        durableOnly: true
      }
    };
  }

  async detectAndStore(input: { userId: string; message: string }): Promise<MemoryDetectionResult> {
    const detection = this.detect(input.message);
    if (!detection.hasMemory || detection.confidence < 0.65) return detection;

    const existing = await fetchCreatorProfile(input.userId);
    const byType = detection.memories.reduce((map, memory) => {
      const values = Array.isArray(memory.value) ? memory.value : [memory.value];
      map[memory.type] = unique([...(map[memory.type] ?? []), ...values]);
      return map;
    }, {} as Partial<Record<CreatorMemoryType, string[]>>);

    const existingPlatforms = valuesFromJson(existing?.platformPreferences).filter((value) =>
      platforms.includes(value.toLowerCase())
    );
    const existingMemoryManager = jsonObject(existing?.memory.memoryManager);
    const existingDurableFacts = jsonObject(existingMemoryManager.durableFacts);
    const durableFacts = detection.memories.reduce((facts, memory) => {
      facts[memoryKey(memory)] = {
        type: memory.type,
        value: memory.value,
        confidence: memory.confidence,
        source: memory.source,
        durable: true,
        savedAt: new Date().toISOString()
      };
      return facts;
    }, { ...existingDurableFacts } as JsonObject);
    const existingGoals = valuesFromJson(existing?.goals.detectedGoals);
    const existingAudience = valuesFromJson(existing?.audience.detectedAudience);
    const existingPillars = valuesFromJson(existing?.niche.contentPillars);
    const existingWritingPreferences = valuesFromJson(existing?.writingPreferences.detectedPreferences);
    const existingBrandVoice = valuesFromJson(existing?.writingPreferences.brandVoice);
    const existingCreatorTypes = valuesFromJson(existing?.memory.creatorType);

    await mergeCreatorMemory({
      userId: input.userId,
      goals: byType.goals?.length
        ? { detectedGoals: asJsonArray(unique([...existingGoals, ...byType.goals])) }
        : undefined,
      niche: byType.content_pillars?.length
        ? { contentPillars: asJsonArray(unique([...existingPillars, ...byType.content_pillars])) }
        : undefined,
      audience: byType.audience?.length
        ? { detectedAudience: asJsonArray(unique([...existingAudience, ...byType.audience])) }
        : undefined,
      platformPreferences: byType.platforms?.length
        ? { detectedPlatforms: asJsonArray(unique([...existingPlatforms, ...byType.platforms])) }
        : undefined,
      writingPreferences: {
        ...(byType.writing_preferences?.length
          ? { detectedPreferences: asJsonArray(unique([...existingWritingPreferences, ...byType.writing_preferences])) }
          : {}),
        ...(byType.brand_voice?.length
          ? { brandVoice: asJsonArray(unique([...existingBrandVoice, ...byType.brand_voice])) }
          : {})
      },
      memory: {
        memoryManager: {
          version: "memory-manager-v1",
          lastDetectionAt: new Date().toISOString(),
          confidence: detection.confidence,
          durableFacts
        },
        ...(byType.creator_type?.length
          ? { creatorType: asJsonArray(unique([...existingCreatorTypes, ...byType.creator_type])) }
          : {})
      }
    });

    return {
      ...detection,
      saved: true,
      acknowledgement: buildAcknowledgement(detection.memories)
    };
  }
}

export const memoryManager = new MemoryManager();
