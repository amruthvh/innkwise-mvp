function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
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
