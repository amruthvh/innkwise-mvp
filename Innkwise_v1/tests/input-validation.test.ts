import assert from "node:assert/strict";
import test from "node:test";
import { attachmentValidator } from "../lib/validation/AttachmentValidator";
import { inputValidator } from "../lib/validation/InputValidator";
import { promptValidator } from "../lib/validation/PromptValidator";
import { urlValidator } from "../lib/validation/URLValidator";
import { InputValidationError } from "../lib/validation/ValidationErrors";
import { workflowValidator } from "../lib/validation/WorkflowValidator";

test("empty prompt is rejected", () => {
  assert.throws(
    () => promptValidator.validate("", "free"),
    (error) => error instanceof InputValidationError && error.code === "INVALID_PROMPT"
  );
});

test("whitespace-only prompt is rejected", () => {
  assert.throws(
    () => promptValidator.validate("     \n\t   ", "free"),
    (error) => error instanceof InputValidationError && error.code === "INVALID_PROMPT"
  );
});

test("very long prompt is rejected for free plan", () => {
  assert.throws(
    () => promptValidator.validate("x".repeat(10_001), "free"),
    (error) => error instanceof InputValidationError && error.code === "INVALID_PROMPT"
  );
});

test("malformed workflow is rejected", () => {
  assert.throws(
    () => workflowValidator.validate("make-money-fast"),
    (error) => error instanceof InputValidationError && error.code === "INVALID_WORKFLOW"
  );
});

test("posting workflow normalizes to distribution", () => {
  assert.equal(workflowValidator.validate("posting"), "distribution");
});

test("invalid URL is rejected", () => {
  assert.throws(
    () => urlValidator.normalize("nota url .."),
    (error) => error instanceof InputValidationError && error.code === "INVALID_URL"
  );
});

test("large file upload is rejected", () => {
  assert.throws(
    () => attachmentValidator.validateOne({
      name: "script.pdf",
      mimeType: "application/pdf",
      size: 20 * 1024 * 1024 + 1
    }),
    (error) => error instanceof InputValidationError && error.code === "INVALID_ATTACHMENT"
  );
});

test("unsupported file type is rejected", () => {
  assert.throws(
    () => attachmentValidator.validateOne({
      name: "payload.exe",
      mimeType: "application/octet-stream",
      size: 100
    }),
    (error) => error instanceof InputValidationError && error.code === "INVALID_ATTACHMENT"
  );
});

test("repeated spam prompt is rejected", () => {
  assert.throws(
    () => promptValidator.validate("buy buy buy buy buy buy buy buy buy buy buy buy", "free"),
    (error) => error instanceof InputValidationError && error.code === "INVALID_PROMPT"
  );
});

test("invalid UUID is rejected", () => {
  assert.throws(
    () => inputValidator.validateConversationId("not-a-uuid"),
    (error) => error instanceof InputValidationError && error.code === "INVALID_CONVERSATION"
  );
});
