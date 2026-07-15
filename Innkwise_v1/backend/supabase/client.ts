const DEFAULT_KNOWLEDGE_BUCKET = "creator-knowledge";

type SupabaseRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: BodyInit | null;
  contentType?: string;
  useServiceRole?: boolean;
};

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("Supabase URL is not configured.");
  }

  return url.replace(/\/$/, "");
}

function getSupabaseKey(useServiceRole = false) {
  const key = useServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error(useServiceRole ? "Supabase service role key is not configured." : "Supabase anon key is not configured.");
  }

  return key;
}

export function getKnowledgeStorageBucket() {
  return process.env.SUPABASE_KNOWLEDGE_BUCKET ?? DEFAULT_KNOWLEDGE_BUCKET;
}

export function buildKnowledgeStoragePath(userId: string, fileName: string) {
  const safeName = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "upload";

  return `${userId}/${Date.now()}-${safeName}`;
}

export async function supabaseRestRequest<T>(path: string, options: SupabaseRequestOptions = {}): Promise<T> {
  const key = getSupabaseKey(options.useServiceRole);
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.contentType ? { "Content-Type": options.contentType } : {})
    },
    body: options.body ?? null
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed with ${response.status}.`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function uploadKnowledgeObject(input: {
  userId: string;
  fileName: string;
  contentType: string;
  body: BodyInit;
}) {
  const bucket = getKnowledgeStorageBucket();
  const storagePath = buildKnowledgeStoragePath(input.userId, input.fileName);

  await supabaseRestRequest(`/storage/v1/object/${bucket}/${storagePath}`, {
    method: "POST",
    body: input.body,
    contentType: input.contentType || "application/octet-stream",
    useServiceRole: true
  });

  return {
    bucket,
    path: storagePath
  };
}

export async function deleteKnowledgeObject(storagePath: string, bucket = getKnowledgeStorageBucket()) {
  await supabaseRestRequest(`/storage/v1/object/${bucket}/${storagePath}`, {
    method: "DELETE",
    useServiceRole: true
  });
}

export function getKnowledgeObjectUrl(storagePath: string, bucket = getKnowledgeStorageBucket()) {
  return `${getSupabaseUrl()}/storage/v1/object/${bucket}/${storagePath}`;
}
