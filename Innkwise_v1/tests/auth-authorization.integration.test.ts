import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { verifyKnowledgeOwnership } from "../lib/auth/authorization";
import { ForbiddenError } from "../lib/auth/errors";

const shouldRun = process.env.RUN_AUTH_INTEGRATION_TESTS === "true";
const baseUrl = process.env.AUTH_TEST_BASE_URL ?? "http://localhost:3000";
const validToken = process.env.AUTH_TEST_VALID_TOKEN;
const secondUserToken = process.env.AUTH_TEST_SECOND_USER_TOKEN;
const validUserId = process.env.AUTH_TEST_VALID_USER_ID;
const otherUserConversationId = process.env.AUTH_TEST_OTHER_USER_CONVERSATION_ID;
const otherUserKnowledgeSourceId = process.env.AUTH_TEST_OTHER_USER_KNOWLEDGE_SOURCE_ID;
const otherUserLibraryItemId = process.env.AUTH_TEST_OTHER_USER_LIBRARY_ITEM_ID;

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test("protected APIs reject missing sessions", { skip: !shouldRun }, async () => {
  const response = await request("/api/conversations");
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("protected APIs reject expired JWTs", {
  skip: !shouldRun || !process.env.JWT_SECRET
}, async () => {
  const expiredToken = jwt.sign(
    { sub: "00000000-0000-4000-8000-000000000000", email: "expired@example.com" },
    process.env.JWT_SECRET as string,
    { expiresIn: "-1s" }
  );

  const response = await request("/api/conversations", {
    headers: authHeaders(expiredToken)
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("protected APIs accept a valid authenticated session", {
  skip: !shouldRun || !validToken
}, async () => {
  const response = await request("/api/conversations", {
    headers: authHeaders(validToken as string)
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.conversations));
});

test("users cannot access another user's conversation", {
  skip: !shouldRun || !validToken || !otherUserConversationId
}, async () => {
  const response = await request(`/api/chat-history?conversationId=${otherUserConversationId}`, {
    headers: authHeaders(validToken as string)
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "FORBIDDEN");
});

test("users cannot mutate another user's library item", {
  skip: !shouldRun || !validToken || !otherUserLibraryItemId
}, async () => {
  const response = await request("/api/library-items", {
    method: "PATCH",
    headers: authHeaders(validToken as string),
    body: JSON.stringify({
      id: otherUserLibraryItemId,
      isFavorite: true
    })
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "FORBIDDEN");
});

test("users cannot access another user's knowledge source", {
  skip: !shouldRun || !validUserId || !otherUserKnowledgeSourceId
}, async () => {
  await assert.rejects(
    () => verifyKnowledgeOwnership(validUserId as string, otherUserKnowledgeSourceId as string),
    (error) => error instanceof ForbiddenError
  );
});

test("second user token can load its own protected conversation list", {
  skip: !shouldRun || !secondUserToken
}, async () => {
  const response = await request("/api/conversations", {
    headers: authHeaders(secondUserToken as string)
  });

  assert.equal(response.status, 200);
});
