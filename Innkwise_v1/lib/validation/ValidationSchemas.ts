import { z } from "zod";
import { sanitizer } from "@/lib/validation/Sanitizer";

export const uuidSchema = z.string().uuid();

export const workflowSchema = z.enum([
  "general",
  "research",
  "strategy",
  "script",
  "production",
  "distribution",
  "posting"
]);

export const attachmentSchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(150).optional(),
  size: z.number().int().nonnegative().optional(),
  url: z.string().max(2048).optional(),
  contentBase64: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();

export const chatRequestSchema = z.object({
  prompt: z.string(),
  workflowType: workflowSchema.default("general"),
  conversationId: uuidSchema.nullish(),
  attachments: z.array(attachmentSchema).max(5).default([])
}).strict();

const cleanString = (max: number) => z.preprocess(
  (value) => sanitizer.sanitizeShortText(value),
  z.string().max(max)
);

const cleanLongString = (max: number) => z.preprocess(
  (value) => sanitizer.sanitizeText(value).value,
  z.string().max(max)
);

const scoreSchema = z.number().min(0).max(100);

export const creatorProfileSchema = z.object({
  creatorName: cleanString(120).optional(),
  brandName: cleanString(120).optional(),
  tagline: cleanString(200).optional(),
  creatorBio: cleanLongString(2000).optional(),
  experienceLevel: z.enum(["Beginner", "Intermediate", "Advanced", "Professional", "Agency"]).optional(),
  creatorArchetypes: z.array(cleanString(60)).max(10).optional()
}).strict();

export const personalizationSchema = z.object({
  creatorProfile: creatorProfileSchema.optional(),
  audience: z.object({
    age: cleanString(120).optional(),
    geography: cleanString(160).optional(),
    language: cleanString(80).optional(),
    education: cleanString(160).optional(),
    interests: z.array(cleanString(120)).max(30).optional(),
    problems: z.array(cleanString(200)).max(30).optional(),
    aspirations: z.array(cleanString(200)).max(30).optional()
  }).strict().optional(),
  goals: z.object({
    primaryGoal: cleanString(120).optional(),
    secondaryGoals: z.array(cleanString(120)).max(12).optional(),
    priorityScores: z.record(z.string(), scoreSchema).optional()
  }).strict().optional(),
  tone: cleanString(80).optional(),
  platform: z.enum(["YouTube", "Instagram", "TikTok", "LinkedIn", "X", "Blogs", "Newsletter", "Podcast"]).optional(),
  contentPillars: z.array(cleanString(160)).max(10).optional(),
  writingPreferences: z.object({
    complexity: scoreSchema.optional(),
    tone: scoreSchema.optional(),
    length: scoreSchema.optional(),
    humor: scoreSchema.optional(),
    researchDepth: scoreSchema.optional(),
    persuasion: scoreSchema.optional(),
    storytelling: scoreSchema.optional(),
    originality: scoreSchema.optional()
  }).strict().optional()
}).strict();
