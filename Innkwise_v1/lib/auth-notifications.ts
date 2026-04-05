import { resolveIdentifier } from "@/lib/auth-identifiers";

export async function sendResetLink(args: { identifier: string; resetLink: string }) {
  const resolved = resolveIdentifier(args.identifier);
  if (!resolved) {
    throw new Error("Invalid email address or phone number.");
  }

  if (resolved.type === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MAIL_FROM;

    if (!apiKey || !from) {
      return {
        delivered: false,
        channel: "email" as const,
        reason: "missing_email_provider"
      };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [resolved.normalizedInput],
        subject: "Reset your Innkwise password",
        html: `<p>Reset your password by clicking the link below:</p><p><a href="${args.resetLink}">${args.resetLink}</a></p>`
      })
    });

    if (!response.ok) {
      throw new Error("Failed to send reset email.");
    }

    return {
      delivered: true,
      channel: "email" as const
    };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return {
      delivered: false,
      channel: "sms" as const,
      reason: "missing_sms_provider"
    };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({
    To: resolved.normalizedInput,
    From: fromNumber,
    Body: `Reset your Innkwise password: ${args.resetLink}`
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  if (!response.ok) {
    throw new Error("Failed to send reset SMS.");
  }

  return {
    delivered: true,
    channel: "sms" as const
  };
}
