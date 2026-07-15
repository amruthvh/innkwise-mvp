"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  FileText,
  FolderPlus,
  FolderKanban,
  Grid2X2,
  Library,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Star,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Edit3,
  LogOut,
  RotateCcw,
  Upload,
  X
} from "lucide-react";
import { useThemePreference, type ThemePreference } from "@/frontend/components/app-providers";
import { useSubscription } from "@/frontend/hooks/use-subscription";
import {
  WorkflowRenderer,
  workflowResultToMarkdown
} from "@/frontend/components/WorkflowRenderer";
import {
  clearStoredAuthToken,
  getAuthHeaders,
  getStoredAuthToken,
  storeAuthToken
} from "@/frontend/auth/auth-token-storage";
import {
  defaultWorkflowId,
  getWorkflowTemplate,
  type WorkflowId,
  type WorkflowTemplate
} from "@/lib/workflows/registry";
import { getShortcutTemplates } from "@/lib/workflows/creator-shortcuts";
import type { SubscriptionSummary } from "@/shared/types/billing";

type ScriptResult = {
  conversation_id?: string;
  advisor_markdown?: string;
  clarification?: {
    completenessScore?: number;
    missingFields?: string[];
    shouldAskQuestions?: boolean;
  };
  workflow_output?: {
    workflow_id?: string;
    workflow_title?: string;
    summary?: string;
    sections?: Array<{
      title?: string;
      content?: string;
      items?: string[];
    }>;
    next_steps?: string[];
    recommended_workflows?: Array<{
      workflow_id?: string;
      title?: string;
      reason?: string;
    }>;
  };
  hooks?: string[];
  title_suggestions?: string[];
  script_timeline?: Array<{
    time_range?: string;
    section_title?: string;
    content?: string;
  }>;
  thumbnail_text?: string[];
  hook?: string;
  pattern_interrupt?: string;
  main_script?: string;
  cta?: string;
  script?: {
    pattern_interrupt?: string;
    problem_setup?: string;
    psychological_explanation?: string;
    case_study?: string;
    practical_steps?: string;
    engagement_trigger?: string;
    cta?: string;
  };
};

type RemainingQuota = {
  generations?: number | "unlimited";
  embeddings?: number | "unlimited";
  uploads?: number | "unlimited";
};

type RateLimitPayload = {
  success?: false;
  error?: {
    code?: string;
    message?: string;
  };
  remaining?: RemainingQuota;
};

type RateLimitModalState = {
  title: string;
  message: string;
  resetMessage: string;
  remaining?: RemainingQuota;
  showUpgrade: boolean;
};

type SectionConfig = {
  id: string;
  title: string;
  content?: string;
  rawContent?: string;
  action?: ReactNode;
  canRefine?: boolean;
};

class RateLimitHandledError extends Error {
  constructor() {
    super("Rate limit handled");
    this.name = "RateLimitHandledError";
  }
}

function getNextUtcResetMessage() {
  const now = new Date();
  const nextReset = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  ));
  return `Free tier limits reset daily. Your next reset is ${nextReset.toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  })}.`;
}

function createRateLimitModalState(payload: RateLimitPayload): RateLimitModalState | null {
  const code = payload.error?.code;
  if (!code || !["RATE_LIMIT_EXCEEDED", "RATE_LIMITED", "PROMPT_TOO_LARGE"].includes(code)) {
    return null;
  }

  return {
    title: code === "PROMPT_TOO_LARGE" ? "Prompt is too large" : "Daily limit reached",
    message: payload.error?.message || "You've reached your current plan limit. Upgrade to Creator for more access.",
    resetMessage: getNextUtcResetMessage(),
    remaining: payload.remaining,
    showUpgrade: true
  };
}

function readRateLimitPayload(value: unknown): RateLimitPayload | null {
  if (!isRecord(value)) return null;
  const error = isRecord(value.error) ? value.error : null;
  const metadata = isRecord(value.metadata) ? value.metadata : null;
  const metadataError = isRecord(metadata?.error) ? metadata.error : null;
  const code = typeof error?.code === "string"
    ? error.code
    : typeof value.code === "string"
      ? value.code
      : typeof metadataError?.code === "string"
        ? metadataError.code
        : undefined;
  const message = typeof error?.message === "string"
    ? error.message
    : typeof value.message === "string"
      ? value.message
      : typeof metadataError?.message === "string"
        ? metadataError.message
        : undefined;
  if (!code && !message) return null;
  return {
    success: value.success === false ? false : undefined,
    error: { code, message },
    remaining: isRecord(value.remaining)
      ? value.remaining as RemainingQuota
      : isRecord(metadata?.remaining)
        ? metadata.remaining as RemainingQuota
        : undefined
  };
}

type ChatThreadMessage = {
  id: string;
  role: "user" | "assistant";
  type: "text" | "workflow";
  content: string;
  result?: ScriptResult;
  workflowId?: WorkflowId;
  workflowType?: WorkflowTemplate["workflowType"];
  createdAt: string;
  isTyping?: boolean;
};

type ConversationSummary = {
  id: string;
  title: string;
  lastMessage?: string | null;
  isPinned?: boolean;
  projectId?: string | null;
  projectName?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ThumbnailIdea = {
  concept: string;
  text: string;
  style: string;
  composition: string;
};

type WorkspaceView = "generator" | "library";
type SettingsTab = "account" | "general" | "billing" | "personalization";
type LibraryKind = "All" | "Images" | "Links" | "Files";

type Project = {
  id: string;
  name: string;
  instructions: string;
  createdAt: string;
};

type LibraryItem = {
  id: string;
  kind: Exclude<LibraryKind, "All">;
  name: string;
  url?: string | null;
  mimeType?: string | null;
  size?: number | null;
  contentBase64?: string | null;
  isFavorite?: boolean;
  createdAt?: string;
};

type LibraryViewMode = "grid" | "list";
type LibrarySortDirection = "asc" | "desc";

type AccountProfile = {
  id: string;
  email: string;
  planType: string;
  createdAt?: string;
};

type Preferences = {
  browserNotifications: boolean;
  productUpdates: boolean;
  creatorProfile: {
    creatorName: string;
    brandName: string;
    tagline: string;
    creatorBio: string;
    experienceLevel: string;
    creatorArchetypes: string[];
  };
  goals: {
    primaryGoal: string;
    secondaryGoals: string[];
    priorityScores: Record<string, number>;
  };
  audienceProfile: {
    audienceAge: string;
    audienceGeography: string;
    audienceLanguage: string;
    audienceEducation: string;
    audienceIncome: string;
    audienceInterests: string;
    audienceProblems: string;
    audienceAspirations: string;
    audienceEmotionalState: string;
  };
  contentProfile: {
    primaryNiche: string;
    subNiche: string;
    topicsCovered: string;
    topicsAvoided: string;
    contentPillars: string[];
  };
  platformProfile: {
    primaryPlatform: string;
    secondaryPlatforms: string[];
    contentFormats: string[];
    platformWeights: Record<string, number>;
  };
  knowledgeSources: {
    urls: Array<{ id: string; url: string; category: string }>;
    uploads: string[];
  };
  writingPreferences: Record<string, number>;
  aiControls: Record<string, number>;
};

const longFormDurations = [5, 8, 12, 15];
const shortsDurations = [1, 2, 3];
const shortcutTemplates = getShortcutTemplates();
const defaultAudienceType = "Creators";
const PROJECTS_STORAGE_KEY = "innkwise_projects";
const PREFERENCES_STORAGE_KEY = "innkwise_preferences";

const nextWorkflowByWorkflowId: Partial<Record<WorkflowId, WorkflowId>> = {
  "research-topic": "content-strategy",
  "content-strategy": "generate-script",
  "generate-script": "production-kit",
  "production-kit": "posting-strategy"
};

function isAffirmativeWorkflowReply(message: string) {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, "")
    .replace(/\s+/g, " ");
  return /^(yes|yes do it|yes, do it|do it|go ahead|sure|please do|continue|proceed)$/.test(normalized);
}

function getSuggestedWorkflowId(messages: ChatThreadMessage[]) {
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  return lastAssistantMessage?.type === "workflow" && lastAssistantMessage.workflowId
    ? nextWorkflowByWorkflowId[lastAssistantMessage.workflowId] ?? null
    : null;
}

function groupConversations(conversations: ConversationSummary[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 24 * 60 * 60 * 1000;
  const groups = new Map<string, ConversationSummary[]>([
    ["Pinned", []],
    ["Today", []],
    ["Yesterday", []],
    ["Last 7 Days", []],
    ["Older", []]
  ]);

  for (const conversation of conversations) {
    if (conversation.isPinned) {
      groups.get("Pinned")?.push(conversation);
      continue;
    }
    const updatedAt = new Date(conversation.updatedAt).getTime();
    const age = Number.isNaN(updatedAt) ? Number.POSITIVE_INFINITY : startOfToday - updatedAt;
    const label = updatedAt >= startOfToday
      ? "Today"
      : age < day * 2
        ? "Yesterday"
        : age < day * 7
          ? "Last 7 Days"
          : "Older";
    groups.get(label)?.push(conversation);
  }

  return [...groups.entries()]
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, items }));
}

const experienceLevels = ["Beginner", "Intermediate", "Advanced", "Professional", "Agency"];
const creatorArchetypes = [
  "Educator",
  "Storyteller",
  "Analyst",
  "Builder",
  "Influencer",
  "Thought Leader",
  "Entrepreneur",
  "Filmmaker",
  "Researcher",
  "Entertainer"
];
const creatorGoals = [
  "Audience Growth",
  "Revenue Growth",
  "Personal Branding",
  "Lead Generation",
  "Authority Building",
  "Community Building",
  "Product Sales",
  "Service Sales",
  "Startup Growth"
];
const niches = ["Filmmaking", "AI", "Psychology", "Business", "Finance", "Education", "Fitness", "Automotive", "Travel", "Gaming"];
const platformOptions = ["YouTube", "Instagram", "TikTok", "LinkedIn", "X", "Blogs", "Newsletter", "Podcast"];
const contentFormats = ["Shorts", "Reels", "Long-form", "Threads", "Carousels", "Articles", "Emails"];
const defaultPlatformWeights = platformOptions.reduce<Record<string, number>>((weights, platform) => {
  weights[platform] = platform === "YouTube" ? 80 : 30;
  return weights;
}, {});
const defaultGoalScores = creatorGoals.reduce<Record<string, number>>((scores, goal) => {
  scores[goal] = goal === "Audience Growth" ? 85 : 45;
  return scores;
}, {});
const defaultPreferences: Preferences = {
  browserNotifications: false,
  productUpdates: true,
  creatorProfile: {
    creatorName: "",
    brandName: "",
    tagline: "",
    creatorBio: "",
    experienceLevel: "Intermediate",
    creatorArchetypes: ["Educator"]
  },
  goals: {
    primaryGoal: "Audience Growth",
    secondaryGoals: [],
    priorityScores: defaultGoalScores
  },
  audienceProfile: {
    audienceAge: "",
    audienceGeography: "",
    audienceLanguage: "",
    audienceEducation: "",
    audienceIncome: "",
    audienceInterests: "",
    audienceProblems: "",
    audienceAspirations: "",
    audienceEmotionalState: ""
  },
  contentProfile: {
    primaryNiche: "AI",
    subNiche: "",
    topicsCovered: "",
    topicsAvoided: "",
    contentPillars: ["Pillar 1", "Pillar 2", "Pillar 3"]
  },
  platformProfile: {
    primaryPlatform: "YouTube",
    secondaryPlatforms: [],
    contentFormats: ["Long-form"],
    platformWeights: defaultPlatformWeights
  },
  knowledgeSources: {
    urls: [],
    uploads: []
  },
  writingPreferences: {
    complexity: 50,
    tone: 55,
    length: 50,
    humor: 35,
    researchDepth: 65,
    persuasion: 60,
    storytelling: 70,
    originality: 75
  },
  aiControls: {
    creativityLevel: 70,
    consistencyLevel: 75,
    researchIntensity: 65,
    voiceAdherence: 80,
    riskTaking: 45,
    innovation: 70,
    contrarianThinking: 50,
    emotionalIntensity: 60
  }
};

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { theme, setTheme } = useThemePreference();
  const [authChecked, setAuthChecked] = useState(false);
  const [activeView, setActiveView] = useState<WorkspaceView>("generator");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentSearchOpen, setContentSearchOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [rateLimitModal, setRateLimitModal] = useState<RateLimitModalState | null>(null);
  const [contentSearchQuery, setContentSearchQuery] = useState("");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectShareTarget, setProjectShareTarget] = useState<Project | null>(null);
  const [projectSettingsTarget, setProjectSettingsTarget] = useState<Project | null>(null);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<Project | null>(null);
  const [pendingProjectConversation, setPendingProjectConversation] = useState<ConversationSummary | null>(null);
  const [conversationDeleteTarget, setConversationDeleteTarget] = useState<ConversationSummary | null>(null);
  const [libraryKind, setLibraryKind] = useState<LibraryKind>("All");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectInstructions, setProjectInstructions] = useState("");
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [topic, setTopic] = useState("");
  const [workflowId, setWorkflowId] = useState<WorkflowId>(defaultWorkflowId);
  const [audience, setAudience] = useState(defaultAudienceType);
  const [tone, setTone] = useState("Authoritative");
  const [videoType, setVideoType] = useState<"long" | "shorts">("long");
  const [length, setLength] = useState(8);
  const [includeResearch] = useState(true);
  const [includeCaseStudy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pendingResponseAfterUserId, setPendingResponseAfterUserId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatThreadMessage[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const conversationHistoryInitialized = useRef(false);
  const durationOptions = videoType === "shorts" ? shortsDurations : longFormDurations;
  const userEmail = accountProfile?.email ?? session?.user?.email ?? "Email unavailable";
  const accountName =
    preferences.creatorProfile.creatorName.trim() ||
    preferences.creatorProfile.brandName.trim() ||
    session?.user?.name ||
    getNameFromEmail(accountProfile?.email ?? userEmail);
  const planLabel = formatPlanLabel(accountProfile?.planType);

  useEffect(() => {
    const storedPreferences = readJson<Partial<Preferences>>(PREFERENCES_STORAGE_KEY, {});
    setPreferences(mergePreferences(storedPreferences));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (status === "authenticated" && session?.appAuthToken) {
      storeAuthToken(session.appAuthToken);
      setAuthChecked(true);
      return;
    }

    if (getStoredAuthToken()) {
      setAuthChecked(true);
      return;
    }

    router.replace("/auth");
  }, [router, session, status]);

  useEffect(() => {
    if (!authChecked) return;
    void fetchAccountProfile();
    void fetchLibraryItems();
    void fetchProjects();
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const params = new URL(window.location.href).searchParams;
    if (params.get("settings") === "billing" || params.get("billing")) {
      setSettingsTab("billing");
      setSettingsOpen(true);
    }
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const loadLatest = !conversationHistoryInitialized.current;
    const sharedConversationId = loadLatest
      ? new URL(window.location.href).searchParams.get("conversation")
      : null;
    conversationHistoryInitialized.current = true;
    const timeout = window.setTimeout(() => {
      void fetchConversations({
        loadLatest: loadLatest && !sharedConversationId,
        conversationId: sharedConversationId
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [authChecked]);

  useEffect(() => {
    const validDurations = videoType === "shorts" ? shortsDurations : longFormDurations;

    if (!validDurations.includes(length)) {
      setLength(videoType === "shorts" ? 1 : 8);
    }
  }, [length, videoType]);

  const resetGenerator = () => {
    setTopic("");
    setWorkflowId(defaultWorkflowId);
    setAudience(defaultAudienceType);
    setTone("Authoritative");
    setVideoType("long");
    setLength(8);
    setLoading(false);
    setPendingResponseAfterUserId(null);
    setChatMessages([]);
    setCurrentConversationId(null);
  };

  const goToNewContent = () => {
    resetGenerator();
    setActiveView("generator");
    router.push("/dashboard");
  };

  const fetchAccountProfile = async () => {
    try {
      const res = await axios.get<{ user?: AccountProfile }>("/api/auth/me", {
        headers: getAuthHeaders()
      });
      setAccountProfile(res.data?.user ?? null);
    } catch {
      setAccountProfile(null);
    }
  };

  const fetchLibraryItems = async () => {
    try {
      setLibraryLoading(true);
      const res = await axios.get<{ items?: LibraryItem[] }>("/api/library-items", {
        headers: getAuthHeaders()
      });
      setLibraryItems(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch {
      setLibraryItems([]);
    } finally {
      setLibraryLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await axios.get<{ projects?: Project[] }>("/api/projects", {
        headers: getAuthHeaders()
      });
      let savedProjects = Array.isArray(res.data?.projects) ? res.data.projects : [];

      if (!savedProjects.length) {
        const localProjects = readJson<Project[]>(PROJECTS_STORAGE_KEY, []);
        if (localProjects.length) {
          const migratedProjects = await Promise.all(
            localProjects.map(async (project) => {
              const response = await axios.post<{ project?: Project }>("/api/projects", project, {
                headers: getAuthHeaders()
              });
              return response.data?.project;
            })
          );
          savedProjects = migratedProjects.filter((project): project is Project => Boolean(project));
          window.localStorage.removeItem(PROJECTS_STORAGE_KEY);
        }
      }

      setProjects(savedProjects);
    } catch {
      setProjects(readJson<Project[]>(PROJECTS_STORAGE_KEY, []));
    }
  };

  const createLibraryItem = async (item: Omit<LibraryItem, "id" | "createdAt">) => {
    const res = await axios.post<{ item?: LibraryItem }>("/api/library-items", item, {
      headers: getAuthHeaders()
    });
    if (res.data?.item) {
      setLibraryItems((current) => [res.data.item as LibraryItem, ...current]);
    }
  };

  const deleteLibraryItems = async (ids: string[]) => {
    if (!ids.length) return;
    await axios.delete("/api/library-items", {
      headers: getAuthHeaders(),
      data: { ids }
    });
    setLibraryItems((current) => current.filter((item) => !ids.includes(item.id)));
  };

  const updateLibraryItemFavorite = async (id: string, isFavorite: boolean) => {
    const res = await axios.patch<{ item?: LibraryItem }>("/api/library-items", { id, isFavorite }, {
      headers: getAuthHeaders()
    });

    setLibraryItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, isFavorite: res.data?.item?.isFavorite ?? isFavorite } : item
      )
    );
  };

  const fetchConversations = async (options?: {
    loadLatest?: boolean;
    conversationId?: string | null;
  }) => {
    try {
      setConversationsLoading(true);
      const res = await axios.get<{ conversations?: ConversationSummary[] }>("/api/conversations", {
        headers: getAuthHeaders()
      });
      const nextConversations = Array.isArray(res.data?.conversations) ? res.data.conversations : [];
      setConversations(nextConversations);
      if (options?.conversationId) {
        await fetchChatHistory(options.conversationId);
      } else if (options?.loadLatest && !currentConversationId && nextConversations[0]) {
        await fetchChatHistory(nextConversations[0].id);
      }
    } catch {
      setConversations([]);
    } finally {
      setConversationsLoading(false);
    }
  };

  const fetchChatHistory = async (selectedConversationId?: string) => {
    try {
      const res = await axios.get<{
        conversationId?: string | null;
        messages?: Array<{
          id?: string;
          role?: string;
          content?: string | null;
          contentJson?: Record<string, unknown>;
          metadata?: Record<string, unknown>;
          createdAt?: string;
        }>;
      }>("/api/chat-history", {
        headers: getAuthHeaders(),
        params: selectedConversationId ? { conversationId: selectedConversationId } : undefined
      });
      const loadedConversationId = res.data?.conversationId ?? null;
      const restoredMessages = (res.data?.messages ?? [])
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message): ChatThreadMessage => {
          const storedResult = message.contentJson?.result
            && typeof message.contentJson.result === "object"
            ? message.contentJson.result as Record<string, unknown>
            : message.contentJson ?? {};
          const metadataWorkflowId = typeof message.metadata?.workflowId === "string"
            ? message.metadata.workflowId
            : typeof storedResult.workflow_output === "object"
              && storedResult.workflow_output
              && typeof (storedResult.workflow_output as Record<string, unknown>).workflow_id === "string"
                ? String((storedResult.workflow_output as Record<string, unknown>).workflow_id)
                : defaultWorkflowId;
          const workflowId = getWorkflowTemplate(metadataWorkflowId).id;
          const result = storedResult as ScriptResult;
          const isClarification = Boolean(result.clarification?.shouldAskQuestions);
          const storedType = typeof message.contentJson?.type === "string"
            ? message.contentJson.type
            : null;
          const isWorkflow = storedType === "workflow" || (message.role === "assistant"
            && !isClarification
            && Boolean(
              result.advisor_markdown
              || result.workflow_output
              || result.main_script
              || result.script_timeline?.length
            ));
          const storedContent = typeof message.contentJson?.content === "string"
            ? message.contentJson.content
            : null;
          const fallbackContent = storedContent ?? message.content ?? "";

          return {
            id: message.id ?? crypto.randomUUID(),
            role: message.role as "user" | "assistant",
            type: isWorkflow ? "workflow" : "text",
            content: isWorkflow
              ? workflowResultToMarkdown(result, fallbackContent)
              : fallbackContent,
            result: isWorkflow ? result : undefined,
            workflowId,
            workflowType: getWorkflowTemplate(workflowId).workflowType,
            createdAt: message.createdAt ?? new Date().toISOString()
          };
        });

      const deduplicatedMessages = restoredMessages.filter((message, index, messages) => {
        if (message.role !== "assistant" || index === 0) return true;
        const previous = messages[index - 1];
        return previous.role !== "assistant"
          || previous.content.trim() !== message.content.trim();
      });

      setCurrentConversationId(loadedConversationId);
      setChatMessages(deduplicatedMessages);
      setPendingResponseAfterUserId(null);
      setActiveView("generator");
      setWorkflowId(defaultWorkflowId);
      setTopic("");
    } catch {
      // A missing history should not block a new conversation.
    }
  };

  const requestLogout = () => {
    setLogoutConfirmOpen(true);
  };

  const updateConversation = async (
    conversation: ConversationSummary,
    action: "rename" | "pin" | "move" | "archive",
    values?: Record<string, unknown>
  ) => {
    await axios.patch("/api/conversations", {
      id: conversation.id,
      action,
      ...values
    }, {
      headers: getAuthHeaders()
    });
    if (action === "archive" && currentConversationId === conversation.id) {
      resetGenerator();
    }
    await fetchConversations();
  };

  const moveConversationToProject = async (
    conversation: ConversationSummary,
    project: Project | null,
    refresh = false
  ) => {
    const previousProjectId = conversation.projectId ?? null;
    const previousProjectName = conversation.projectName ?? null;

    setConversations((current) => current.map((item) =>
      item.id === conversation.id
        ? {
            ...item,
            projectId: project?.id ?? null,
            projectName: project?.name ?? null
          }
        : item
    ));

    try {
      await axios.patch("/api/conversations", {
        id: conversation.id,
        action: "move",
        projectId: project?.id ?? null,
        projectName: project?.name ?? null
      }, {
        headers: getAuthHeaders()
      });

      if (refresh) await fetchConversations();
      return true;
    } catch {
      setConversations((current) => current.map((item) =>
        item.id === conversation.id
          ? {
              ...item,
              projectId: previousProjectId,
              projectName: previousProjectName
            }
          : item
      ));
      alert("Unable to move this conversation. Please try again.");
      return false;
    }
  };

  const deleteConversation = async (conversation: ConversationSummary) => {
    await axios.delete("/api/conversations", {
      headers: getAuthHeaders(),
      data: { id: conversation.id }
    });
    if (currentConversationId === conversation.id) {
      resetGenerator();
    }
    await fetchConversations();
    setConversationDeleteTarget(null);
  };

  const shareConversation = async (conversation: ConversationSummary) => {
    const response = await axios.patch<{ shareToken?: string }>("/api/conversations", {
      id: conversation.id,
      action: "share"
    }, {
      headers: getAuthHeaders()
    });
    const shareToken = response.data?.shareToken;
    if (!shareToken) throw new Error("Unable to create share link.");
    const url = new URL(`/share/${shareToken}`, window.location.origin);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: conversation.title, url: url.toString() });
      } else {
        await navigator.clipboard.writeText(url.toString());
        alert("Conversation link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      alert("Unable to share this conversation.");
    }
  };

  const logout = async () => {
    clearStoredAuthToken();
    await signOut({ callbackUrl: "/auth" });
  };

  const generateScript = async (options?: {
    prompt?: string;
    workflowId?: WorkflowId;
    replaceUserMessageId?: string;
    replaceAssistantMessageId?: string;
  }) => {
    const userPrompt = (options?.prompt ?? topic).trim();
    if (!userPrompt) return;
    const suggestedWorkflowId = workflowId === defaultWorkflowId && isAffirmativeWorkflowReply(userPrompt)
      ? getSuggestedWorkflowId(chatMessages)
      : null;
    const submittedWorkflowId = options?.workflowId ?? suggestedWorkflowId ?? workflowId;
    const previousMessages = chatMessages;
    const userMessage: ChatThreadMessage = {
      id: options?.replaceUserMessageId ?? crypto.randomUUID(),
      role: "user",
      type: "text",
      content: userPrompt,
      workflowId: submittedWorkflowId,
      createdAt: new Date().toISOString()
    };

    try {
      setPendingResponseAfterUserId(options?.replaceUserMessageId ?? null);
      setLoading(true);
      setChatMessages((current) => {
        if (!options?.replaceUserMessageId) return [...current, userMessage];
        return current
          .map((message) =>
            message.id === options.replaceUserMessageId ? userMessage : message
          )
          .filter((message) => message.id !== options.replaceAssistantMessageId);
      });
      setTopic("");
      const res = await axios.post("/api/generate-script", {
        topic: userPrompt,
        audience,
        tone,
        videoType,
        length,
        workflowId: submittedWorkflowId,
        conversationId: currentConversationId,
        includeResearch,
        includeCaseStudy
      }, {
        headers: getAuthHeaders()
      });

      const directRateLimitPayload = readRateLimitPayload(res.data);
      const directRateLimitModal = directRateLimitPayload
        ? createRateLimitModalState(directRateLimitPayload)
        : null;
      if (directRateLimitModal) {
        setRateLimitModal(directRateLimitModal);
        throw new RateLimitHandledError();
      }

      // Supports either direct script payload or { id, output } API wrapper.
      const nextResult = (res.data?.output ?? res.data) as ScriptResult;
      if (nextResult.conversation_id) {
        setCurrentConversationId(nextResult.conversation_id);
      }
      const fallbackAssistantContent =
        nextResult.advisor_markdown
        || nextResult.workflow_output?.summary
        || "I could not generate a complete response. Try rephrasing your prompt.";
      const assistantMessage: ChatThreadMessage = {
          id: options?.replaceAssistantMessageId ?? crypto.randomUUID(),
          role: "assistant",
          type: nextResult.clarification?.shouldAskQuestions ? "text" : "workflow",
          content: workflowResultToMarkdown(nextResult, fallbackAssistantContent),
          result: nextResult,
          workflowId: submittedWorkflowId,
          workflowType: getWorkflowTemplate(submittedWorkflowId).workflowType,
          createdAt: new Date().toISOString(),
          isTyping: true
        };
      setChatMessages((current) => {
        if (!options?.replaceUserMessageId) return [...current, assistantMessage];
        const withoutOldAssistant = current.filter(
          (message) => message.id !== options.replaceAssistantMessageId
        );
        const userIndex = withoutOldAssistant.findIndex(
          (message) => message.id === options.replaceUserMessageId
        );
        if (userIndex < 0) return [...withoutOldAssistant, assistantMessage];
        return [
          ...withoutOldAssistant.slice(0, userIndex + 1),
          assistantMessage,
          ...withoutOldAssistant.slice(userIndex + 1)
        ];
      });
      if (
        submittedWorkflowId !== defaultWorkflowId
        && !nextResult.clarification?.shouldAskQuestions
      ) {
        setWorkflowId(defaultWorkflowId);
      }
      void fetchConversations();
    } catch (error) {
      if (options?.replaceUserMessageId) {
        setChatMessages(previousMessages);
      } else {
        setChatMessages((current) => current.filter((message) => message.id !== userMessage.id));
      }
      setTopic(userPrompt);
      const responsePayload = axios.isAxiosError(error)
        ? readRateLimitPayload(error.response?.data)
        : null;
      const rateLimitState = responsePayload ? createRateLimitModalState(responsePayload) : null;
      if (rateLimitState) {
        setRateLimitModal(rateLimitState);
      } else if (!(error instanceof RateLimitHandledError)) {
        alert("Error generating response");
      }
    } finally {
      setLoading(false);
      setPendingResponseAfterUserId(null);
    }
  };

  const editPrompt = async (
    message: ChatThreadMessage,
    nextPrompt: string,
    assistantMessage?: ChatThreadMessage
  ) => {
    const prompt = nextPrompt.trim();
    if (!prompt || loading) return;
    await generateScript({
      prompt,
      workflowId: message.workflowId ?? defaultWorkflowId,
      replaceUserMessageId: message.id,
      replaceAssistantMessageId: assistantMessage?.id
    });
  };

  const retryResponse = async (
    message: ChatThreadMessage,
    assistantMessage?: ChatThreadMessage
  ) => {
    if (loading) return;
    await generateScript({
      prompt: message.content,
      workflowId: message.workflowId ?? defaultWorkflowId,
      replaceUserMessageId: message.id,
      replaceAssistantMessageId: assistantMessage?.id
    });
  };

  const addResponseToLibrary = async (message: ChatThreadMessage, sourcePrompt?: string) => {
    const baseName = sourcePrompt?.trim() || "Creator response";
    const safeName = baseName.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "Creator response";
    await createLibraryItem(await textToLibraryItem(
      `${safeName}.md`,
      message.content
    ));
  };

  const trackResponseFeedback = async (message: ChatThreadMessage, rating: "good" | "bad") => {
    await axios.post("/api/track-event", {
      event: "chat_response_feedback",
      path: "/dashboard",
      metadata: {
        messageId: message.id,
        workflowId: message.workflowId ?? defaultWorkflowId,
        rating
      }
    }, {
      headers: getAuthHeaders()
    });
  };

  const openNewProjectDialog = (conversation: ConversationSummary | null = null) => {
    setPendingProjectConversation(conversation);
    setProjectDialogOpen(true);
  };

  const closeNewProjectDialog = () => {
    setProjectDialogOpen(false);
    setPendingProjectConversation(null);
    setProjectName("");
    setProjectInstructions("");
  };

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;

    const draftProject: Project = {
      id: crypto.randomUUID(),
      name,
      instructions: projectInstructions.trim(),
      createdAt: new Date().toISOString()
    };
    const conversationToMove = pendingProjectConversation;

    try {
      const response = await axios.post<{ project?: Project }>("/api/projects", draftProject, {
        headers: getAuthHeaders()
      });
      const project = response.data?.project ?? draftProject;
      setProjects((current) => [
        project,
        ...current.filter((item) => item.id !== project.id)
      ]);
      closeNewProjectDialog();

      if (conversationToMove) {
        await moveConversationToProject(conversationToMove, project);
      }
    } catch {
      alert("Unable to create this project. Please try again.");
    }
  };

  const updateProject = async (
    projectId: string,
    updates: Partial<Pick<Project, "name" | "instructions">>
  ) => {
    const currentProject = projects.find((project) => project.id === projectId);
    if (!currentProject) return;
    const nextProject = { ...currentProject, ...updates };

    try {
      const response = await axios.patch<{ project?: Project }>("/api/projects", nextProject, {
        headers: getAuthHeaders()
      });
      const savedProject = response.data?.project ?? nextProject;
      setProjects((current) =>
        current.map((project) => project.id === projectId ? savedProject : project)
      );
      if (updates.name) {
        setConversations((current) => current.map((conversation) =>
          conversation.projectId === projectId
            ? { ...conversation, projectName: savedProject.name }
            : conversation
        ));
      }
    } catch {
      alert("Unable to update this project. Please try again.");
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      await axios.delete("/api/projects", {
        headers: getAuthHeaders(),
        data: { id: projectId }
      });
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setConversations((current) => current.map((conversation) =>
        conversation.projectId === projectId
          ? { ...conversation, projectId: null, projectName: null }
          : conversation
      ));
      setProjectDeleteTarget(null);
    } catch {
      alert("Unable to delete this project. Please try again.");
    }
  };

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const visibleLibraryItems = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    const filteredByKind =
      libraryKind === "All" ? libraryItems : libraryItems.filter((item) => item.kind === libraryKind);

    if (!query) return filteredByKind;

    return filteredByKind.filter((item) =>
      [item.name, item.url, item.mimeType, item.kind].join(" ").toLowerCase().includes(query)
    );
  }, [libraryItems, libraryKind, librarySearch]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] text-[var(--app-text)]">
        <p className="text-sm text-[var(--app-muted)]">Checking access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      <div className="flex min-h-screen">
        <WorkspaceSidebar
          activeView={activeView}
          collapsed={sidebarCollapsed}
          projects={projects}
          conversations={conversations}
          currentConversationId={currentConversationId}
          conversationsLoading={conversationsLoading}
          onCollapse={() => setSidebarCollapsed((value) => !value)}
          onViewChange={setActiveView}
          onNewContent={goToNewContent}
          onNewProject={() => openNewProjectDialog()}
          onCreateProjectForConversation={(conversation) => openNewProjectDialog(conversation)}
          accountName={accountName}
          accountEmail={userEmail}
          planLabel={planLabel}
          onRenameProject={(project, name) => void updateProject(project.id, { name })}
          onShareProject={setProjectShareTarget}
          onProjectSettings={setProjectSettingsTarget}
          onDeleteProject={setProjectDeleteTarget}
          onSearchContent={() => setContentSearchOpen(true)}
          onOpenConversation={(conversationId) => void fetchChatHistory(conversationId)}
          onShareConversation={(conversation) => void shareConversation(conversation)}
          onRenameConversation={(conversation, title) => void updateConversation(conversation, "rename", { title })}
          onPinConversation={(conversation) => void updateConversation(conversation, "pin", { pinned: !conversation.isPinned })}
          onMoveConversation={(conversation, project) => void moveConversationToProject(conversation, project)}
          onArchiveConversation={(conversation) => void updateConversation(conversation, "archive")}
          onDeleteConversation={setConversationDeleteTarget}
          onAccount={() => openSettings("account")}
          onSettings={() => openSettings("general")}
          onBilling={() => router.push("/pricing")}
          onPersonalization={() => openSettings("personalization")}
          onLogout={requestLogout}
        />

        <main className="min-w-0 flex-1">
          {activeView === "generator" && (
            <GeneratorView
              topic={topic}
              workflowId={workflowId}
              audience={audience}
              tone={tone}
              videoType={videoType}
              length={length}
              durationOptions={durationOptions}
              loading={loading}
              pendingResponseAfterUserId={pendingResponseAfterUserId}
              chatMessages={chatMessages}
              libraryItems={libraryItems}
              projects={projects}
              setTopic={setTopic}
              setWorkflowId={setWorkflowId}
              setAudience={setAudience}
              setTone={setTone}
              setVideoType={setVideoType}
              setLength={setLength}
              onCreateLibraryItem={createLibraryItem}
              onOpenLibrary={() => setActiveView("library")}
              generateScript={generateScript}
              onEditPrompt={editPrompt}
              onRetryResponse={retryResponse}
              onAddResponseToLibrary={addResponseToLibrary}
              onResponseFeedback={trackResponseFeedback}
            />
          )}

          {activeView === "library" && (
            <LibraryView
              filter={libraryKind}
              items={visibleLibraryItems}
              search={librarySearch}
              loading={libraryLoading}
              onFilterChange={setLibraryKind}
              onSearchChange={setLibrarySearch}
              onCreateItem={createLibraryItem}
              onDeleteItems={deleteLibraryItems}
              onUpdateFavorite={updateLibraryItemFavorite}
              onNewContent={() => {
                setTopic("");
                setAudience(defaultAudienceType);
                setActiveView("generator");
              }}
            />
          )}

        </main>
      </div>

      {projectDialogOpen && (
        <ProjectDialog
          name={projectName}
          instructions={projectInstructions}
          onNameChange={setProjectName}
          onInstructionsChange={setProjectInstructions}
          onClose={closeNewProjectDialog}
          onCreate={() => void createProject()}
        />
      )}

      {projectShareTarget && (
        <ProjectShareDialog
          project={projectShareTarget}
          onClose={() => setProjectShareTarget(null)}
        />
      )}

      {projectSettingsTarget && (
        <ProjectSettingsDialog
          project={projectSettingsTarget}
          onSave={(updates) => {
            void updateProject(projectSettingsTarget.id, updates);
            setProjectSettingsTarget((project) => project ? { ...project, ...updates } : project);
          }}
          onClose={() => setProjectSettingsTarget(null)}
        />
      )}

      {projectDeleteTarget && (
        <ProjectDeleteDialog
          onCancel={() => setProjectDeleteTarget(null)}
          onDelete={() => void deleteProject(projectDeleteTarget.id)}
        />
      )}

      {conversationDeleteTarget && (
        <ConversationDeleteDialog
          conversation={conversationDeleteTarget}
          onCancel={() => setConversationDeleteTarget(null)}
          onDelete={() => void deleteConversation(conversationDeleteTarget)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          activeTab={settingsTab}
          theme={theme}
          accountName={accountName}
          userEmail={userEmail}
          preferences={preferences}
          onTabChange={setSettingsTab}
          onThemeChange={setTheme}
          onPreferencesChange={setPreferences}
          onLogout={requestLogout}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {contentSearchOpen && (
        <SearchContentDialog
          query={contentSearchQuery}
          conversations={conversations}
          onQueryChange={setContentSearchQuery}
          onNewContent={() => {
            setContentSearchOpen(false);
            goToNewContent();
          }}
          onOpenConversation={(conversationId) => {
            void fetchChatHistory(conversationId);
            setContentSearchOpen(false);
          }}
          onClose={() => setContentSearchOpen(false)}
        />
      )}

      {logoutConfirmOpen && (
        <LogoutConfirmDialog
          userEmail={userEmail}
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={logout}
        />
      )}

      {rateLimitModal && (
        <RateLimitUpgradeDialog
          state={rateLimitModal}
          onClose={() => setRateLimitModal(null)}
        />
      )}
    </div>
  );
}

function WorkspaceSidebar({
  activeView,
  collapsed,
  projects,
  conversations,
  currentConversationId,
  conversationsLoading,
  accountName,
  accountEmail,
  planLabel,
  onCollapse,
  onViewChange,
  onNewContent,
  onNewProject,
  onCreateProjectForConversation,
  onRenameProject,
  onShareProject,
  onProjectSettings,
  onDeleteProject,
  onSearchContent,
  onOpenConversation,
  onShareConversation,
  onRenameConversation,
  onPinConversation,
  onMoveConversation,
  onArchiveConversation,
  onDeleteConversation,
  onAccount,
  onSettings,
  onBilling,
  onPersonalization,
  onLogout
}: {
  activeView: WorkspaceView;
  collapsed: boolean;
  projects: Project[];
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  conversationsLoading: boolean;
  accountName: string;
  accountEmail: string;
  planLabel: string;
  onCollapse: () => void;
  onViewChange: (view: WorkspaceView) => void;
  onNewContent: () => void;
  onNewProject: () => void;
  onCreateProjectForConversation: (conversation: ConversationSummary) => void;
  onRenameProject: (project: Project, name: string) => void;
  onShareProject: (project: Project) => void;
  onProjectSettings: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onSearchContent: () => void;
  onOpenConversation: (conversationId: string) => void;
  onShareConversation: (conversation: ConversationSummary) => void;
  onRenameConversation: (conversation: ConversationSummary, title: string) => void;
  onPinConversation: (conversation: ConversationSummary) => void;
  onMoveConversation: (conversation: ConversationSummary, project: Project | null) => void;
  onArchiveConversation: (conversation: ConversationSummary) => void;
  onDeleteConversation: (conversation: ConversationSummary) => void;
  onAccount: () => void;
  onSettings: () => void;
  onBilling: () => void;
  onPersonalization: () => void;
  onLogout: () => void;
}) {
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [conversationsOpen, setConversationsOpen] = useState(true);
  const itemClass = (selected = false) =>
    `flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
      selected
        ? "bg-[var(--sidebar-active)] text-[var(--app-text)]"
        : "text-[var(--app-soft)] hover:bg-[var(--sidebar-hover)]"
    } ${collapsed ? "justify-center px-0" : ""}`;
  const conversationGroups = groupConversations(conversations);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeAccountMenu = (event: MouseEvent | TouchEvent) => {
      if (event.target instanceof Node && accountMenuRef.current?.contains(event.target)) return;
      setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", closeAccountMenu);
    document.addEventListener("touchstart", closeAccountMenu);
    return () => {
      document.removeEventListener("mousedown", closeAccountMenu);
      document.removeEventListener("touchstart", closeAccountMenu);
    };
  }, [accountMenuOpen]);

  return (
    <aside
      className={`sticky top-0 z-50 hidden h-screen shrink-0 overflow-visible border-r border-[var(--app-border)] bg-[var(--app-surface)] p-3 transition-all md:block ${
        collapsed ? "w-[72px]" : "w-[300px]"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className={`mb-6 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && <div className="text-lg font-semibold">innkwise</div>}
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--app-soft)] hover:bg-[var(--app-surface-muted)]"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="space-y-1">
          <button className={itemClass(activeView === "generator" && !currentConversationId)} onClick={onNewContent}>
            <Pencil size={18} />
            {!collapsed && <span>New Chat</span>}
          </button>
          <button className={itemClass(false)} onClick={onSearchContent}>
            <Search size={18} />
            {!collapsed && <span>Search content</span>}
          </button>
          <button className={itemClass(activeView === "library")} onClick={() => onViewChange("library")}>
            <Library size={18} />
            {!collapsed && <span>Library</span>}
          </button>
        </nav>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-1">
          <div
            className={`flex h-9 w-full items-center rounded-md text-sm font-medium text-[var(--app-soft)] transition hover:bg-[var(--app-surface-muted)] ${
              collapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            <button
              type="button"
              onClick={() => setProjectsOpen((open) => !open)}
              className={`flex min-w-0 flex-1 items-center gap-3 ${collapsed ? "justify-center" : ""}`}
              title="Projects"
            >
              <FolderKanban size={18} />
              {!collapsed && <span>Projects</span>}
            </button>
            {!collapsed && (
              <>
                <button
                  type="button"
                  onClick={onNewProject}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-soft)] hover:bg-[var(--app-bg)] hover:text-[var(--app-text)]"
                  title="New project"
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setProjectsOpen((open) => !open)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-soft)] hover:bg-[var(--app-bg)] hover:text-[var(--app-text)]"
                  title={projectsOpen ? "Collapse projects" : "Expand projects"}
                >
                  <ChevronDown size={15} className={`transition ${projectsOpen ? "rotate-180" : ""}`} />
                </button>
              </>
            )}
          </div>
          {!collapsed && projectsOpen && projects.map((project) => (
            <ProjectSidebarItem
              key={project.id}
              project={project}
              projects={projects}
              conversations={conversations.filter((conversation) => conversation.projectId === project.id)}
              currentConversationId={currentConversationId}
              onRename={(name) => onRenameProject(project, name)}
              onShare={() => onShareProject(project)}
              onSettings={() => onProjectSettings(project)}
              onDelete={() => onDeleteProject(project)}
              onOpenConversation={onOpenConversation}
              onShareConversation={onShareConversation}
              onRenameConversation={onRenameConversation}
              onPinConversation={onPinConversation}
              onMoveConversation={onMoveConversation}
              onArchiveConversation={onArchiveConversation}
              onDeleteConversation={onDeleteConversation}
              onCreateProjectForConversation={onCreateProjectForConversation}
            />
          ))}
          <button
            className={`${itemClass(false)} mt-1`}
            onClick={() => setConversationsOpen((open) => !open)}
          >
            <MessageSquareText size={18} />
            {!collapsed && (
              <>
                <span>All Content</span>
                <ChevronDown size={15} className={`ml-auto transition ${conversationsOpen ? "rotate-180" : ""}`} />
              </>
            )}
          </button>
        </div>

        {!collapsed && conversationsOpen && (
          <div className="mt-2">
            <div>
              {conversationsLoading && !conversations.length ? (
                <p className="px-2 py-3 text-xs text-[var(--app-muted)]">Loading conversations...</p>
              ) : conversationGroups.length ? (
                conversationGroups.map((group) => (
                  <div key={group.label} className="mb-4">
                    <p className="mb-1 px-2 text-xs font-semibold text-[var(--app-muted)]">{group.label}</p>
                    <div className="space-y-0.5">
                      {group.items.map((conversation) => (
                        <ConversationSidebarItem
                          key={conversation.id}
                          conversation={conversation}
                          projects={projects}
                          active={currentConversationId === conversation.id}
                          onOpen={() => onOpenConversation(conversation.id)}
                          onShare={() => onShareConversation(conversation)}
                          onRename={(title) => onRenameConversation(conversation, title)}
                          onPin={() => onPinConversation(conversation)}
                          onMove={(project) => onMoveConversation(conversation, project)}
                          onArchive={() => onArchiveConversation(conversation)}
                          onDelete={() => onDeleteConversation(conversation)}
                          onNewProject={() => onCreateProjectForConversation(conversation)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-2 py-3 text-xs text-[var(--app-muted)]">
                  Your conversations will appear here.
                </p>
              )}
            </div>
          </div>
        )}
        </div>

        <div ref={accountMenuRef} className="relative mt-auto">
          {accountMenuOpen && (
            <div
              className={`absolute bottom-14 z-20 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-2xl ${
                collapsed ? "left-0 w-64" : "left-0 right-0"
              }`}
            >
              <div className="border-b border-[var(--app-border)] p-3">
                <p className="truncate text-sm font-semibold">{accountName}</p>
                <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{accountEmail}</p>
                <div className="mt-3 inline-flex rounded-full bg-[var(--app-surface-muted)] px-2.5 py-1 text-xs font-semibold">
                  {planLabel}
                </div>
              </div>
              <AccountMenuButton icon={<User size={17} />} label="Account" onClick={() => {
                setAccountMenuOpen(false);
                onAccount();
              }} />
              <AccountMenuButton icon={<PersonalizationMark size={17} />} label="Personalization" onClick={() => {
                setAccountMenuOpen(false);
                onPersonalization();
              }} />
              <AccountMenuButton icon={<Settings size={17} />} label="Settings" onClick={() => {
                setAccountMenuOpen(false);
                onSettings();
              }} />
              <AccountMenuButton icon={<CreditCard size={17} />} label="Upgrade" onClick={() => {
                setAccountMenuOpen(false);
                onBilling();
              }} />
              <div className="mt-2 border-t border-[var(--app-border)] pt-2">
                <AccountMenuButton icon={<LogOut size={17} />} label="Log out" onClick={() => {
                  setAccountMenuOpen(false);
                  onLogout();
                }} />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAccountMenuOpen((open) => !open)}
          className={`flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--sidebar-hover)] ${
              collapsed ? "justify-center px-0" : ""
            }`}
            title={accountName}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent)] text-sm font-bold text-[var(--app-accent-text)]">
              {getInitials(accountName)}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{accountName}</span>
                <span className="block truncate text-xs text-[var(--app-muted)]">{planLabel}</span>
              </span>
            )}
            {!collapsed && <ChevronDown size={16} className={`shrink-0 transition ${accountMenuOpen ? "rotate-180" : ""}`} />}
          </button>
        </div>
      </div>
    </aside>
  );
}

function AccountMenuButton({
  icon,
  label,
  onClick
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-[var(--app-soft)] hover:bg-[var(--app-surface-muted)]"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function ConversationSidebarItem({
  conversation,
  projects,
  active,
  onOpen,
  onShare,
  onRename,
  onPin,
  onMove,
  onArchive,
  onDelete,
  onNewProject
}: {
  conversation: ConversationSummary;
  projects: Project[];
  active: boolean;
  onOpen: () => void;
  onShare: () => void;
  onRename: (title: string) => void;
  onPin: () => void;
  onMove: (project: Project | null) => void;
  onArchive: () => void;
  onDelete: () => void;
  onNewProject: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conversation.title);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: Event) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return;
      setMenuOpen(false);
      setProjectMenuOpen(false);
    };
    document.addEventListener("click", closeMenu);
    document.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuOpen]);

  const toggleMenu = (button: HTMLButtonElement) => {
    if (menuOpen) {
      setMenuOpen(false);
      setProjectMenuOpen(false);
      return;
    }

    const rect = button.getBoundingClientRect();
    const menuWidth = 224;
    const estimatedMenuHeight = conversation.projectId ? 300 : 264;
    const gap = 4;
    const opensUp = window.innerHeight - rect.bottom < estimatedMenuHeight + gap;
    const top = opensUp
      ? Math.max(8, rect.top - estimatedMenuHeight - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - estimatedMenuHeight - 8);
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8
    );

    setMenuPosition({ top, left });
    setMenuOpen(true);
    setProjectMenuOpen(false);
  };

  const saveTitle = () => {
    const title = draftTitle.trim();
    setRenaming(false);
    if (title && title !== conversation.title) onRename(title);
    else setDraftTitle(conversation.title);
  };

  return (
    <div ref={containerRef} className="group relative">
      <div className={`flex h-9 items-center rounded-md transition ${
        active
          ? "bg-[var(--sidebar-active)] text-[var(--app-text)] shadow-[inset_2px_0_0_rgba(116,132,255,0.16)]"
          : "text-[var(--app-soft)] hover:bg-[var(--sidebar-hover)]"
      }`}>
        {renaming ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveTitle();
              if (event.key === "Escape") {
                setDraftTitle(conversation.title);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onOpen}
            title={conversation.title}
            className="min-w-0 flex-1 truncate px-2 text-left text-sm"
          >
            {conversation.title}
          </button>
        )}
        {!renaming && (
          <button
            type="button"
            onClick={(event) => toggleMenu(event.currentTarget)}
            className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-[var(--sidebar-hover)] ${
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            title="Conversation options"
          >
            <MoreHorizontal size={16} />
          </button>
        )}
      </div>

      {menuOpen && (
        <div
          className="fixed z-[100] w-56 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-2xl"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          onClick={(event) => event.stopPropagation()}
        >
          <ConversationMenuButton icon={<Share2 size={16} />} label="Share" onClick={() => {
            setMenuOpen(false);
            onShare();
          }} />
          <ConversationMenuButton icon={<Pencil size={16} />} label="Rename" onClick={() => {
            setMenuOpen(false);
            setRenaming(true);
          }} />
          <div className="relative">
            <ConversationMenuButton
              icon={<FolderKanban size={16} />}
              label="Move to project"
              suffix={<ChevronDown size={15} className="-rotate-90" />}
              onClick={() => setProjectMenuOpen((open) => !open)}
            />
            {projectMenuOpen && (
              <div className="absolute left-full top-0 z-[110] ml-1 max-h-60 w-52 overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-1.5 shadow-2xl">
                {projects.map((project) => (
                  <ConversationMenuButton
                    key={project.id}
                    icon={<FolderKanban size={15} />}
                    label={project.name}
                    active={conversation.projectId === project.id}
                    onClick={() => {
                      setMenuOpen(false);
                      setProjectMenuOpen(false);
                      onMove(project);
                    }}
                  />
                ))}
                {projects.length > 0 && <div className="my-1 border-t border-[var(--app-border)]" />}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setProjectMenuOpen(false);
                    onNewProject();
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-[var(--app-soft)] hover:bg-[var(--sidebar-hover)]"
                >
                  <Plus size={15} />
                  Create new project
                </button>
              </div>
            )}
          </div>
          {conversation.projectId && (
            <ConversationMenuButton
              icon={<X size={16} />}
              label={`Remove from ${conversation.projectName || "project"}`}
              onClick={() => {
                setMenuOpen(false);
                onMove(null);
              }}
            />
          )}
          <div className="my-1 border-t border-[var(--app-border)]" />
          <ConversationMenuButton
            icon={<Pin size={16} />}
            label={conversation.isPinned ? "Unpin chat" : "Pin chat"}
            onClick={() => {
              setMenuOpen(false);
              onPin();
            }}
          />
          <ConversationMenuButton icon={<Archive size={16} />} label="Archive" onClick={() => {
            setMenuOpen(false);
            onArchive();
          }} />
          <ConversationMenuButton icon={<Trash2 size={16} />} label="Delete" danger onClick={() => {
            setMenuOpen(false);
            onDelete();
          }} />
        </div>
      )}
    </div>
  );
}

function ConversationMenuButton({
  icon,
  label,
  suffix,
  active = false,
  danger = false,
  onClick
}: {
  icon: ReactNode;
  label: string;
  suffix?: ReactNode;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition hover:bg-[var(--sidebar-hover)] ${
        danger ? "text-red-400" : active ? "bg-[var(--sidebar-active)] text-[var(--app-text)]" : "text-[var(--app-soft)]"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {suffix}
    </button>
  );
}

function ProjectSidebarItem({
  project,
  projects,
  conversations,
  currentConversationId,
  onRename,
  onShare,
  onSettings,
  onDelete,
  onOpenConversation,
  onShareConversation,
  onRenameConversation,
  onPinConversation,
  onMoveConversation,
  onArchiveConversation,
  onDeleteConversation,
  onCreateProjectForConversation
}: {
  project: Project;
  projects: Project[];
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  onRename: (name: string) => void;
  onShare: () => void;
  onSettings: () => void;
  onDelete: () => void;
  onOpenConversation: (conversationId: string) => void;
  onShareConversation: (conversation: ConversationSummary) => void;
  onRenameConversation: (conversation: ConversationSummary, title: string) => void;
  onPinConversation: (conversation: ConversationSummary) => void;
  onMoveConversation: (conversation: ConversationSummary, project: Project | null) => void;
  onArchiveConversation: (conversation: ConversationSummary) => void;
  onDeleteConversation: (conversation: ConversationSummary) => void;
  onCreateProjectForConversation: (conversation: ConversationSummary) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(project.name);

  useEffect(() => {
    setDraftName(project.name);
  }, [project.name]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: MouseEvent | TouchEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("touchstart", closeMenu);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("touchstart", closeMenu);
    };
  }, [menuOpen]);

  const saveName = () => {
    const nextName = draftName.trim();
    if (nextName && nextName !== project.name) {
      onRename(nextName);
    } else {
      setDraftName(project.name);
    }
    setRenaming(false);
  };

  return (
    <div ref={containerRef} className="relative mt-1">
      <div className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-sm text-[var(--app-muted)] hover:bg-[var(--app-surface-muted)]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--app-muted)]" />
        {renaming ? (
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveName();
              if (event.key === "Escape") {
                setDraftName(project.name);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded bg-[var(--app-surface)] px-2 py-1 text-[var(--app-text)] outline-none"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setConversationsOpen((open) => !open)}
            className="min-w-0 flex flex-1 items-center gap-1 text-left"
          >
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            <ChevronDown size={14} className={`shrink-0 transition ${conversationsOpen ? "rotate-180" : ""}`} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-muted)] hover:bg-[var(--app-surface)]"
          title="Project options"
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && (
          <div className="absolute left-8 right-0 top-8 z-50 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1 shadow-2xl">
            <ProjectMenuButton icon={<Share2 size={15} />} label="Share project" onClick={() => {
              setMenuOpen(false);
              onShare();
            }} />
            <ProjectMenuButton icon={<Edit3 size={15} />} label="Rename project" onClick={() => {
              setMenuOpen(false);
              setRenaming(true);
            }} />
            <ProjectMenuButton icon={<Settings size={15} />} label="Project settings" onClick={() => {
              setMenuOpen(false);
              onSettings();
            }} />
            <ProjectMenuButton icon={<Trash2 size={15} />} label="Delete project" danger onClick={() => {
              setMenuOpen(false);
              onDelete();
            }} />
          </div>
        )}
      </div>

      {conversationsOpen && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-[var(--app-border)] pl-2">
          {conversations.length ? conversations.map((conversation) => (
            <ConversationSidebarItem
              key={conversation.id}
              conversation={conversation}
              projects={projects}
              active={currentConversationId === conversation.id}
              onOpen={() => onOpenConversation(conversation.id)}
              onShare={() => onShareConversation(conversation)}
              onRename={(title) => onRenameConversation(conversation, title)}
              onPin={() => onPinConversation(conversation)}
              onMove={(destination) => onMoveConversation(conversation, destination)}
              onArchive={() => onArchiveConversation(conversation)}
              onDelete={() => onDeleteConversation(conversation)}
              onNewProject={() => onCreateProjectForConversation(conversation)}
            />
          )) : (
            <p className="px-2 py-1.5 text-xs text-[var(--app-muted)]">No content in this project.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectMenuButton({
  icon,
  label,
  danger = false,
  onClick
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-[var(--app-surface-muted)] ${
        danger ? "text-red-400" : "text-[var(--app-soft)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function GeneratorView({
  topic,
  workflowId,
  audience,
  tone,
  videoType,
  length,
  durationOptions,
  loading,
  pendingResponseAfterUserId,
  chatMessages,
  libraryItems,
  projects,
  setTopic,
  setWorkflowId,
  setAudience,
  setTone,
  setVideoType,
  setLength,
  onCreateLibraryItem,
  onOpenLibrary,
  generateScript,
  onEditPrompt,
  onRetryResponse,
  onAddResponseToLibrary,
  onResponseFeedback
}: {
  topic: string;
  workflowId: WorkflowId;
  audience: string;
  tone: string;
  videoType: "long" | "shorts";
  length: number;
  durationOptions: number[];
  loading: boolean;
  pendingResponseAfterUserId: string | null;
  chatMessages: ChatThreadMessage[];
  libraryItems: LibraryItem[];
  projects: Project[];
  setTopic: (value: string) => void;
  setWorkflowId: (value: WorkflowId) => void;
  setAudience: (value: string) => void;
  setTone: (value: string) => void;
  setVideoType: (value: "long" | "shorts") => void;
  setLength: (value: number) => void;
  onCreateLibraryItem: (item: Omit<LibraryItem, "id" | "createdAt">) => Promise<void>;
  onOpenLibrary: () => void;
  generateScript: (options?: {
    prompt?: string;
    workflowId?: WorkflowId;
    replaceUserMessageId?: string;
    replaceAssistantMessageId?: string;
  }) => void;
  onEditPrompt: (
    message: ChatThreadMessage,
    nextPrompt: string,
    assistantMessage?: ChatThreadMessage
  ) => Promise<void>;
  onRetryResponse: (
    message: ChatThreadMessage,
    assistantMessage?: ChatThreadMessage
  ) => Promise<void>;
  onAddResponseToLibrary: (message: ChatThreadMessage, sourcePrompt?: string) => Promise<void>;
  onResponseFeedback: (message: ChatThreadMessage, rating: "good" | "bad") => Promise<void>;
}) {
  const hasConversation = loading || chatMessages.length > 0;
  const canSubmit = Boolean(topic.trim()) && Boolean(audience.trim()) && !loading;
  const submit = () => {
    if (!canSubmit) return;
    generateScript();
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-3xl px-5 pt-5 md:px-8">
        <MobileTopBar />
      </div>

      {!hasConversation ? (
        <div className="flex flex-1 items-center justify-center px-5 pb-20 pt-10 md:px-8">
          <div className="w-full max-w-3xl">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-semibold md:text-4xl">What are we creating today?</h1>
              <p className="mt-3 text-sm text-[var(--app-muted)]">Ask for ideas, scripts, strategy, production plans, or posting guidance.</p>
            </div>
            <ChatComposer
              topic={topic}
              workflowId={workflowId}
              audience={audience}
              tone={tone}
              videoType={videoType}
              length={length}
              durationOptions={durationOptions}
              loading={loading}
              recentLibraryItems={libraryItems}
              projects={projects}
              onTopicChange={setTopic}
              onWorkflowChange={setWorkflowId}
              onAudienceChange={setAudience}
              onToneChange={setTone}
              onVideoTypeChange={setVideoType}
              onLengthChange={setLength}
              onCreateLibraryItem={onCreateLibraryItem}
              onOpenLibrary={onOpenLibrary}
              onSubmit={submit}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="mx-auto w-full max-w-3xl flex-1 px-5 pb-44 pt-6 md:px-8">
            <ChatThread
              messages={chatMessages}
              loading={loading}
              pendingResponseAfterUserId={pendingResponseAfterUserId}
              onEditPrompt={onEditPrompt}
              onRetryResponse={onRetryResponse}
              onAddResponseToLibrary={onAddResponseToLibrary}
              onResponseFeedback={onResponseFeedback}
            />

            {loading && !pendingResponseAfterUserId && <ThinkingIndicator className="mt-6" />}

          </div>

          <div className="sticky bottom-0 bg-[var(--app-bg)]/95 px-5 py-4 backdrop-blur md:px-8">
            <div className="mx-auto w-full max-w-3xl">
              <ChatComposer
                topic={topic}
                workflowId={workflowId}
                audience={audience}
                tone={tone}
                videoType={videoType}
                length={length}
                durationOptions={durationOptions}
                loading={loading}
                recentLibraryItems={libraryItems}
                projects={projects}
                compact
                onTopicChange={setTopic}
                onWorkflowChange={setWorkflowId}
                onAudienceChange={setAudience}
                onToneChange={setTone}
                onVideoTypeChange={setVideoType}
                onLengthChange={setLength}
                onCreateLibraryItem={onCreateLibraryItem}
                onOpenLibrary={onOpenLibrary}
                onSubmit={submit}
              />
              <p className="mt-2 text-center text-xs text-[var(--app-muted)]">Innkwise can make mistakes. Review important details before publishing.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ChatThread({
  messages,
  loading,
  pendingResponseAfterUserId,
  onEditPrompt,
  onRetryResponse,
  onAddResponseToLibrary,
  onResponseFeedback
}: {
  messages: ChatThreadMessage[];
  loading: boolean;
  pendingResponseAfterUserId: string | null;
  onEditPrompt: (
    message: ChatThreadMessage,
    nextPrompt: string,
    assistantMessage?: ChatThreadMessage
  ) => Promise<void>;
  onRetryResponse: (
    message: ChatThreadMessage,
    assistantMessage?: ChatThreadMessage
  ) => Promise<void>;
  onAddResponseToLibrary: (message: ChatThreadMessage, sourcePrompt?: string) => Promise<void>;
  onResponseFeedback: (message: ChatThreadMessage, rating: "good" | "bad") => Promise<void>;
}) {
  const [actionStatus, setActionStatus] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, "good" | "bad">>({});
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptDraft, setEditingPromptDraft] = useState("");
  if (!messages.length) return null;

  const setTemporaryStatus = (messageId: string, status: string) => {
    setActionStatus((current) => ({ ...current, [messageId]: status }));
    window.setTimeout(() => {
      setActionStatus((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
    }, 1800);
  };

  const copyMessage = async (message: ChatThreadMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setTemporaryStatus(message.id, "copied");
    } catch {
      alert("Unable to copy this message.");
    }
  };

  const shareMessage = async (message: ChatThreadMessage) => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text: message.content });
        return;
      }
      await navigator.clipboard.writeText(message.content);
      setTemporaryStatus(message.id, "shared");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      alert("Unable to share this prompt.");
    }
  };

  return (
    <div className="space-y-7">
      {messages.map((message, index) => {
        const sourcePrompt = message.role === "assistant"
          ? [...messages.slice(0, index)].reverse().find((candidate) => candidate.role === "user")
          : undefined;
        const nextAssistantMessage = message.role === "user"
          ? messages
              .slice(index + 1)
              .find((candidate) => candidate.role === "assistant" || candidate.role === "user")
          : undefined;
        const pairedAssistantMessage = nextAssistantMessage?.role === "assistant"
          ? nextAssistantMessage
          : undefined;
        const isEditingPrompt = message.role === "user" && editingPromptId === message.id;
        return (
        <Fragment key={message.id}>
        <div
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          {message.role === "user" ? (
            <div className="flex max-w-[85%] flex-col items-end">
              <div className="rounded-2xl bg-[var(--app-surface-muted)] px-4 py-3 text-sm text-[var(--app-text)]">
                {isEditingPrompt ? (
                  <textarea
                    autoFocus
                    value={editingPromptDraft}
                    onChange={(event) => setEditingPromptDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        const nextPrompt = editingPromptDraft.trim();
                        if (!nextPrompt) return;
                        setEditingPromptId(null);
                        void onEditPrompt(message, nextPrompt, pairedAssistantMessage);
                      }
                      if (event.key === "Escape") {
                        setEditingPromptId(null);
                        setEditingPromptDraft("");
                      }
                    }}
                    className="min-h-24 w-[min(34rem,70vw)] resize-y bg-transparent text-sm font-medium leading-6 outline-none"
                  />
                ) : (
                  <p className="whitespace-pre-wrap font-medium leading-6">{message.content}</p>
                )}
              </div>
              <div className="mt-1 flex items-center justify-end gap-0.5">
                {isEditingPrompt ? (
                  <>
                    <button
                      type="button"
                      disabled={loading || !editingPromptDraft.trim()}
                      onClick={() => {
                        const nextPrompt = editingPromptDraft.trim();
                        if (!nextPrompt) return;
                        setEditingPromptId(null);
                        void onEditPrompt(message, nextPrompt, pairedAssistantMessage);
                      }}
                      className="h-8 rounded-md bg-[var(--app-accent)] px-3 text-xs font-semibold text-[var(--app-accent-text)] disabled:opacity-40"
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPromptId(null);
                        setEditingPromptDraft("");
                      }}
                      className="h-8 rounded-md px-3 text-xs font-semibold text-[var(--app-muted)] hover:bg-[var(--app-surface-muted)]"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                <MessageActionButton
                  label={actionStatus[message.id] === "copied" ? "Copied" : "Copy prompt"}
                  icon={actionStatus[message.id] === "copied" ? <Check size={15} /> : <Copy size={15} />}
                  onClick={() => void copyMessage(message)}
                />
                <MessageActionButton
                  label={actionStatus[message.id] === "shared" ? "Copied for sharing" : "Share prompt"}
                  icon={<Share2 size={15} />}
                  onClick={() => void shareMessage(message)}
                />
                <MessageActionButton
                  label="Edit prompt"
                  icon={<Pencil size={15} />}
                  disabled={loading}
                  onClick={() => {
                    setEditingPromptId(message.id);
                    setEditingPromptDraft(message.content);
                  }}
                />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-none text-[var(--app-text)]">
              {message.isTyping ? (
                <TypewriterMarkdown text={message.content} />
              ) : message.type === "workflow" ? (
                <WorkflowRenderer
                  result={message.result}
                  content={message.content}
                  renderMarkdown={(markdown) => <MarkdownContent text={markdown} />}
                />
              ) : (
                <MarkdownContent text={message.content} />
              )}
              <div className="mt-2 flex items-center gap-0.5">
                <MessageActionButton
                  label={actionStatus[message.id] === "copied" ? "Copied" : "Copy response"}
                  icon={actionStatus[message.id] === "copied" ? <Check size={15} /> : <Copy size={15} />}
                  onClick={() => void copyMessage(message)}
                />
                <MessageActionButton
                  label="Good response"
                  active={feedback[message.id] === "good"}
                  icon={<ThumbsUp size={15} />}
                  onClick={() => {
                    setFeedback((current) => ({ ...current, [message.id]: "good" }));
                    void onResponseFeedback(message, "good").catch(() => {
                      setFeedback((current) => {
                        const next = { ...current };
                        delete next[message.id];
                        return next;
                      });
                    });
                  }}
                />
                <MessageActionButton
                  label="Bad response"
                  active={feedback[message.id] === "bad"}
                  icon={<ThumbsDown size={15} />}
                  onClick={() => {
                    setFeedback((current) => ({ ...current, [message.id]: "bad" }));
                    void onResponseFeedback(message, "bad").catch(() => {
                      setFeedback((current) => {
                        const next = { ...current };
                        delete next[message.id];
                        return next;
                      });
                    });
                  }}
                />
                <MessageActionButton
                  label={actionStatus[message.id] === "saved" ? "Added to Library" : "Add to project sources"}
                  icon={actionStatus[message.id] === "saved" ? <Check size={15} /> : <FolderPlus size={15} />}
                  onClick={() => {
                    void onAddResponseToLibrary(message, sourcePrompt?.content)
                      .then(() => setTemporaryStatus(message.id, "saved"))
                      .catch(() => alert("Unable to add this response to the Library."));
                  }}
                />
                {sourcePrompt && (
                  <MessageActionButton
                    label="Try again"
                    icon={<RotateCcw size={15} />}
                    disabled={loading}
                    onClick={() => void onRetryResponse(sourcePrompt, message)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        {message.role === "user" && pendingResponseAfterUserId === message.id && (
          <ThinkingIndicator className="mt-3" />
        )}
        </Fragment>
      );
      })}
    </div>
  );
}

function ThinkingIndicator({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-sm text-[var(--app-muted)] ${className}`}>
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--app-accent)]" />
      Thinking
    </div>
  );
}

function MessageActionButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex h-8 w-8 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-[var(--app-surface-muted)] text-[var(--app-text)]"
          : "text-[var(--app-muted)] hover:bg-[var(--app-surface-muted)] hover:text-[var(--app-text)]"
      }`}
    >
      {icon}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
        {label}
      </span>
    </button>
  );
}

function TypewriterMarkdown({ text }: { text: string }) {
  const [visibleLength, setVisibleLength] = useState(0);

  useEffect(() => {
    setVisibleLength(0);
    if (!text) return;

    const tick = window.setInterval(() => {
      setVisibleLength((current) => {
        if (current >= text.length) {
          window.clearInterval(tick);
          return current;
        }

        const remaining = text.length - current;
        const step = remaining > 1800 ? 90 : remaining > 800 ? 55 : remaining > 280 ? 28 : 14;
        return Math.min(text.length, current + step);
      });
    }, 28);

    return () => window.clearInterval(tick);
  }, [text]);

  return (
    <div className="relative">
      <MarkdownContent text={text.slice(0, visibleLength)} />
      {visibleLength < text.length && (
        <span className="ml-0.5 inline-block h-4 w-1 animate-pulse rounded-full bg-[var(--app-accent)] align-middle" />
      )}
    </div>
  );
}

function WorkflowIcon({ icon, size = 18 }: { icon: WorkflowTemplate["icon"]; size?: number }) {
  if (icon === "chat") return <MessageSquareText size={size} />;
  if (icon === "search") return <Search size={size} />;
  if (icon === "strategy") return <SlidersHorizontal size={size} />;
  if (icon === "script") return <MessageSquareText size={size} />;
  if (icon === "production") return <Archive size={size} />;
  return <Share2 size={size} />;
}

function ChatComposer({
  topic,
  workflowId,
  audience,
  loading,
  recentLibraryItems,
  projects,
  compact = false,
  onTopicChange,
  onWorkflowChange,
  onVideoTypeChange,
  onLengthChange,
  onCreateLibraryItem,
  onOpenLibrary,
  onSubmit
}: {
  topic: string;
  workflowId: WorkflowId;
  audience: string;
  tone: string;
  videoType: "long" | "shorts";
  length: number;
  durationOptions: number[];
  loading: boolean;
  recentLibraryItems: LibraryItem[];
  projects: Project[];
  compact?: boolean;
  onTopicChange: (value: string) => void;
  onWorkflowChange: (value: WorkflowId) => void;
  onAudienceChange: (value: string) => void;
  onToneChange: (value: string) => void;
  onVideoTypeChange: (value: "long" | "shorts") => void;
  onLengthChange: (value: number) => void;
  onCreateLibraryItem: (item: Omit<LibraryItem, "id" | "createdAt">) => Promise<void>;
  onOpenLibrary: () => void;
  onSubmit: () => void;
}) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"recent" | "projects" | "workflows" | null>(null);
  const [moreWorkflowsOpen, setMoreWorkflowsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const canSubmit = Boolean(topic.trim()) && Boolean(audience.trim()) && !loading;
  const recentItems = [...recentLibraryItems]
    .sort((a, b) => getLibraryItemTime(b) - getLibraryItemTime(a))
    .slice(0, 5);
  const primaryWorkflowShortcuts = shortcutTemplates.slice(0, 3);
  const overflowWorkflowShortcuts = shortcutTemplates.slice(3);

  useEffect(() => {
    if (!menuOpen && !moreWorkflowsOpen) return;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && composerRef.current?.contains(target)) return;
      setMenuOpen(false);
      setSubmenu(null);
      setMoreWorkflowsOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
    };
  }, [menuOpen, moreWorkflowsOpen]);

  const chooseWorkflow = (template: WorkflowTemplate) => {
    onWorkflowChange(template.id);
    if (template.starterPrompt && !topic.trim()) {
      onTopicChange(template.starterPrompt);
    }
    if (template.id === "generate-script") {
      onVideoTypeChange("long");
      onLengthChange(8);
    } else if (template.workflowType === "distribution" || template.workflowType === "production") {
      onVideoTypeChange("shorts");
      onLengthChange(1);
    }
    setMenuOpen(false);
    setSubmenu(null);
    setMoreWorkflowsOpen(false);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return;

    try {
      setUploading(true);
      const names: string[] = [];
      for (const file of Array.from(files)) {
        await onCreateLibraryItem(await fileToLibraryItem(file));
        names.push(file.name);
      }
      const uploadContext = `Use uploaded files: ${names.join(", ")}`;
      onTopicChange(topic.trim() ? `${topic.trim()}\n\n${uploadContext}` : uploadContext);
      setMenuOpen(false);
      setSubmenu(null);
    } catch {
      alert("Unable to upload files.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div ref={composerRef}>
      <div className="innkwise-composer-shell relative rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 shadow-2xl">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void handleFileUpload(event.target.files)}
        />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMenuOpen((open) => !open);
            setSubmenu(null);
            setMoreWorkflowsOpen(false);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--app-surface-muted)] text-[var(--app-text)] hover:bg-[var(--app-border)]"
          title="Add content"
        >
          <Plus size={20} />
        </button>
        <textarea
          id="creator-chat-input"
          value={topic}
          onChange={(event) => onTopicChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-5 text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)]"
          placeholder="Ask Innkwise anything about your content..."
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent)] text-[var(--app-accent-text)] transition disabled:opacity-40"
          title={loading ? "Thinking" : "Send"}
        >
          <ArrowUp size={20} className={loading ? "animate-pulse" : ""} />
        </button>
      </div>

      {menuOpen && (
        <div className={`absolute left-3 z-40 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-2xl ${
          compact ? "bottom-[calc(100%+8px)]" : "top-[calc(100%-4px)]"
        }`}>
          <ComposerMenuButton icon={<Upload size={18} />} label={uploading ? "Uploading..." : "Upload files"} disabled={uploading} onClick={() => fileInputRef.current?.click()} />
          <ComposerMenuButton icon={<FileText size={18} />} label="Recent Files" hasSubmenu active={submenu === "recent"} onClick={() => setSubmenu(submenu === "recent" ? null : "recent")} />
          <ComposerMenuButton icon={<FolderKanban size={18} />} label="Projects" hasSubmenu active={submenu === "projects"} onClick={() => setSubmenu(submenu === "projects" ? null : "projects")} />
          <ComposerMenuButton icon={<SlidersHorizontal size={18} />} label="Creator Workflows" hasSubmenu active={submenu === "workflows"} onClick={() => setSubmenu(submenu === "workflows" ? null : "workflows")} />
        </div>
      )}

      {menuOpen && submenu && (
        <div className={`absolute z-40 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-2xl ${
          compact
            ? "bottom-[calc(100%+8px)] left-3 md:left-[300px]"
            : "left-[300px] top-[calc(100%+40px)]"
        }`}>
          {submenu === "recent" && (
            <>
              <ComposerMenuButton icon={<Library size={18} />} label="Add from Library" onClick={() => {
                setMenuOpen(false);
                setSubmenu(null);
                onOpenLibrary();
              }} />
              <div className="my-2 border-t border-[var(--app-border)]" />
              <p className="px-3 py-2 text-xs font-semibold uppercase text-[var(--app-muted)]">Recents</p>
              {recentItems.length ? recentItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onTopicChange(topic.trim() ? `${topic.trim()}\n\nUse library item: ${item.name}` : `Use library item: ${item.name}`);
                    setMenuOpen(false);
                    setSubmenu(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[var(--app-surface-muted)]"
                >
                  <FileText size={17} className="shrink-0 text-[var(--app-muted)]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="block text-xs text-[var(--app-muted)]">{item.kind} · {formatFileSize(item.size)}</span>
                  </span>
                </button>
              )) : (
                <p className="px-3 py-4 text-sm text-[var(--app-muted)]">No recent files yet.</p>
              )}
            </>
          )}

          {submenu === "projects" && (
            projects.length ? projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  onTopicChange(topic.trim() ? `${topic.trim()}\n\nProject context: ${project.name}` : `Project context: ${project.name}`);
                  setMenuOpen(false);
                  setSubmenu(null);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[var(--app-surface-muted)]"
              >
                <FolderKanban size={17} className="shrink-0 text-[var(--app-muted)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{project.name}</span>
                  <span className="block truncate text-xs text-[var(--app-muted)]">{project.instructions || "No instructions"}</span>
                </span>
              </button>
            )) : (
              <p className="px-3 py-4 text-sm text-[var(--app-muted)]">No projects created yet.</p>
            )
          )}

          {submenu === "workflows" && (
            <>
              {shortcutTemplates.map((template) => (
                <ComposerMenuButton
                  key={template.id}
                  icon={<WorkflowIcon icon={template.icon} size={18} />}
                  label={template.title}
                  active={workflowId === template.id}
                  onClick={() => chooseWorkflow(template)}
                />
              ))}
            </>
          )}
        </div>
      )}
      </div>

      {!compact && (
        <div className="relative mt-3 flex flex-wrap justify-center gap-2">
          {primaryWorkflowShortcuts.map((template) => (
            <QuickWorkflowButton
              key={template.id}
              active={workflowId === template.id}
              template={template}
              onClick={() => chooseWorkflow(template)}
            />
          ))}
          {overflowWorkflowShortcuts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMoreWorkflowsOpen((open) => !open);
                setMenuOpen(false);
                setSubmenu(null);
              }}
              className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--app-border)] px-3 text-xs font-medium text-[var(--app-soft)] transition hover:bg-[var(--app-surface-muted)]"
            >
              More
              <ChevronDown size={14} />
            </button>
          )}
          {moreWorkflowsOpen && (
            <div className="absolute right-0 top-10 z-40 w-64 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 shadow-2xl">
              {overflowWorkflowShortcuts.map((template) => (
                <ComposerMenuButton
                  key={template.id}
                  icon={<WorkflowIcon icon={template.icon} size={18} />}
                  label={template.title}
                  active={workflowId === template.id}
                  onClick={() => chooseWorkflow(template)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComposerMenuButton({
  icon,
  label,
  active = false,
  disabled = false,
  hasSubmenu = false,
  onClick
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  hasSubmenu?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium disabled:opacity-50 ${
        active ? "bg-[var(--app-surface-muted)] text-[var(--app-text)]" : "text-[var(--app-soft)] hover:bg-[var(--app-surface-muted)]"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hasSubmenu && <ChevronDown size={15} className="-rotate-90 text-[var(--app-muted)]" />}
    </button>
  );
}

function QuickWorkflowButton({
  template,
  active,
  onClick
}: {
  template: WorkflowTemplate;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
        active
          ? "border-[var(--border-active)] bg-[var(--sidebar-active)] text-[var(--app-text)] shadow-[0_0_0_3px_rgba(166,124,255,0.06)]"
          : "border-[var(--app-border)] text-[var(--app-soft)] hover:border-[var(--border-active)] hover:bg-[var(--sidebar-hover)]"
      }`}
      title={template.title}
    >
      <WorkflowIcon icon={template.icon} size={13} />
      <span>{template.title}</span>
    </button>
  );
}

function LibraryView({
  filter,
  items,
  search,
  loading,
  onFilterChange,
  onSearchChange,
  onCreateItem,
  onDeleteItems,
  onUpdateFavorite,
  onNewContent
}: {
  filter: LibraryKind;
  items: LibraryItem[];
  search: string;
  loading: boolean;
  onFilterChange: (filter: LibraryKind) => void;
  onSearchChange: (search: string) => void;
  onCreateItem: (item: Omit<LibraryItem, "id" | "createdAt">) => Promise<void>;
  onDeleteItems: (ids: string[]) => Promise<void>;
  onUpdateFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  onNewContent: () => void;
}) {
  const filters: LibraryKind[] = ["All", "Images", "Links", "Files"];
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [savingLibraryItem, setSavingLibraryItem] = useState(false);
  const [viewMode, setViewMode] = useState<LibraryViewMode>("grid");
  const [sortDirection, setSortDirection] = useState<LibrarySortDirection>("desc");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const visibleItems = showFavoritesOnly ? items.filter((item) => item.isFavorite) : items;
  const sortedItems = useMemo(
    () => [...visibleItems].sort((a, b) => sortDirection === "asc" ? getLibraryItemTime(a) - getLibraryItemTime(b) : getLibraryItemTime(b) - getLibraryItemTime(a)),
    [visibleItems, sortDirection]
  );
  const selectedItems = visibleItems.filter((item) => selectedIds.includes(item.id));
  const downloadableSelectedItems = selectedItems.filter((item) => item.kind !== "Links" && item.contentBase64);

  const uploadFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    try {
      setSavingLibraryItem(true);
      for (const file of files) {
        await onCreateItem(await fileToLibraryItem(file));
      }
    } catch {
      alert("Unable to upload one or more files.");
    } finally {
      setSavingLibraryItem(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const addLink = async () => {
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) return;

    try {
      const parsedUrl = new URL(trimmedUrl);
      setSavingLibraryItem(true);
      await onCreateItem({
        kind: "Links",
        name: parsedUrl.hostname.replace(/^www\./, "") || trimmedUrl,
        url: parsedUrl.toString(),
        mimeType: "text/uri-list",
        size: null,
        contentBase64: null
      });
      setLinkUrl("");
    } catch {
      alert("Enter a valid link starting with http:// or https://.");
    } finally {
      setSavingLibraryItem(false);
    }
  };

  const toggleSelection = (itemId: string) => {
    setSelectedIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  };

  const deleteSelectedItems = async () => {
    try {
      await onDeleteItems(selectedIds);
      setSelectedIds([]);
    } catch {
      alert("Unable to delete selected items.");
    }
  };

  return (
    <div className="min-h-screen p-5 md:p-8">
      <MobileTopBar />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Library</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-muted)]" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-9 w-52 rounded-md border border-[var(--app-border)] bg-transparent pl-9 pr-3 text-sm outline-none"
              placeholder="Search files"
            />
          </div>
          <IconButton title="Grid view" active={viewMode === "grid"} onClick={() => setViewMode("grid")}><Grid2X2 size={17} /></IconButton>
          <IconButton title="List view" active={viewMode === "list"} onClick={() => setViewMode("list")}><Menu size={17} /></IconButton>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <div className="flex rounded-md border border-[var(--app-border)] p-1">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onFilterChange(item);
                setSelectedIds([]);
              }}
              className={`h-8 rounded px-3 text-sm ${
                item === filter
                  ? "bg-[var(--app-accent)] text-[var(--app-accent-text)]"
                  : "text-[var(--app-soft)] hover:bg-[var(--app-surface-muted)]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setShowFavoritesOnly((current) => !current);
            setSelectedIds([]);
          }}
          className={`flex h-9 items-center gap-2 rounded-md border border-[var(--app-border)] px-3 text-sm ${
            showFavoritesOnly ? "bg-[var(--app-accent)] text-[var(--app-accent-text)]" : ""
          }`}
        >
          <Star size={16} fill={showFavoritesOnly ? "currentColor" : "none"} />
          My favorites
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void uploadFiles(event.target.files)}
        />
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={savingLibraryItem}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)] disabled:opacity-50"
        >
          <Upload size={17} />
          Upload files
        </button>
        <input
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          className="h-10 rounded-md border border-[var(--app-border)] bg-transparent px-3 text-sm outline-none"
          placeholder="Paste a link to store"
        />
        <button
          type="button"
          onClick={addLink}
          disabled={savingLibraryItem || !linkUrl.trim()}
          className="h-10 rounded-md border border-[var(--app-border)] px-4 text-sm font-semibold disabled:opacity-50"
        >
          Add link
        </button>
      </div>

      <p className="mt-4 text-sm text-[var(--app-muted)]">
        {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}{showFavoritesOnly ? " in favorites" : ""}
      </p>

      {selectedItems.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
          <p className="text-sm font-semibold">{selectedItems.length} selected</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onNewContent} className="h-9 rounded-md bg-[var(--app-surface-muted)] px-3 text-sm font-semibold">
              Start new content
            </button>
            <button
              type="button"
              onClick={() => downloadLibraryItems(downloadableSelectedItems)}
              disabled={!downloadableSelectedItems.length}
              className="h-9 rounded-md bg-[var(--app-surface-muted)] px-3 text-sm font-semibold disabled:opacity-50"
            >
              Download
            </button>
            <button type="button" onClick={deleteSelectedItems} className="h-9 rounded-md bg-red-600 px-3 text-sm font-semibold text-white">
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-col items-center justify-center text-center">
        {sortedItems.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid w-full max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedItems.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  item={item}
                  selected={selectedIds.includes(item.id)}
                  onToggleSelection={() => toggleSelection(item.id)}
                  onToggleFavorite={() => void onUpdateFavorite(item.id, !item.isFavorite)}
                  onDelete={() => void onDeleteItems([item.id])}
                />
              ))}
            </div>
          ) : (
            <LibraryItemList
              items={sortedItems}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
              onToggleFavorite={(item) => void onUpdateFavorite(item.id, !item.isFavorite)}
              onDeleteItem={(itemId) => void onDeleteItems([itemId])}
              sortDirection={sortDirection}
              onToggleSort={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
            />
          )
        ) : (
          <>
            <Archive className="text-[var(--app-muted)]" size={38} />
            <h2 className="mt-5 font-semibold">{loading ? "Loading library..." : "Nothing in the library"}</h2>
            <p className="mt-2 text-sm text-[var(--app-muted)]">Build your knowledge base here.</p>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)]"
            >
              <Upload size={17} />
              Upload files
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LibraryItemCard({
  item,
  selected,
  onToggleSelection,
  onToggleFavorite,
  onDelete
}: {
  item: LibraryItem;
  selected: boolean;
  onToggleSelection: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const isLink = item.kind === "Links";

  return (
    <div className={`rounded-lg border bg-[var(--app-surface)] p-4 text-left ${selected ? "border-[var(--app-text)]" : "border-[var(--app-border)]"}`}>
      <div className="flex items-start justify-between gap-3">
        <label className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelection}
            className="mt-1 h-4 w-4 accent-blue-500"
          />
          <button
            type="button"
            onClick={() => openLibraryItem(item)}
            className="min-w-0 text-left"
          >
            <div className="flex items-center gap-2">
              {item.kind === "Images" ? <Archive className="text-[var(--app-muted)]" size={20} /> : <FileText className="text-[var(--app-muted)]" size={20} />}
              <span className="rounded-full bg-[var(--app-surface-muted)] px-2 py-0.5 text-xs">{item.kind}</span>
            </div>
            <h2 className="mt-4 truncate font-semibold">{item.name}</h2>
            <p className="mt-1 truncate text-sm text-[var(--app-muted)]">
              {isLink ? item.url : formatFileSize(item.size)}
            </p>
            <p className="mt-4 text-xs text-[var(--app-muted)]">{formatDate(item.createdAt)}</p>
          </button>
        </label>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onToggleFavorite}
            className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs"
            title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star size={14} fill={item.isFavorite ? "currentColor" : "none"} />
          </button>
          {isLink && item.url ? (
            <button type="button" onClick={() => window.open(item.url ?? "", "_blank", "noopener,noreferrer")} className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs">
              Open
            </button>
          ) : (
            <button type="button" onClick={() => downloadLibraryItems([item])} className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs">
              Download
            </button>
          )}
          <button type="button" onClick={onDelete} className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function LibraryItemList({
  items,
  selectedIds,
  sortDirection,
  onToggleSelection,
  onToggleFavorite,
  onDeleteItem,
  onToggleSort
}: {
  items: LibraryItem[];
  selectedIds: string[];
  sortDirection: LibrarySortDirection;
  onToggleSelection: (itemId: string) => void;
  onToggleFavorite: (item: LibraryItem) => void;
  onDeleteItem: (itemId: string) => void;
  onToggleSort: () => void;
}) {
  return (
    <div className="w-full max-w-6xl overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] text-left">
      <div className="grid grid-cols-[48px_minmax(0,1.5fr)_170px_120px_150px] items-center border-b border-[var(--app-border)] px-3 py-2 text-xs font-semibold uppercase text-[var(--app-muted)]">
        <span />
        <span>File name</span>
        <button type="button" onClick={onToggleSort} className="text-left uppercase">
          Modified date {sortDirection === "asc" ? "↑" : "↓"}
        </button>
        <span>Size</span>
        <span className="text-right">Actions</span>
      </div>
      {items.map((item) => {
        const selected = selectedIds.includes(item.id);
        return (
          <div
            key={item.id}
            className={`grid grid-cols-[48px_minmax(0,1.5fr)_170px_120px_150px] items-center border-b border-[var(--app-border)] px-3 py-3 last:border-b-0 ${
              selected ? "bg-[var(--app-surface-muted)]" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelection(item.id)}
              className="h-4 w-4 accent-blue-500"
            />
            <button type="button" onClick={() => openLibraryItem(item)} className="min-w-0 text-left">
              <span className="block truncate text-sm font-semibold">{item.name}</span>
              <span className="block truncate text-xs text-[var(--app-muted)]">{item.kind === "Links" ? item.url : item.mimeType || item.kind}</span>
            </button>
            <span className="text-sm text-[var(--app-muted)]">{formatDate(item.createdAt)}</span>
            <span className="text-sm text-[var(--app-muted)]">{item.kind === "Links" ? "-" : formatFileSize(item.size)}</span>
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => onToggleFavorite(item)}
                className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs"
                title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Star size={14} fill={item.isFavorite ? "currentColor" : "none"} />
              </button>
              {item.kind === "Links" ? (
                <button type="button" onClick={() => openLibraryItem(item)} className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs">
                  Open
                </button>
              ) : (
                <button type="button" onClick={() => downloadLibraryItems([item])} className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs">
                  Download
                </button>
              )}
              <button type="button" onClick={() => onDeleteItem(item.id)} className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs">
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SearchContentDialog({
  query,
  conversations,
  onQueryChange,
  onNewContent,
  onOpenConversation,
  onClose
}: {
  query: string;
  conversations: ConversationSummary[];
  onQueryChange: (query: string) => void;
  onNewContent: () => void;
  onOpenConversation: (conversationId: string) => void;
  onClose: () => void;
}) {
  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sortedConversations = [...conversations].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (!normalizedQuery) return sortedConversations;

    return sortedConversations.filter((conversation) =>
      [conversation.title, conversation.lastMessage, conversation.projectName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, conversations]);
  const groupedConversations = groupConversations(filteredConversations);

  return (
    <ModalFrame title="Search content" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-muted)]" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className="h-11 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] pl-9 pr-3 text-sm outline-none"
              placeholder="Search conversations"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={onNewContent}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)]"
          >
            <Pencil size={17} />
            New Chat
          </button>
        </div>

        {groupedConversations.length ? groupedConversations.map((group) => (
          <SearchContentSection
            key={group.label}
            title={group.label}
            conversations={group.items}
            onOpenConversation={onOpenConversation}
          />
        )) : (
          <div className="rounded-md border border-dashed border-[var(--app-border)] p-5 text-sm text-[var(--app-muted)]">
            No conversations found.
          </div>
        )}
      </div>
    </ModalFrame>
  );
}

function SearchContentSection({
  title,
  conversations,
  onOpenConversation
}: {
  title: string;
  conversations: ConversationSummary[];
  onOpenConversation: (conversationId: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-[var(--app-muted)]">{conversations.length}</span>
      </div>
      {conversations.length ? (
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onOpenConversation(conversation.id)}
              className="block w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 text-left hover:bg-[var(--app-surface)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{conversation.title}</p>
                  <p className="mt-1 truncate text-xs text-[var(--app-muted)]">
                    {conversation.lastMessage || conversation.projectName || "Conversation"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-[var(--app-muted)]">{formatDate(conversation.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-muted)]">
          No conversations in this period.
        </div>
      )}
    </section>
  );
}

function LogoutConfirmDialog({
  userEmail,
  onCancel,
  onConfirm
}: {
  userEmail: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onConfirm]);

  return (
    <ModalFrame title="Are you sure you want to log out?" onClose={onCancel}>
      <div className="space-y-5">
        <p className="text-sm text-[var(--app-muted)]">
          Log Out of Innkwise as <span className="font-semibold text-[var(--app-text)]">{userEmail}</span>?
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-md border border-[var(--app-border)] px-4 text-sm font-semibold hover:bg-[var(--app-surface-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="h-10 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)]"
          >
            Log out
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function RateLimitUpgradeDialog({
  state,
  onClose
}: {
  state: RateLimitModalState;
  onClose: () => void;
}) {
  const quotaItems = [
    ["AI generations", state.remaining?.generations],
    ["Embeddings", state.remaining?.embeddings],
    ["Uploads", state.remaining?.uploads]
  ].filter(([, value]) => value !== undefined);

  return (
    <ModalFrame title={state.title} onClose={onClose}>
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-base font-medium text-[var(--app-text)]">{state.message}</p>
          <p className="text-sm text-[var(--app-muted)]">{state.resetMessage}</p>
        </div>

        {quotaItems.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {quotaItems.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-muted)]">{label}</div>
                <div className="mt-2 text-lg font-semibold text-[var(--app-text)]">
                  {value === "unlimited" ? "Unlimited" : value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4 text-sm text-[var(--app-muted)]">
          Creator unlocks higher daily limits, larger prompts, more uploads, and more room for research and script generation.
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--app-border)] px-4 text-sm font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
          >
            Try tomorrow
          </button>
          {state.showUpgrade && (
            <a
              href="/pricing"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--app-text)] px-4 text-sm font-semibold text-[var(--app-bg)] hover:opacity-90"
            >
              <CreditCard size={16} />
              Upgrade to Creator
            </a>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}

function SettingsDialog({
  activeTab,
  theme,
  accountName,
  userEmail,
  preferences,
  onTabChange,
  onThemeChange,
  onPreferencesChange,
  onLogout,
  onClose
}: {
  activeTab: SettingsTab;
  theme: ThemePreference;
  accountName: string;
  userEmail: string;
  preferences: Preferences;
  onTabChange: (tab: SettingsTab) => void;
  onThemeChange: (theme: ThemePreference) => void;
  onPreferencesChange: (preferences: Preferences) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const {
    subscription,
    loading: subscriptionLoading,
    cancelPlan
  } = useSubscription();
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");
  const setPreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    onPreferencesChange({ ...preferences, [key]: value });
  };

  return (
    <ModalFrame title="Settings" onClose={onClose}>
      <div className="grid min-h-[560px] gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
        <nav className="space-y-1 border-b border-[var(--app-border)] pb-4 md:border-b-0 md:border-r md:pr-4">
          <SettingsTabButton active={activeTab === "general"} icon={<SlidersHorizontal size={17} />} label="General" onClick={() => onTabChange("general")} />
          <SettingsTabButton active={activeTab === "personalization"} icon={<PersonalizationMark size={17} />} label="Personalization" onClick={() => onTabChange("personalization")} />
          <SettingsTabButton active={activeTab === "account"} icon={<User size={17} />} label="Account" onClick={() => onTabChange("account")} />
          <SettingsTabButton active={activeTab === "billing"} icon={<CreditCard size={17} />} label="Usage and Billing" onClick={() => onTabChange("billing")} />
        </nav>

        <div className="space-y-6 overflow-y-auto pr-1">
          {activeTab === "account" && (
            <div className="space-y-4">
              <SectionHeading title="Account" />
              <InfoRow label="Name" value={accountName} />
              <InfoRow label="Email" value={userEmail} />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-4 text-sm font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface)]"
                >
                  <LogOut size={17} />
                  Log out
                </button>
              </div>
            </div>
          )}

          {activeTab === "general" && (
            <div className="space-y-6">
              <SectionHeading title="Theme" />
              <div className="grid gap-3 sm:grid-cols-3">
                <ThemeButton active={theme === "light"} icon={<Sun size={18} />} label="Light" onClick={() => onThemeChange("light")} />
                <ThemeButton active={theme === "dark"} icon={<Moon size={18} />} label="Dark" onClick={() => onThemeChange("dark")} />
                <ThemeButton active={theme === "auto"} icon={<PanelLeftOpen size={18} />} label="Auto" onClick={() => onThemeChange("auto")} />
              </div>

              <div className="border-t border-[var(--app-border)] pt-6">
                <SectionHeading title="Communication preferences" />
                <ToggleRow
                  title="Browser notifications"
                  text="Get notified in your browser when new progress or a task is completed."
                  checked={preferences.browserNotifications}
                  onChange={(checked) => setPreference("browserNotifications", checked)}
                />
                <ToggleRow
                  title="Receive product updates"
                  text="Receive early access to feature releases and success stories to optimize your workflow."
                  checked={preferences.productUpdates}
                  onChange={(checked) => setPreference("productUpdates", checked)}
                />
              </div>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="space-y-4">
              <SectionHeading title="Usage and Billing" />
              <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow
                    label="Current Plan"
                    value={subscriptionLoading ? "Loading..." : subscription?.plan.displayName ?? "Free"}
                  />
                  <InfoRow
                    label="Status"
                    value={subscriptionLoading ? "Loading..." : formatSubscriptionStatus(subscription?.status)}
                  />
                  <InfoRow
                    label="Renewal Date"
                    value={formatBillingDate(subscription?.renewalDate)}
                  />
                  <InfoRow
                    label="Plan Price"
                    value={formatBillingPrice(subscription)}
                  />
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <a
                    href="/pricing"
                    className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--app-text)] px-4 text-sm font-semibold text-[var(--app-bg)] hover:opacity-90"
                  >
                    Upgrade
                  </a>
                  {subscription?.manageUrl && (
                    <a
                      href={subscription.manageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--app-border)] px-4 text-sm font-semibold text-[var(--app-text)] hover:bg-[var(--app-surface)]"
                    >
                      Manage Subscription
                    </a>
                  )}
                  {subscription?.isCreator && subscription.status !== "cancelled" && (
                    <button
                      type="button"
                      disabled={cancelLoading}
                      onClick={async () => {
                        const confirmed = window.confirm(
                          "Cancel Plan?\n\nYour subscription will stop renewing. You will keep full access until the end of your current billing period."
                        );
                        if (!confirmed) return;

                        try {
                          setCancelLoading(true);
                          const nextSubscription = await cancelPlan();
                          setCancelMessage(
                            `Plan cancelled. You keep full access until ${formatBillingDate(nextSubscription.renewalDate)}.`
                          );
                        } catch (error) {
                          setCancelMessage(
                            axios.isAxiosError(error)
                              ? error.response?.data?.error ?? "Unable to cancel plan."
                              : "Unable to cancel plan."
                          );
                        } finally {
                          setCancelLoading(false);
                        }
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-md border border-red-500/40 px-4 text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cancelLoading ? "Cancelling..." : "Cancel Plan"}
                    </button>
                  )}
                </div>
                {subscription?.status === "cancelled" && (
                  <p className="mt-4 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm text-[var(--app-text-muted)]">
                    Your plan is cancelled. You keep full access until {formatBillingDate(subscription.renewalDate)}.
                  </p>
                )}
                {cancelMessage && (
                  <p className="mt-4 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm text-[var(--app-text-muted)]">
                    {cancelMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "personalization" && (
            <PersonalizationPanel preferences={preferences} onChange={onPreferencesChange} />
          )}
        </div>
      </div>
    </ModalFrame>
  );
}

function PersonalizationPanel({
  preferences,
  onChange
}: {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
}) {
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    onChange({ ...preferences, [key]: value });
  };
  const updateCreator = <K extends keyof Preferences["creatorProfile"]>(key: K, value: Preferences["creatorProfile"][K]) => {
    update("creatorProfile", { ...preferences.creatorProfile, [key]: value });
  };
  const updateGoals = <K extends keyof Preferences["goals"]>(key: K, value: Preferences["goals"][K]) => {
    update("goals", { ...preferences.goals, [key]: value });
  };
  const updateContent = <K extends keyof Preferences["contentProfile"]>(key: K, value: Preferences["contentProfile"][K]) => {
    update("contentProfile", { ...preferences.contentProfile, [key]: value });
  };
  const updatePlatform = <K extends keyof Preferences["platformProfile"]>(key: K, value: Preferences["platformProfile"][K]) => {
    update("platformProfile", { ...preferences.platformProfile, [key]: value });
  };
  const updateWritingSlider = (key: string, value: number) => {
    update("writingPreferences", { ...preferences.writingPreferences, [key]: value });
  };
  const updateAiSlider = (key: string, value: number) => {
    update("aiControls", { ...preferences.aiControls, [key]: value });
  };

  const suggestedArchetypes = suggestArchetypes(preferences);
  const writingScore = averageScore(preferences.writingPreferences);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <PersonalizationMark size={44} className="shrink-0 text-[var(--app-text)]" />
        <SectionHeading title="Personalization" />
      </div>

      <PersonalizationCard title="Creator Profile" description="Identity, expertise, brand language, and creator archetypes.">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Creator Name" value={preferences.creatorProfile.creatorName} onChange={(value) => updateCreator("creatorName", value)} />
          <TextInput label="Brand Name" value={preferences.creatorProfile.brandName} onChange={(value) => updateCreator("brandName", value)} />
          <TextInput label="Tagline" value={preferences.creatorProfile.tagline} onChange={(value) => updateCreator("tagline", value)} />
          <SelectField label="Experience Level" value={preferences.creatorProfile.experienceLevel} options={experienceLevels} onChange={(value) => updateCreator("experienceLevel", value)} />
        </div>
        <TextAreaField label="Creator Bio" value={preferences.creatorProfile.creatorBio} onChange={(value) => updateCreator("creatorBio", value)} />
        <MultiSelect label="Creator Archetypes" options={creatorArchetypes} selected={preferences.creatorProfile.creatorArchetypes} onChange={(value) => updateCreator("creatorArchetypes", value)} />
        <SuggestionStrip label="AI suggestions" suggestions={suggestedArchetypes} onAdd={(value) => updateCreator("creatorArchetypes", uniqueStrings([...preferences.creatorProfile.creatorArchetypes, value]))} />
      </PersonalizationCard>

      <PersonalizationCard title="Creator Goals" description="Choose the main growth direction and score secondary priorities.">
        <SelectField label="Primary Goal" value={preferences.goals.primaryGoal} options={creatorGoals} onChange={(value) => updateGoals("primaryGoal", value)} />
        <MultiSelect label="Secondary Goals" options={creatorGoals.filter((goal) => goal !== preferences.goals.primaryGoal)} selected={preferences.goals.secondaryGoals} onChange={(value) => updateGoals("secondaryGoals", value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          {[preferences.goals.primaryGoal, ...preferences.goals.secondaryGoals].filter(Boolean).map((goal) => (
            <RangeField
              key={goal}
              label={goal}
              value={preferences.goals.priorityScores[goal] ?? 50}
              leftLabel="Low"
              rightLabel="High"
              onChange={(value) => updateGoals("priorityScores", { ...preferences.goals.priorityScores, [goal]: value })}
            />
          ))}
        </div>
      </PersonalizationCard>

      <PersonalizationCard title="Content Profile" description="Define the core niche and sub-niche for generated content.">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Primary Niche" value={preferences.contentProfile.primaryNiche} options={niches} onChange={(value) => updateContent("primaryNiche", value)} />
          <TextInput label="Sub-Niche" value={preferences.contentProfile.subNiche} onChange={(value) => updateContent("subNiche", value)} />
        </div>
      </PersonalizationCard>

      <PersonalizationCard title="Platform Profile" description="Channels, formats, and relative platform weighting.">
        <SelectField label="Primary Platform" value={preferences.platformProfile.primaryPlatform} options={platformOptions} onChange={(value) => updatePlatform("primaryPlatform", value)} />
        <MultiSelect label="Secondary Platforms" options={platformOptions.filter((platform) => platform !== preferences.platformProfile.primaryPlatform)} selected={preferences.platformProfile.secondaryPlatforms} onChange={(value) => updatePlatform("secondaryPlatforms", value)} />
        <MultiSelect label="Content Formats" options={contentFormats} selected={preferences.platformProfile.contentFormats} onChange={(value) => updatePlatform("contentFormats", value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          {[preferences.platformProfile.primaryPlatform, ...preferences.platformProfile.secondaryPlatforms].filter(Boolean).map((platform) => (
            <RangeField
              key={platform}
              label={`${platform} weight`}
              value={preferences.platformProfile.platformWeights[platform] ?? 50}
              leftLabel="Light"
              rightLabel="Heavy"
              onChange={(value) => updatePlatform("platformWeights", { ...preferences.platformProfile.platformWeights, [platform]: value })}
            />
          ))}
        </div>
      </PersonalizationCard>

      <PersonalizationCard title="Knowledge Sources" description="Future-ready source library for RAG, citations, and creator voice alignment.">
        <KnowledgeSourcesEditor preferences={preferences} onChange={onChange} />
      </PersonalizationCard>

      <PersonalizationCard title="Writing Preferences" description={`Writing Profile Score: ${writingScore}/100`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <RangeField label="Writing Complexity" value={preferences.writingPreferences.complexity ?? 50} leftLabel="Simple" rightLabel="Expert" onChange={(value) => updateWritingSlider("complexity", value)} />
          <RangeField label="Tone" value={preferences.writingPreferences.tone ?? 50} leftLabel="Casual" rightLabel="Professional" onChange={(value) => updateWritingSlider("tone", value)} />
          <RangeField label="Length" value={preferences.writingPreferences.length ?? 50} leftLabel="Short" rightLabel="Long" onChange={(value) => updateWritingSlider("length", value)} />
          <RangeField label="Humor" value={preferences.writingPreferences.humor ?? 50} onChange={(value) => updateWritingSlider("humor", value)} />
          <RangeField label="Research Depth" value={preferences.writingPreferences.researchDepth ?? 50} onChange={(value) => updateWritingSlider("researchDepth", value)} />
          <RangeField label="Persuasion" value={preferences.writingPreferences.persuasion ?? 50} onChange={(value) => updateWritingSlider("persuasion", value)} />
          <RangeField label="Storytelling" value={preferences.writingPreferences.storytelling ?? 50} onChange={(value) => updateWritingSlider("storytelling", value)} />
          <RangeField label="Originality" value={preferences.writingPreferences.originality ?? 50} onChange={(value) => updateWritingSlider("originality", value)} />
        </div>
      </PersonalizationCard>

      <PersonalizationCard title="AI Controls" description="Control how boldly and consistently the AI behaves.">
        <div className="grid gap-3 sm:grid-cols-2">
          <RangeField label="Creativity Level" value={preferences.aiControls.creativityLevel ?? 50} onChange={(value) => updateAiSlider("creativityLevel", value)} />
          <RangeField label="Consistency Level" value={preferences.aiControls.consistencyLevel ?? 50} onChange={(value) => updateAiSlider("consistencyLevel", value)} />
          <RangeField label="Research Intensity" value={preferences.aiControls.researchIntensity ?? 50} onChange={(value) => updateAiSlider("researchIntensity", value)} />
          <RangeField label="Voice Adherence" value={preferences.aiControls.voiceAdherence ?? 50} onChange={(value) => updateAiSlider("voiceAdherence", value)} />
          <RangeField label="Risk Taking" value={preferences.aiControls.riskTaking ?? 50} onChange={(value) => updateAiSlider("riskTaking", value)} />
          <RangeField label="Innovation" value={preferences.aiControls.innovation ?? 50} onChange={(value) => updateAiSlider("innovation", value)} />
          <RangeField label="Contrarian Thinking" value={preferences.aiControls.contrarianThinking ?? 50} onChange={(value) => updateAiSlider("contrarianThinking", value)} />
          <RangeField label="Emotional Intensity" value={preferences.aiControls.emotionalIntensity ?? 50} onChange={(value) => updateAiSlider("emotionalIntensity", value)} />
        </div>
      </PersonalizationCard>
    </div>
  );
}

function ProjectDialog({
  name,
  instructions,
  onNameChange,
  onInstructionsChange,
  onClose,
  onCreate
}: {
  name: string;
  instructions: string;
  onNameChange: (value: string) => void;
  onInstructionsChange: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <ModalFrame title="New project" onClose={onClose}>
      <div className="space-y-4">
        <input value={name} onChange={(event) => onNameChange(event.target.value)} className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 outline-none" placeholder="Project name" />
        <textarea value={instructions} onChange={(event) => onInstructionsChange(event.target.value)} className="min-h-36 w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 outline-none" placeholder="Project-specific instructions" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-10 rounded-md bg-[var(--app-surface-muted)] px-4 text-sm">Cancel</button>
          <button onClick={onCreate} disabled={!name.trim()} className="h-10 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)] disabled:opacity-50">Create project</button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ProjectShareDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const projectLink = typeof window === "undefined"
    ? `/dashboard?project=${project.id}`
    : `${window.location.origin}/dashboard?project=${project.id}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(projectLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert("Unable to copy project link.");
    }
  };

  return (
    <ModalFrame title="Share project" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--app-muted)]">Copy the project link and share it with anyone who should have access.</p>
        <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 text-sm">
          <p className="truncate">{projectLink}</p>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={copyLink}
            className="h-10 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)]"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ProjectSettingsDialog({
  project,
  onSave,
  onClose
}: {
  project: Project;
  onSave: (updates: Pick<Project, "name" | "instructions">) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [instructions, setInstructions] = useState(project.instructions);

  useEffect(() => {
    setName(project.name);
    setInstructions(project.instructions);
  }, [project]);

  const save = () => {
    const nextName = name.trim();
    if (!nextName) return;
    onSave({ name: nextName, instructions });
  };

  return (
    <ModalFrame title="Project settings" onClose={() => {
      save();
      onClose();
    }}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Project name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={save}
            className="mt-2 h-10 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-sm outline-none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Project instructions</span>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            onBlur={save}
            className="mt-2 min-h-40 w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 text-sm outline-none"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              save();
              onClose();
            }}
            className="h-10 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)]"
          >
            Save
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ProjectDeleteDialog({
  onCancel,
  onDelete
}: {
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <ModalFrame title="Delete Project?" onClose={onCancel}>
      <div className="space-y-5">
        <p className="text-sm text-[var(--app-muted)]">
          This will permanently delete all project files and contents. To save contents, move them to your content list or another project before deleting.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-md border border-[var(--app-border)] px-4 text-sm font-semibold hover:bg-[var(--app-surface-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="h-10 rounded-md bg-red-600 px-4 text-sm font-semibold text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ConversationDeleteDialog({
  conversation,
  onCancel,
  onDelete
}: {
  conversation: ConversationSummary;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <ModalFrame title="Delete Content?" onClose={onCancel}>
      <div className="space-y-6">
        <p className="text-sm text-[var(--app-muted)]">
          This will delete <span className="font-semibold text-[var(--app-text)]">&quot;{conversation.title}&quot;</span>
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-md border border-[var(--app-border)] px-4 text-sm font-semibold hover:bg-[var(--app-surface-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="h-10 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500"
          >
            Delete
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-[var(--app-muted)] hover:bg-[var(--app-surface-muted)]"
            aria-label={`Close ${title}`}
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(90vh-64px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function MobileTopBar() {
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3 md:hidden">
      <div className="font-semibold">innkwise</div>
      <div className="text-xs text-[var(--app-muted)]">Workspace</div>
    </div>
  );
}

function Select({
  value,
  onChange,
  children
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      className="h-11 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-[var(--app-text)] outline-none"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

function IconButton({
  title,
  children,
  active = false,
  onClick
}: {
  title: string;
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-border)] ${
        active ? "bg-[var(--app-accent)] text-[var(--app-accent-text)]" : "text-[var(--app-soft)] hover:bg-[var(--app-surface-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction
}: {
  icon: ReactNode;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--app-border)] p-8 text-center">
      <div className="text-[var(--app-muted)]">{icon}</div>
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-[var(--app-muted)]">{text}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)]">
          <Plus size={17} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function SettingsTabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-sm ${
        active ? "bg-[var(--app-surface-muted)] text-[var(--app-text)]" : "text-[var(--app-muted)] hover:bg-[var(--app-surface-muted)]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <h3 className="text-base font-semibold">{title}</h3>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
      <p className="text-xs uppercase text-[var(--app-muted)]">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function ThemeButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-24 flex-col items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${
        active ? "border-[var(--app-text)]" : "border-[var(--app-border)] text-[var(--app-muted)] hover:bg-[var(--app-surface-muted)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ToggleRow({
  title,
  text,
  checked,
  onChange
}: {
  title: string;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="mt-1 text-sm text-[var(--app-muted)]">{text}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex h-5 w-10 shrink-0 items-center rounded-full px-1 transition ${checked ? "bg-blue-500" : "bg-[var(--app-border)]"}`}
      >
        <span className={`h-3.5 w-3.5 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

function PersonalizationMark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="7" y="7" width="34" height="34" rx="12" fill="currentColor" fillOpacity="0.08" />
      <rect x="7" y="7" width="34" height="34" rx="12" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2" />
      <path
        d="M15 24C18.4 18.7 21.4 16.1 24 16.1C26.6 16.1 29.6 18.7 33 24C29.6 29.3 26.6 31.9 24 31.9C21.4 31.9 18.4 29.3 15 24Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="4.2" fill="currentColor" />
      <path
        d="M18.2 13.9C20 12.7 22 12 24 12C26 12 28 12.7 29.8 13.9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <path
        d="M18.2 34.1C20 35.3 22 36 24 36C26 36 28 35.3 29.8 34.1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <circle cx="14.5" cy="24" r="1.7" fill="currentColor" fillOpacity="0.55" />
      <circle cx="33.5" cy="24" r="1.7" fill="currentColor" fillOpacity="0.55" />
    </svg>
  );
}

function PersonalizationCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-[var(--app-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm outline-none"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-24 w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm outline-none"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm outline-none"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-[var(--app-text)] bg-[var(--app-accent)] text-[var(--app-accent-text)]"
                  : "border-[var(--app-border)] hover:bg-[var(--app-surface)]"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SuggestionStrip({ label, suggestions, onAdd }: { label: string; suggestions: string[]; onAdd: (value: string) => void }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--app-border)] p-3">
      <p className="text-xs font-semibold uppercase text-[var(--app-muted)]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onAdd(suggestion)}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--app-surface)] px-3 py-1.5 text-sm"
          >
            <PersonalizationMark size={14} />
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function KnowledgeSourcesEditor({
  preferences,
  onChange
}: {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
}) {
  const [url, setUrl] = useState("");
  const addUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    onChange({
      ...preferences,
      knowledgeSources: {
        ...preferences.knowledgeSources,
        urls: [
          ...preferences.knowledgeSources.urls,
          {
            id: crypto.randomUUID(),
            url: trimmed,
            category: categorizeSource(trimmed)
          }
        ]
      }
    });
    setUrl("");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="h-10 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm outline-none"
          placeholder="Paste websites, blogs, YouTube channels, books, PDFs, research papers, or newsletters"
        />
        <button type="button" onClick={addUrl} className="h-10 rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-[var(--app-accent-text)]">
          Add source
        </button>
      </div>

      <label className="block rounded-md border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-sm">
        <span className="font-semibold">Upload files</span>
        <input
          type="file"
          multiple
          className="mt-3 block w-full text-sm"
          onChange={(event) => {
            const fileNames = Array.from(event.target.files ?? []).map((file) => file.name);
            onChange({
              ...preferences,
              knowledgeSources: {
                ...preferences.knowledgeSources,
                uploads: uniqueStrings([...preferences.knowledgeSources.uploads, ...fileNames])
              }
            });
          }}
        />
      </label>

      <div className="grid gap-2">
        {preferences.knowledgeSources.urls.map((source) => (
          <div key={source.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate">{source.url}</p>
              <p className="mt-1 text-xs text-[var(--app-muted)]">{source.category}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...preferences,
                  knowledgeSources: {
                    ...preferences.knowledgeSources,
                    urls: preferences.knowledgeSources.urls.filter((item) => item.id !== source.id)
                  }
                })
              }
              className="rounded-md bg-[var(--app-surface-muted)] px-2 py-1 text-xs"
            >
              Remove
            </button>
          </div>
        ))}
        {preferences.knowledgeSources.uploads.map((fileName) => (
          <div key={fileName} className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm">
            {fileName}
          </div>
        ))}
      </div>
    </div>
  );
}

function RangeField({
  label,
  value,
  onChange,
  leftLabel = "Low",
  rightLabel = "High"
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <label className="block rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        <span className="rounded-full bg-[var(--app-surface-muted)] px-2 py-1 text-xs">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-blue-500"
      />
      <div className="mt-1 flex justify-between text-xs text-[var(--app-muted)]">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </label>
  );
}

function PreferenceField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-24 w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 text-sm outline-none"
      />
    </label>
  );
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value?: string) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function fileToLibraryItem(file: File): Promise<Omit<LibraryItem, "id" | "createdAt">> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

      resolve({
        kind: file.type.startsWith("image/") ? "Images" : "Files",
        name: file.name,
        url: null,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        contentBase64: base64
      });
    };

    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function textToLibraryItem(
  name: string,
  content: string
): Promise<Omit<LibraryItem, "id" | "createdAt">> {
  return fileToLibraryItem(new File([content], name, {
    type: "text/markdown;charset=utf-8"
  }));
}

function downloadLibraryItems(items: LibraryItem[]) {
  for (const item of items) {
    if (!item.contentBase64) continue;

    const href = `data:${item.mimeType || "application/octet-stream"};base64,${item.contentBase64}`;
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = item.name || "innkwise-library-file";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
}

function openLibraryItem(item: LibraryItem) {
  if (item.kind === "Links" && item.url) {
    window.open(item.url, "_blank", "noopener,noreferrer");
    return;
  }

  if (!item.contentBase64) return;

  const href = `data:${item.mimeType || "application/octet-stream"};base64,${item.contentBase64}`;
  window.open(href, "_blank", "noopener,noreferrer");
}

function formatFileSize(size?: number | null) {
  if (!size) return "Stored file";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getLibraryItemTime(item: LibraryItem) {
  const time = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getInitials(value: string) {
  const initials = value
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "IW";
}

function getNameFromEmail(email: string) {
  const localPart = email.split("@")[0] || "creator";
  return localPart
    .split(/[._\-+\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Innkwise Creator";
}

function formatPlanLabel(planType?: string) {
  const normalized = (planType || "FREE").toUpperCase();
  if (normalized === "PRO" || normalized === "CREATOR" || normalized === "CREATOR_PRO") {
    return "Creator Pro";
  }
  return "Free";
}

function formatSubscriptionStatus(status?: SubscriptionSummary["status"] | null) {
  if (!status || status === "free") return "Free";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatBillingDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatBillingPrice(subscription?: SubscriptionSummary | null) {
  if (!subscription || subscription.plan.slug === "free") return "0";
  const symbol = subscription.plan.currency === "INR" ? "₹" : "$";
  return `${symbol}${subscription.plan.price} / month`;
}

function mergePreferences(stored: Partial<Preferences>): Preferences {
  const storedCreator: Record<string, unknown> = isRecord(stored.creatorProfile) ? stored.creatorProfile : {};
  const storedGoals: Record<string, unknown> = isRecord(stored.goals) ? stored.goals : {};
  const storedAudience: Record<string, unknown> = isRecord(stored.audienceProfile) ? stored.audienceProfile : {};
  const storedContent: Record<string, unknown> = isRecord(stored.contentProfile) ? stored.contentProfile : {};
  const storedPlatform: Record<string, unknown> = isRecord(stored.platformProfile) ? stored.platformProfile : {};
  const storedSources: Record<string, unknown> = isRecord(stored.knowledgeSources) ? stored.knowledgeSources : {};
  const storedWriting = numberRecord(stored.writingPreferences);
  const storedAi = numberRecord(stored.aiControls);
  const storedGoalScores = numberRecord(storedGoals["priorityScores"]);
  const storedPlatformWeights = numberRecord(storedPlatform["platformWeights"]);

  return {
    ...defaultPreferences,
    browserNotifications: typeof stored.browserNotifications === "boolean" ? stored.browserNotifications : defaultPreferences.browserNotifications,
    productUpdates: typeof stored.productUpdates === "boolean" ? stored.productUpdates : defaultPreferences.productUpdates,
    creatorProfile: { ...defaultPreferences.creatorProfile, ...storedCreator },
    goals: {
      ...defaultPreferences.goals,
      ...storedGoals,
      priorityScores: {
        ...defaultPreferences.goals.priorityScores,
        ...storedGoalScores
      }
    },
    audienceProfile: { ...defaultPreferences.audienceProfile, ...storedAudience },
    contentProfile: { ...defaultPreferences.contentProfile, ...storedContent },
    platformProfile: {
      ...defaultPreferences.platformProfile,
      ...storedPlatform,
      platformWeights: {
        ...defaultPreferences.platformProfile.platformWeights,
        ...storedPlatformWeights
      }
    },
    knowledgeSources: { ...defaultPreferences.knowledgeSources, ...storedSources },
    writingPreferences: { ...defaultPreferences.writingPreferences, ...storedWriting },
    aiControls: { ...defaultPreferences.aiControls, ...storedAi }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberRecord(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number")
  );
}

function suggestArchetypes(preferences: Preferences) {
  const source = [
    preferences.creatorProfile.creatorBio,
    preferences.creatorProfile.tagline,
    preferences.contentProfile.primaryNiche,
    preferences.contentProfile.topicsCovered,
    preferences.goals.primaryGoal
  ].join(" ").toLowerCase();
  const suggestions = new Set<string>();

  if (/(teach|education|learn|course|explain|guide)/.test(source)) suggestions.add("Educator");
  if (/(story|film|cinema|narrative|documentary)/.test(source)) suggestions.add("Storyteller");
  if (/(data|research|finance|market|analysis|psychology)/.test(source)) suggestions.add("Analyst");
  if (/(startup|build|product|software|maker|ai)/.test(source)) suggestions.add("Builder");
  if (/(brand|community|audience|social|growth)/.test(source)) suggestions.add("Influencer");
  if (/(authority|personal branding|leadership|future|strategy)/.test(source)) suggestions.add("Thought Leader");
  if (/(business|revenue|sales|entrepreneur|startup)/.test(source)) suggestions.add("Entrepreneur");
  if (/(film|video|cinematic|camera|editing)/.test(source)) suggestions.add("Filmmaker");
  if (/(paper|study|science|research)/.test(source)) suggestions.add("Researcher");
  if (/(fun|humor|entertain|gaming|travel)/.test(source)) suggestions.add("Entertainer");

  return [...suggestions, "Educator", "Storyteller", "Analyst"].filter((item, index, list) => list.indexOf(item) === index).slice(0, 4);
}

function categorizeSource(url: string) {
  const value = url.toLowerCase();
  if (/youtube|youtu\.be/.test(value)) return "YouTube channel";
  if (/\.pdf|pdf/.test(value)) return "PDF";
  if (/arxiv|doi|pubmed|research|paper|journal/.test(value)) return "Research paper";
  if (/substack|newsletter|mailchimp|beehiiv/.test(value)) return "Newsletter";
  if (/book|goodreads|amazon/.test(value)) return "Book";
  if (/blog|medium|hashnode/.test(value)) return "Blog";
  return "Website";
}

function averageScore(scores: Record<string, number>) {
  const values = Object.values(scores).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function ThumbnailIdeaCard({ idea, index }: { idea: ThumbnailIdea; index: number }) {
  const concept = useTypewriter(idea.concept, 8);
  const text = useTypewriter(idea.text, 8);
  const style = useTypewriter(idea.style, 6);
  const composition = useTypewriter(idea.composition, 6);

  return (
    <div className="space-y-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--app-muted)]">Idea {index + 1}</p>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-muted)]">Concept</p>
        <p className="mt-1 text-sm font-semibold text-[var(--app-text)]">{concept}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-muted)]">Text</p>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">{text}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-muted)]">Style</p>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">{style}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--app-muted)]">Composition</p>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">{composition}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  content,
  action,
  onDone
}: {
  title: string;
  content?: string;
  action?: ReactNode;
  onDone?: () => void;
}) {
  if (!content) return null;
  const typed = useTypewriter(content, 5, onDone);

  return (
    <section className="border-b border-[var(--app-border)] pb-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-normal">{normalizeSectionTitle(title)}</h2>
        {action}
      </div>
      <MarkdownContent text={typed} />
    </section>
  );
}

function normalizeSectionTitle(title: string) {
  return title.replace(/\*\*(.*?)\*\*/g, "$1").trim();
}

function useTypewriter(text: string, speed = 5, onDone?: () => void) {
  const [displayed, setDisplayed] = useState("");
  const hasCalledDone = useRef(false);
  const doneCallbackRef = useRef(onDone);

  useEffect(() => {
    doneCallbackRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let i = 0;
    setDisplayed("");
    hasCalledDone.current = false;

    const interval = setInterval(() => {
      const next = text.slice(0, i);
      setDisplayed(next);
      i++;
      if (i > text.length) {
        clearInterval(interval);
        if (!hasCalledDone.current) {
          hasCalledDone.current = true;
          doneCallbackRef.current?.();
        }
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return displayed;
}

function buildThumbnailIdeas(result: ScriptResult | null, topic: string, variant = 1): ThumbnailIdea[] {
  const cleanedTopic = topic.trim() || "Your Topic";
  const titleIdeas = Array.isArray(result?.title_suggestions)
    ? result.title_suggestions.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const directIdeas = Array.isArray(result?.thumbnail_text)
    ? result.thumbnail_text.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const timelineTitles = Array.isArray(result?.script_timeline)
    ? result.script_timeline
        .map((item) => String(item?.section_title ?? "").trim())
        .filter(Boolean)
    : [];
  const scriptSignals = [
    result?.script?.pattern_interrupt,
    result?.script?.problem_setup,
    result?.script?.psychological_explanation,
    result?.script?.case_study,
    result?.script?.practical_steps
  ]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  const keywords = extractThumbnailKeywords([
    cleanedTopic,
    ...titleIdeas,
    ...directIdeas,
    ...timelineTitles,
    ...scriptSignals.slice(0, 3)
  ]);

  const theme = detectThumbnailTheme(cleanedTopic, keywords, timelineTitles, scriptSignals);
  const titlePool = uniqueStrings([
    ...titleIdeas,
    ...directIdeas,
    cleanedTopic,
    `${cleanedTopic} revealed`,
    `${cleanedTopic} explained`,
    `${cleanedTopic} secrets`,
    `${cleanedTopic} decoded`
  ]);
  const keywordPool = uniqueStrings([
    ...keywords,
    cleanedTopic.toLowerCase(),
    "breakthrough",
    "truth",
    "secret",
    "hidden",
    "ultimate"
  ]);
  const emotionalPool = uniqueStrings([
    ...keywords,
    "truth",
    "secret",
    "shift",
    "power",
    "hidden",
    "future"
  ]);
  const conceptAngles: Array<"reveal" | "contrast"> = variant % 2 === 0 ? ["contrast", "reveal"] : ["reveal", "contrast"];

  return [0, 1].map((index) => {
    const variantSeed = variant + index;
    const keyword = keywordPool[variantSeed % keywordPool.length] || cleanedTopic;
    const secondaryKeyword = keywordPool[(variantSeed + 2) % keywordPool.length] || cleanedTopic;
    const emotionalWord = emotionalPool[(variantSeed + 1) % emotionalPool.length] || "truth";
    const titleText = titlePool[variantSeed % titlePool.length] || cleanedTopic;
    const angle = conceptAngles[index % conceptAngles.length];

    return {
      concept: buildThumbnailConcept(theme, cleanedTopic, keyword, secondaryKeyword, angle, variantSeed),
      text: buildThumbnailText(titleText, cleanedTopic, keyword, emotionalWord, angle, variantSeed),
      style: buildThumbnailStyle(theme, keyword, angle, variantSeed),
      composition: buildThumbnailComposition(theme, keyword, emotionalWord, angle, variantSeed)
    };
  });
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function buildThumbnailText(
  titleText: string,
  topic: string,
  keyword: string,
  emotionalWord: string,
  angle: "reveal" | "contrast",
  variant: number
) {
  const cleanedTitle = titleText.replace(/[:]/g, " ").replace(/\s+/g, " ").trim();
  const revealOptions = [
    cleanedTitle,
    `${capitalizeWord(keyword)} changes everything`,
    `The ${emotionalWord} about ${capitalizeWord(keyword)}`,
    `Why ${capitalizeWord(topic)} hits different`,
    `${capitalizeWord(keyword)} exposed`
  ];
  const contrastOptions = [
    `${capitalizeWord(keyword)} vs old thinking`,
    `Before ${capitalizeWord(keyword)} / After ${capitalizeWord(keyword)}`,
    `${capitalizeWord(keyword)} changes the outcome`,
    `Old way vs ${capitalizeWord(keyword)}`,
    `${capitalizeWord(topic)} reimagined`
  ];

  const options = angle === "reveal" ? revealOptions : contrastOptions;
  const selected = options[variant % options.length] || cleanedTitle || "Unexpected truth revealed";
  return selected;
}

function capitalizeWord(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractThumbnailKeywords(inputs: string[]) {
  const stopWords = new Set([
    "the", "and", "for", "that", "with", "this", "from", "your", "into", "what", "when", "where",
    "have", "will", "about", "them", "they", "their", "there", "then", "than", "just", "more",
    "only", "over", "under", "after", "before", "because", "could", "would", "should", "topic",
    "audience", "video", "section", "title", "script", "ideas", "idea", "youtube"
  ]);

  const counts = new Map<string, number>();
  for (const input of inputs) {
    for (const rawWord of input.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      if (rawWord.length < 4 || stopWords.has(rawWord)) continue;
      counts.set(rawWord, (counts.get(rawWord) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function detectThumbnailTheme(
  topic: string,
  keywords: string[],
  timelineTitles: string[],
  scriptSignals: string[]
) {
  const source = [topic, ...keywords, ...timelineTitles, ...scriptSignals].join(" ").toLowerCase();

  if (/(history|ancient|empire|wonder|myth|civilization|king|war|artifact)/.test(source)) return "historical";
  if (/(money|business|sales|startup|marketing|wealth|income|brand)/.test(source)) return "business";
  if (/(mindset|psychology|habit|focus|discipline|motivation|brain|confidence)/.test(source)) return "self-improvement";
  if (/(ai|tech|software|future|automation|tool|app|digital|planet|space|solar|science)/.test(source)) return "technology";
  if (/(health|fitness|body|diet|sleep|workout|energy)/.test(source)) return "health";
  return "general";
}

function buildThumbnailConcept(
  theme: string,
  topic: string,
  keyword: string,
  secondaryKeyword: string,
  angle: "reveal" | "contrast",
  variant: number
) {
  const concepts: Record<string, Record<"reveal" | "contrast", string[]>> = {
    historical: {
      reveal: [
        `Cinematic mystery reveal around ${keyword} in ${topic}`,
        `Lost-history angle showing why ${keyword} still matters today`,
        `Legend-focused thumbnail concept built around the secret of ${keyword}`
      ],
      contrast: [
        `Then-vs-now visual contrast that makes ${keyword} feel legendary`,
        `${keyword} compared against modern assumptions for maximum curiosity`,
        `Historical myth versus reality framing using ${keyword} and ${secondaryKeyword}`
      ]
    },
    business: {
      reveal: [
        `High-stakes business reveal centered on ${keyword} and its hidden payoff`,
        `Money-making angle that frames ${keyword} as the unfair advantage`,
        `Authority-based business reveal around the true value of ${keyword}`
      ],
      contrast: [
        `Failure-vs-success framing that makes ${keyword} look urgent and profitable`,
        `Old strategy vs modern edge framing around ${keyword}`,
        `Weak business move contrasted with the smarter ${keyword} approach`
      ]
    },
    "self-improvement": {
      reveal: [
        `Mindset breakthrough reveal focused on ${keyword} and emotional transformation`,
        `Self-mastery concept that frames ${keyword} as the key mental shift`,
        `Internal breakthrough angle showing the hidden power of ${keyword}`
      ],
      contrast: [
        `Old self vs upgraded self framing built around ${keyword}`,
        `Comfort-zone vs growth-zone concept powered by ${keyword}`,
        `Self-sabotage contrasted with the disciplined ${keyword} identity`
      ]
    },
    technology: {
      reveal: [
        `Future-shock reveal showing why ${keyword} changes the game`,
        `Tech-discovery concept centered on the real potential of ${keyword}`,
        `Big-future thumbnail angle that makes ${keyword} feel inevitable`
      ],
      contrast: [
        `Manual vs automated visual split that highlights ${keyword}`,
        `Old workflow vs next-gen result framing using ${keyword}`,
        `${keyword} contrasted against outdated systems for instant curiosity`
      ]
    },
    health: {
      reveal: [
        `Body-result reveal that makes ${keyword} feel instantly important`,
        `Performance-driven wellness concept built around the truth of ${keyword}`,
        `Health breakthrough angle that makes ${keyword} feel urgent and practical`
      ],
      contrast: [
        `Low-energy vs peak-performance frame built around ${keyword}`,
        `Healthy-result vs unhealthy-habit contrast tied to ${keyword}`,
        `Body transformation framing that makes ${keyword} the turning point`
      ]
    },
    general: {
      reveal: [
        `Curiosity-heavy reveal around ${keyword} inside ${topic}`,
        `Big-idea reveal that makes ${keyword} impossible to ignore`,
        `Hidden-truth concept built around the power of ${keyword}`
      ],
      contrast: [
        `Problem-vs-outcome visual hook that makes ${keyword} impossible to ignore`,
        `Expectation vs reality framing built around ${keyword}`,
        `${keyword} contrasted with the common assumption for stronger intrigue`
      ]
    }
  };

  const options = concepts[theme]?.[angle] ?? concepts.general[angle];
  return options[variant % options.length];
}

function buildThumbnailStyle(
  theme: string,
  keyword: string,
  angle: "reveal" | "contrast",
  variant: number
) {
  const revealStyles: Record<string, string[]> = {
    historical: [
      `Use rich gold and stone tones, dramatic shadow, dust texture, and an epic documentary-grade finish around ${keyword}.`,
      `Lean into ancient mystery with weathered texture, torch-like side light, and one premium archaeological focal detail.`,
      `Push a grand historical-cinematic look with darker edges, glowing highlights, and a legendary discovery mood.`
    ],
    business: [
      `Use a premium high-contrast editorial look with sharp contrast, clean typography, and polished wealth-coded color accents.`,
      `Push a sleek boardroom-newsroom feel with glossy contrast, sharper subject cutout, and authoritative financial polish.`,
      `Use a polished high-status thumbnail style with cleaner typography, stronger depth, and a luxury-business finish.`
    ],
    "self-improvement": [
      `Lean into emotional clarity with clean lighting, strong facial expression, and premium motivational-documentary styling.`,
      `Use a transformational creator look with sharper eye contact, cleaner skin tones, and a focused self-mastery visual mood.`,
      `Push a cleaner self-improvement aesthetic with dramatic face lighting, elevated contrast, and an emotionally honest tone.`
    ],
    technology: [
      `Push a sleek futuristic style with crisp edges, cool highlights, digital glow, and a clear modern-tech focal point.`,
      `Use a space-age sci-fi treatment with darker depth, luminous accents, and a more advanced high-curiosity tech finish.`,
      `Give it a sharper innovation-first look with luminous contrast, polished tech gradients, and a highly modern interface feel.`
    ],
    health: [
      `Use vibrant clean lighting, high physical contrast, and a fresh premium wellness look that feels energetic and credible.`,
      `Keep the image polished and body-focused with stronger vitality cues, fresh color, and immediate healthy-performance energy.`,
      `Use a cleaner high-performance health style with brighter skin tones, premium realism, and obvious energetic contrast.`
    ],
    general: [
      `Use a bold cinematic YouTube look with one dominant focal point, sharp lighting, and very clear text hierarchy.`,
      `Use a cleaner high-click editorial finish with bolder contrast, bigger emotion, and one unmistakable focal cue.`,
      `Keep the style premium and dramatic with clean subject separation, stronger visual punch, and a polished creator aesthetic.`
    ]
  };

  const contrastStyles: Record<string, string[]> = {
    historical: [
      `Blend ancient texture with modern punchy contrast, using bold lighting and epic detail to make ${keyword} feel timeless.`,
      `Frame the contrast with brighter highlights on the winning side and darker historical texture on the opposing side.`,
      `Push the contrast harder with one side feeling ancient and mystical while the other feels clearer and more revealing.`
    ],
    business: [
      `Keep the frame sleek and corporate with strong red-vs-green or dark-vs-bright contrast for instant business tension.`,
      `Use cleaner financial contrast with premium dark neutrals, strong alert colors, and sharper result-driven polish.`,
      `Create a more aggressive win-vs-loss business style with stronger contrast, cleaner charts, and more obvious stakes.`
    ],
    "self-improvement": [
      `Use a transformational look with darker tones on one side and brighter success energy on the other.`,
      `Separate the emotional states clearly with stronger facial contrast, cleaner lighting, and more obvious self-growth tension.`,
      `Make the contrast more human and emotional by exaggerating posture, eye focus, and mood between both sides.`
    ],
    technology: [
      `Mix dark UI-inspired depth with one bright tech accent so ${keyword} feels advanced and immediate.`,
      `Use a clearer old-tech vs new-tech split with stronger glow, cleaner device lighting, and more futuristic separation.`,
      `Push a stronger contrast between obsolete and advanced tech using brighter accents and a more premium futuristic finish.`
    ],
    health: [
      `Create a dramatic healthy-vs-unhealthy separation with stronger color contrast and a visibly different mood on each side.`,
      `Push the contrast harder with cleaner vitality on the winning side and more obvious fatigue cues on the losing side.`,
      `Use brighter health-coded tones and sharper physical differences so the contrast feels immediate and believable.`
    ],
    general: [
      `Use strong visual separation, bigger emotion, and a cleaner premium finish so the contrast reads instantly.`,
      `Create a more obvious winner-loser split with stronger color contrast, cleaner depth, and a clearer visual hierarchy.`,
      `Push a more dramatic contrast style with sharper subject separation, bolder mood shift, and cleaner text visibility.`
    ]
  };

  const pool = angle === "reveal" ? revealStyles : contrastStyles;
  const options = pool[theme] ?? pool.general;
  return options[variant % options.length];
}

function buildThumbnailComposition(
  theme: string,
  keyword: string,
  emotionalWord: string,
  angle: "reveal" | "contrast",
  variant: number
) {
  const revealCompositions: Record<string, string[]> = {
    historical: [
      `Place the mysterious artifact, monument, or symbolic visual in the center-left, add a reaction face or silhouette opposite it, and keep a short headline in the cleanest dark area.`,
      `Keep ${keyword} large in frame, use one discovery detail behind it, and anchor the text where the background is darkest and quietest.`,
      `Use one dominant historical object as the hero, then support it with a smaller reaction element and a compact headline away from the focal detail.`
    ],
    business: [
      `Keep the presenter or key business symbol large in frame, place a bold result-focused headline beside it, and support it with one small profit/status cue.`,
      `Make the business metric or symbol dominant, keep the text high and clean, and use one reaction or chart cue to reinforce urgency.`,
      `Let the subject own one side of the frame, use a business icon or chart as the support element, and keep the text in the least busy zone.`
    ],
    "self-improvement": [
      `Use a tight emotional face crop, one clear symbolic object tied to ${keyword}, and a short text hook placed away from the eyes.`,
      `Center the facial expression first, support it with one self-improvement symbol, and keep the headline in the emptiest upper corner.`,
      `Build around the face as the hero, place one symbolic self-growth cue in the background, and keep the text short and isolated.`
    ],
    technology: [
      `Make the main device, interface, or futuristic symbol dominant, support it with one human reaction, and position the text in unused negative space.`,
      `Use one giant tech or space visual, a smaller human element, and a short headline placed where the UI or background stays clean.`,
      `Place the innovation object front and center, then support it with a single reaction cue and clean text aligned to the calmest side.`
    ],
    health: [
      `Center the body result, food element, or performance cue, then add short text near the least busy edge for instant readability.`,
      `Make the physical result or wellness cue the hero, then support it with one secondary object and a clean headline block.`,
      `Use the body or result as the main focal point, one supporting health detail, and a short headline placed away from the busiest area.`
    ],
    general: [
      `Use one oversized focal subject, one supporting curiosity clue, and place the headline where the background is simplest.`,
      `Keep the hero object large, add one secondary trigger for ${emotionalWord}, and anchor the text in the cleanest visual lane.`,
      `Let one subject dominate the frame, add a smaller supporting cue, and isolate the text where the eye lands second.`
    ]
  };

  const contrastCompositions: Record<string, string[]> = {
    historical: [
      `Split the frame between historical grandeur and modern interpretation, with ${keyword} anchored visually as the bridge between both sides.`,
      `Use a clean left-vs-right contrast, with an old-world visual on one side and a modern reference or reaction on the other.`,
      `Keep the contrast obvious by giving one side the myth or legend and the other side the revealing truth tied to ${keyword}.`
    ],
    business: [
      `Divide the frame into loss vs win, with ${keyword} placed at the visual pivot and the text sitting in the cleanest high-contrast zone.`,
      `Show struggle on one side and payoff on the other, with the business cue or metric acting as the center of the contrast.`,
      `Create a winner-loser split where the weak move sits opposite the smarter ${keyword} result and the text rides the winning side.`
    ],
    "self-improvement": [
      `Build a before-vs-after human transformation frame with ${emotionalWord} expressed through posture, lighting, and facial change.`,
      `Use the same subject in two contrasting states, then place the headline over the calmer side so the transition reads fast.`,
      `Keep the contrast deeply personal by exaggerating expression, posture, and mood shift between both states.`
    ],
    technology: [
      `Show manual effort on one side and fast tech-enabled output on the other, with ${keyword} clearly owning the winning side.`,
      `Frame old workflow versus advanced result, making the improved side cleaner, brighter, and visually more satisfying.`,
      `Use a strong old-vs-new split where the outdated side feels cluttered and the ${keyword} side feels sleek and immediate.`
    ],
    health: [
      `Use a side-by-side visual of low-energy vs high-energy states, with ${keyword} signaled by a clear physical difference.`,
      `Contrast the tired version against the strong version, keeping the text on the cleaner healthier side for immediate clarity.`,
      `Show the unhealthy state opposite the improved result, then place the text over the side that feels brighter and more energized.`
    ],
    general: [
      `Create a clear tension split between problem and payoff, with ${keyword} acting as the main visual trigger for the viewer.`,
      `Use a simple negative-vs-positive split, then let the headline sit over the calmer side to keep it readable and high-click.`,
      `Build the frame around two opposing states, then use ${keyword} as the visual reason one side clearly wins.`
    ]
  };

  const pool = angle === "reveal" ? revealCompositions : contrastCompositions;
  const options = pool[theme] ?? pool.general;
  return options[variant % options.length];
}

function toBulletText(items?: string[], maxItems?: number) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const normalizedItems = items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item == null) return "";
      if (typeof item === "object") return JSON.stringify(item).trim();
      return String(item).trim();
    })
    .filter(Boolean);

  const limitedItems = typeof maxItems === "number" ? normalizedItems.slice(0, maxItems) : normalizedItems;

  return limitedItems
    .map((item) => (startsWithBullet(item) ? item : `- ${item}`))
    .join("\n");
}

function startsWithBullet(text: string) {
  return /^(-|\*|\d+\.)\s+/.test(text.trim());
}

function textToList(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(-|\*|\d+\.)\s+/, "").trim())
    .filter(Boolean);
}

function normalizeBulletFormatting(text: string) {
  if (!text) return "";
  return normalizeGeneratedText(text).trim();
}

function buildPlainTextScript(sections: Array<{ title: string; content?: string }>) {
  return sections
    .filter((section) => section.content && section.content.trim().length > 0)
    .map((section) => `${section.title}\n${section.content?.trim()}\n`)
    .join("\n");
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9-_ ]+/g, "").replace(/\s+/g, "_").slice(0, 60) || "script";
}

function normalizeHtmlToStructuredText(input: string) {
  if (!looksLikeHtml(input)) return input;

  return input
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<\s*p[^>]*>/gi, "")
    .replace(/<\s*h[1-6][^>]*>/gi, "\n\n")
    .replace(/<\s*\/h[1-6]\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*\/li\s*>/gi, "")
    .replace(/<\s*\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .trim();
}

function looksLikeHtml(value: string) {
  return /<\s*\/?\s*[a-z][^>]*>/i.test(value);
}

function normalizeGeneratedText(input: string) {
  const htmlNormalized = normalizeHtmlToStructuredText(input);

  return htmlNormalized
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\s*(#{1,6}\s+)/g, "\n\n$1")
    .replace(/^#{1,6}\s*(.+)$/gm, "$1")
    .replace(/\s+•\s+/g, "\n- ")
    .replace(/\s+●\s+/g, "\n- ")
    .replace(/([.!?])\s+(-\s+)/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .trim();
}
function createDocxBlobFromSections(sections: Array<{ title: string; content?: string }>) {
  const content = buildPlainTextScript(sections);
  return createSimpleDocx(content);
}

function createSimpleDocx(content: string): Blob {
  const encoder = new TextEncoder();
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    },
    {
      name: "word/document.xml",
      content: buildDocumentXml(content)
    }
  ].map((file) => ({
    name: file.name,
    data: encoder.encode(file.content)
  }));

  const zipBytes = buildZip(files);
  return new Blob([zipBytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

function buildDocumentXml(content: string) {
  const paragraphs = content
    .split("\n")
    .map((line) => escapeXml(line))
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${line || " "}</w:t></w:r></w:p>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildZip(files: Array<{ name: string; data: Uint8Array }>) {
  const localFileParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localFileParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralDirectoryParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectorySize = centralDirectoryParts.reduce((total, part) => total + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const totalSize =
    localFileParts.reduce((sum, part) => sum + part.length, 0) + centralDirectorySize + endRecord.length;
  const zip = new Uint8Array(totalSize);
  let cursor = 0;

  for (const part of localFileParts) {
    zip.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralDirectoryParts) {
    zip.set(part, cursor);
    cursor += part.length;
  }
  zip.set(endRecord, cursor);
  return zip;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function MarkdownContent({ text }: { text: string }) {
  if (!text.trim()) return null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    if (line === "---") {
      nodes.push(<hr key={`hr-${i}`} className="my-4 border-[var(--app-border)]" />);
      i++;
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      nodes.push(
        <h3 key={`h3m-${i}`} className="mb-2 mt-5 text-lg font-semibold text-[var(--app-text)]">
          {renderInlineMarkdown(line.replace(/^#{1,6}\s+/, ""))}
        </h3>
      );
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = line.replace(/^>\s?/, "");
      nodes.push(
        <div key={`quote-${i}`} className="mb-3 border-l-2 border-[var(--app-border)] pl-3 text-[var(--app-text-muted)]">
          {renderInlineMarkdown(quote)}
        </div>
      );
      i++;
      continue;
    }

    if (/^(-|\*)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(-|\*)\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^(-|\*)\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="mb-3 list-disc space-y-1 pl-6 text-[var(--app-text-muted)]">
          {items.map((item, idx) => (
            <li key={`li-${i}-${idx}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} className="mb-3 list-decimal space-y-1 pl-6 text-[var(--app-text-muted)]">
          {items.map((item, idx) => (
            <li key={`oli-${i}-${idx}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^\*\*.+\*\*$/.test(line)) {
      nodes.push(
        <h3 key={`h3-${i}`} className="mb-2 mt-4 text-lg font-semibold text-[var(--app-text)]">
          {renderInlineMarkdown(line)}
        </h3>
      );
      i++;
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i].trim();
      if (
        !current ||
        current === "---" ||
        /^#{1,6}\s+/.test(current) ||
        /^>\s?/.test(current) ||
        /^(-|\*)\s+/.test(current) ||
        /^\d+\.\s+/.test(current) ||
        /^\*\*.+\*\*$/.test(current)
      ) {
        break;
      }
      paragraphLines.push(current);
      i++;
    }

    if (paragraphLines.length > 0) {
      nodes.push(
        <p key={`p-${i}`} className="mb-3 leading-7 text-[var(--app-text-muted)]">
          {renderInlineMarkdown(paragraphLines.join(" "))}
        </p>
      );
      continue;
    }

    i++;
  }

  return <div className="innkwise-markdown max-w-none">{nodes}</div>;
}

function renderInlineMarkdown(value: string) {
  const cleaned = value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
  return <Fragment>{cleaned}</Fragment>;
}
