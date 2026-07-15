import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../database/prisma/client";
import { rateLimiter } from "../lib/rate-limit/RateLimiter";
import { RateLimitError } from "../lib/rate-limit/RateLimitErrors";
import { getDailyWindow } from "../lib/rate-limit/UsageTracker";

const shouldRun = process.env.RUN_RATE_LIMIT_INTEGRATION_TESTS === "true";
const freeUserId = process.env.RATE_LIMIT_TEST_FREE_USER_ID;
const proUserId = process.env.RATE_LIMIT_TEST_PRO_USER_ID;
const adminUserId = process.env.RATE_LIMIT_TEST_ADMIN_USER_ID;

async function setUsage(userId: string, metric: string, count: number) {
  const window = getDailyWindow();
  await prisma.$executeRaw`
    insert into public.usage (user_id, period_key, period_start, metric, count, credits_used, metadata)
    values (${userId}::uuid, ${window.periodKey}, ${window.periodStart}::date, ${metric}, ${count}, 0, '{}'::jsonb)
    on conflict (user_id, period_key, metric) do update set
      count = excluded.count,
      updated_at = now()
  `;
}

test("free user is allowed within daily AI generation limit", {
  skip: !shouldRun || !freeUserId
}, async () => {
  await setUsage(freeUserId as string, "ai_generation", 0);
  const quota = await rateLimiter.checkQuota({
    userId: freeUserId as string,
    operation: "chat_generation",
    prompt: "Create a short video idea about learning faster."
  });

  assert.equal(quota.plan, "free");
  assert.equal(quota.remaining.generations, 20);
});

test("free user exceeding generation limit receives friendly error", {
  skip: !shouldRun || !freeUserId
}, async () => {
  await setUsage(freeUserId as string, "ai_generation", 20);
  await assert.rejects(
    () => rateLimiter.checkQuota({
      userId: freeUserId as string,
      operation: "script_generation",
      prompt: "Generate a script."
    }),
    (error) => error instanceof RateLimitError && error.code === "RATE_LIMIT_EXCEEDED"
  );
});

test("pro user receives higher quota", {
  skip: !shouldRun || !proUserId
}, async () => {
  await setUsage(proUserId as string, "ai_generation", 20);
  const quota = await rateLimiter.checkQuota({
    userId: proUserId as string,
    operation: "research_generation",
    prompt: "Research a topic."
  });

  assert.equal(quota.plan, "pro");
  assert.equal(quota.remaining.generations, 480);
});

test("admin user has unlimited quota", {
  skip: !shouldRun || !adminUserId
}, async () => {
  const quota = await rateLimiter.checkQuota({
    userId: adminUserId as string,
    operation: "strategy_generation",
    prompt: "Plan a content strategy."
  });

  assert.equal(quota.plan, "admin");
  assert.equal(quota.remaining.generations, "unlimited");
});

test("prompt too large is rejected", {
  skip: !shouldRun || !freeUserId
}, async () => {
  await assert.rejects(
    () => rateLimiter.checkQuota({
      userId: freeUserId as string,
      operation: "chat_generation",
      prompt: "x".repeat(10_001)
    }),
    (error) => error instanceof RateLimitError && error.code === "PROMPT_TOO_LARGE"
  );
});

test("upload limit exceeded is rejected", {
  skip: !shouldRun || !freeUserId
}, async () => {
  await setUsage(freeUserId as string, "upload", 5);
  await assert.rejects(
    () => rateLimiter.checkQuota({
      userId: freeUserId as string,
      operation: "file_upload",
      prompt: "video-plan.pdf"
    }),
    (error) => error instanceof RateLimitError && error.code === "RATE_LIMIT_EXCEEDED"
  );
});

test("abuse detection temporarily blocks burst requests", {
  skip: !shouldRun || !freeUserId
}, async () => {
  await setUsage(freeUserId as string, "ai_generation", 0);
  let blocked = false;

  for (let i = 0; i < 55; i += 1) {
    try {
      await rateLimiter.checkQuota({
        userId: freeUserId as string,
        operation: "chat_generation",
        prompt: `Burst request ${i}`
      });
    } catch (error) {
      blocked = error instanceof RateLimitError && error.code === "TEMPORARILY_BLOCKED";
      break;
    }
  }

  assert.equal(blocked, true);
});
