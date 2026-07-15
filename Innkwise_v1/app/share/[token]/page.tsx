"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SharedConversation = {
  title: string;
  messages: Array<{
    id: string;
    role: string;
    content: string | null;
    contentJson?: Record<string, unknown>;
  }>;
};

export default function SharedConversationPage() {
  const params = useParams<{ token: string }>();
  const [conversation, setConversation] = useState<SharedConversation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = params?.token;
    if (!token) return;
    void fetch(`/api/shared-conversation?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("This shared conversation is unavailable.");
        return response.json() as Promise<{ conversation: SharedConversation }>;
      })
      .then((payload) => setConversation(payload.conversation))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load conversation."));
  }, [params?.token]);

  if (error) {
    return <main className="mx-auto max-w-3xl px-6 py-16 text-[var(--app-text)]">{error}</main>;
  }
  if (!conversation) {
    return <main className="mx-auto max-w-3xl px-6 py-16 text-[var(--app-muted)]">Loading conversation...</main>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-[var(--app-text)]">
      <p className="text-sm font-semibold">innkwise</p>
      <h1 className="mt-5 text-2xl font-semibold">{conversation.title}</h1>
      <div className="mt-10 space-y-8">
        {conversation.messages.map((message) => {
          const storedContent = typeof message.contentJson?.content === "string"
            ? message.contentJson.content
            : null;
          return (
            <div key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
              <div className={message.role === "user"
                ? "max-w-[85%] rounded-2xl bg-[var(--app-surface-muted)] px-4 py-3"
                : "whitespace-pre-wrap leading-7"
              }>
                {storedContent ?? message.content ?? ""}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
