import crypto from "crypto";
import { prisma } from "@/lib/prisma";

type TrackUserEventInput = {
  userId?: string | null;
  email?: string | null;
  event: string;
  path?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function trackUserEvent({
  userId,
  email,
  event,
  path,
  metadata
}: TrackUserEventInput) {
  if (!event.trim()) return;

  await prisma.$executeRaw`
    INSERT INTO "UserEvent" ("id", "userId", "email", "event", "path", "metadata", "createdAt")
    VALUES (
      ${crypto.randomUUID()},
      ${userId || null},
      ${email || null},
      ${event},
      ${path || null},
      ${metadata ? JSON.stringify(metadata) : null}::jsonb,
      NOW()
    )
  `;
}
