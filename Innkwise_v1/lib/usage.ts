import { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PLAN_LIMITS: Record<Plan, number> = {
  FREE: 3,
  CREATOR: 20,
  PRO: Number.POSITIVE_INFINITY
};

export function getCurrentMonthKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function assertUsageAvailable(userId: string, planType: Plan): Promise<void> {
  if (planType === "PRO") return;

  const month = getCurrentMonthKey();
  const usage = await prisma.usage.findUnique({
    where: { userId_month: { userId, month } }
  });

  const currentCount = usage?.count ?? 0;
  const limit = PLAN_LIMITS[planType];

  if (currentCount >= limit) {
    throw new Error(`Usage limit reached for ${planType}.`);
  }
}

export async function incrementUsage(userId: string): Promise<void> {
  const month = getCurrentMonthKey();

  await prisma.usage.upsert({
    where: { userId_month: { userId, month } },
    update: { count: { increment: 1 } },
    create: { userId, month, count: 1 }
  });
}
