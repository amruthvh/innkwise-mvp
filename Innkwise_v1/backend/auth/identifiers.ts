import { createHash } from "crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function toCreatorUserId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (isUuid(normalized)) return normalized;

  const hex = createHash("sha256")
    .update(`innkwise-creator-user:${normalized}`)
    .digest("hex")
    .slice(0, 32)
    .split("");

  hex[12] = "5";
  hex[16] = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);

  return [
    hex.slice(0, 8).join(""),
    hex.slice(8, 12).join(""),
    hex.slice(12, 16).join(""),
    hex.slice(16, 20).join(""),
    hex.slice(20, 32).join("")
  ].join("-");
}

export function isEmailIdentifier(value: string) {
  return value.includes("@");
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export function isValidPhone(value: string) {
  const digitsOnly = normalizePhone(value).replace(/\D/g, "");
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function toPhoneBackedEmail(phone: string) {
  const digitsOnly = normalizePhone(phone).replace(/\D/g, "");
  return `phone.${digitsOnly}@innkwise.local`;
}

export function resolveIdentifier(input: string) {
  const raw = input.trim();
  if (!raw) return null;

  if (isEmailIdentifier(raw)) {
    const email = normalizeEmail(raw);
    if (!isValidEmail(email)) return null;
    return {
      type: "email" as const,
      normalizedInput: email,
      userEmail: email,
      contactLabel: email
    };
  }

  if (!isValidPhone(raw)) return null;
  const normalizedPhone = normalizePhone(raw);
  return {
    type: "phone" as const,
    normalizedInput: normalizedPhone,
    userEmail: toPhoneBackedEmail(normalizedPhone),
    contactLabel: normalizedPhone
  };
}
