"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getStoredAuthToken, storeAuthToken } from "@/lib/auth-client";

type ScriptResult = {
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

type SectionConfig = {
  id: string;
  title: string;
  content?: string;
  rawContent?: string;
  action?: ReactNode;
  canRefine?: boolean;
};

type ThumbnailIdea = {
  concept: string;
  text: string;
  style: string;
  composition: string;
};

const longFormDurations = [5, 8, 12, 15];
const shortsDurations = [1, 2, 3];

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [authChecked, setAuthChecked] = useState(false);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("Authoritative");
  const [videoType, setVideoType] = useState<"long" | "shorts">("long");
  const [length, setLength] = useState(8);
  const [includeResearch] = useState(true);
  const [includeCaseStudy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [visibleSectionCount, setVisibleSectionCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [refiningSectionId, setRefiningSectionId] = useState<string | null>(null);
  const [generatedThumbnailIdeas, setGeneratedThumbnailIdeas] = useState<ThumbnailIdea[]>([]);
  const [thumbnailIdeaVersion, setThumbnailIdeaVersion] = useState(0);
  const durationOptions = videoType === "shorts" ? shortsDurations : longFormDurations;

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
    const validDurations = videoType === "shorts" ? shortsDurations : longFormDurations;

    if (!validDurations.includes(length)) {
      setLength(videoType === "shorts" ? 1 : 8);
    }
  }, [length, videoType]);

  const generateScript = async () => {
    try {
      setLoading(true);
      setVisibleSectionCount(0);
      setResult(null);
      setGeneratedThumbnailIdeas([]);
      setThumbnailIdeaVersion(0);
      const res = await axios.post("/api/generate-script", {
        topic,
        audience,
        tone,
        videoType,
        length,
        includeResearch,
        includeCaseStudy
      });

      // Supports either direct script payload or { id, output } API wrapper.
      setResult((res.data?.output ?? res.data) as ScriptResult);
      setVisibleSectionCount(1);
    } catch {
      alert("Error generating script");
    } finally {
      setLoading(false);
    }
  };

  const regenerateHooks = async () => {
    if (!result?.hooks?.length) return;

    try {
      const res = await axios.post("/api/regenerate-hooks", {
        topic,
        audience,
        tone
      });

      setResult((prev) => ({
        ...(prev ?? {}),
        hooks: Array.isArray(res.data?.hooks) ? res.data.hooks : []
      }));
    } catch {
      alert("Error regenerating hooks");
    }
  };

  const updateSectionContent = (sectionId: string, nextText: string) => {
    setResult((prev) => {
      if (!prev) return prev;

      if (sectionId === "short-hook") return { ...prev, hook: nextText };
      if (sectionId === "short-pattern-interrupt") return { ...prev, pattern_interrupt: nextText };
      if (sectionId === "short-main-script") return { ...prev, main_script: nextText };
      if (sectionId === "short-cta") return { ...prev, cta: nextText };
      if (sectionId === "long-hooks") return { ...prev, hooks: textToList(nextText) };
      if (sectionId === "long-titles") return { ...prev, title_suggestions: textToList(nextText) };
      if (sectionId.startsWith("timeline-")) {
        const index = Number(sectionId.replace("timeline-", ""));
        if (!Array.isArray(prev.script_timeline) || Number.isNaN(index)) return prev;

        return {
          ...prev,
          script_timeline: prev.script_timeline.map((item, itemIndex) =>
            itemIndex === index ? { ...item, content: nextText } : item
          )
        };
      }

      const scriptFieldMap: Record<string, keyof NonNullable<ScriptResult["script"]>> = {
        "script-pattern-interrupt": "pattern_interrupt",
        "script-problem-setup": "problem_setup",
        "script-psychological-explanation": "psychological_explanation",
        "script-case-study": "case_study",
        "script-practical-steps": "practical_steps",
        "script-engagement-trigger": "engagement_trigger",
        "script-cta": "cta"
      };

      const field = scriptFieldMap[sectionId];
      if (!field) return prev;

      return {
        ...prev,
        script: {
          ...(prev.script ?? {}),
          [field]: nextText
        }
      };
    });
  };

  const refineSection = async (section: SectionConfig) => {
    if (!section.canRefine || !section.rawContent?.trim()) return;

    try {
      setRefiningSectionId(section.id);
      const res = await axios.post("/api/rewrite-section", {
        section: section.title,
        existingText: section.rawContent,
        tone
      });

      const refinedText = typeof res.data?.text === "string" ? res.data.text.trim() : "";
      if (!refinedText) {
        throw new Error("Empty refine response");
      }

      updateSectionContent(section.id, refinedText);
    } catch {
      alert("Error refining section");
    } finally {
      setRefiningSectionId(null);
    }
  };

  const sections = (() => {
    if (!result) return [] as SectionConfig[];

    if (videoType === "shorts") {
      return [
        {
          id: "short-hook",
          title: "Hook",
          rawContent: result.hook,
          content: normalizeBulletFormatting(result.hook ?? ""),
          canRefine: true
        },
        {
          id: "short-pattern-interrupt",
          title: "Pattern Interrupt",
          rawContent: result.pattern_interrupt,
          content: normalizeBulletFormatting(result.pattern_interrupt ?? ""),
          canRefine: true
        },
        {
          id: "short-main-script",
          title: "Main Script",
          rawContent: result.main_script,
          content: normalizeBulletFormatting(result.main_script ?? ""),
          canRefine: true
        },
        {
          id: "short-cta",
          title: "CTA",
          rawContent: result.cta,
          content: normalizeBulletFormatting(result.cta ?? ""),
          canRefine: true
        }
      ];
    }

    const longFormSections: SectionConfig[] = [
      {
        id: "long-hooks",
        title: "Hooks",
        rawContent: toBulletText(result.hooks, 3),
        content: toBulletText(result.hooks, 3),
        action: (
          <button
            onClick={regenerateHooks}
            className="text-sm bg-white text-black px-3 py-1 rounded"
          >
            Regenerate Hooks
          </button>
        ),
        canRefine: false
      },
      {
        id: "long-titles",
        title: "Titles",
        rawContent: toBulletText(result.title_suggestions),
        content: toBulletText(result.title_suggestions),
        canRefine: false
      }
    ];

    if (Array.isArray(result.script_timeline)) {
      for (let idx = 0; idx < result.script_timeline.length; idx++) {
        const item = result.script_timeline[idx];
        longFormSections.push({
          id: `timeline-${idx}`,
          title: `${item.time_range ?? "Timeline"} - ${item.section_title ?? "Section"}`,
          rawContent: item.content ?? "",
          content: normalizeBulletFormatting(item.content ?? ""),
          canRefine: true
        });
      }
    }

    longFormSections.push(
      {
        id: "script-pattern-interrupt",
        title: "Pattern Interrupt",
        rawContent: result.script?.pattern_interrupt ?? "",
        content: normalizeBulletFormatting(result.script?.pattern_interrupt ?? ""),
        canRefine: true
      },
      {
        id: "script-problem-setup",
        title: "Problem Setup",
        rawContent: result.script?.problem_setup ?? "",
        content: normalizeBulletFormatting(result.script?.problem_setup ?? ""),
        canRefine: true
      },
      {
        id: "script-psychological-explanation",
        title: "Psychological Explanation",
        rawContent: result.script?.psychological_explanation ?? "",
        content: normalizeBulletFormatting(result.script?.psychological_explanation ?? ""),
        canRefine: true
      },
      {
        id: "script-case-study",
        title: "Case Study",
        rawContent: result.script?.case_study ?? "",
        content: normalizeBulletFormatting(result.script?.case_study ?? ""),
        canRefine: true
      },
      {
        id: "script-practical-steps",
        title: "Practical Steps",
        rawContent: result.script?.practical_steps ?? "",
        content: normalizeBulletFormatting(result.script?.practical_steps ?? ""),
        canRefine: true
      },
      {
        id: "script-engagement-trigger",
        title: "Engagement Trigger",
        rawContent: result.script?.engagement_trigger ?? "",
        content: normalizeBulletFormatting(result.script?.engagement_trigger ?? ""),
        canRefine: true
      },
      {
        id: "script-cta",
        title: "CTA",
        rawContent: result.script?.cta ?? "",
        content: normalizeBulletFormatting(result.script?.cta ?? ""),
        canRefine: true
      }
    );

    return longFormSections;
  })();

  const generateThumbnailIdeas = () => {
    const nextVersion = thumbnailIdeaVersion + 1;
    setThumbnailIdeaVersion(nextVersion);
    setGeneratedThumbnailIdeas(buildThumbnailIdeas(result, topic, nextVersion));
  };

  const copyEntireScript = async () => {
    if (!sections.length) return;
    const plainText = buildPlainTextScript(sections);
    try {
      await navigator.clipboard.writeText(plainText);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      alert("Unable to copy script");
    }
  };

  const downloadDocx = () => {
    if (!sections.length) return;
    const blob = createDocxBlobFromSections(sections);
    const fileName = `${safeFilename(topic || "script")}.docx`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const revealNextSection = () => {
    setVisibleSectionCount((current) => (current < sections.length ? current + 1 : current));
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-sm text-zinc-400">Checking access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Innkwise Nexora</h1>
          <p className="mt-1 text-zinc-400">Forge scripts they can’t click away from</p>
        </div>

        <div className="bg-zinc-900 p-6 rounded-xl space-y-4">
          <input
            className="w-full p-3 rounded bg-zinc-800"
            placeholder="Video Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />

          <input
            className="w-full p-3 rounded bg-zinc-800"
            placeholder="Target Audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          />

          <div className="flex gap-4">
            <select
              className="p-3 rounded bg-zinc-800"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option>Authoritative</option>
              <option>Conversational</option>
              <option>Dramatic</option>
              <option>Analytical</option>
            </select>

            <select
              className="p-3 rounded bg-zinc-800"
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            >
              {durationOptions.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} min
                </option>
              ))}
            </select>

            <select
              className="p-3 rounded bg-zinc-800"
              value={videoType}
              onChange={(e) => setVideoType(e.target.value as "long" | "shorts")}
            >
              <option value="long">Long Form</option>
              <option value="shorts">YouTube Shorts</option>
            </select>
          </div>

          <button
            onClick={generateScript}
            disabled={loading || !topic.trim() || !audience.trim()}
            className="bg-white text-black px-6 py-3 rounded font-semibold disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <span className="animate-pulse">Generating</span>
                <span className="animate-bounce">.</span>
                <span className="animate-bounce delay-100">.</span>
                <span className="animate-bounce delay-200">.</span>
              </div>
            ) : (
              "Generate Script"
            )}
          </button>
        </div>

        {result && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div className="space-y-6">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={copyEntireScript}
                  className="bg-zinc-800 px-4 py-2 rounded font-medium"
                >
                  {copyStatus === "copied" ? "Copied" : "Copy Entire Script"}
                </button>
                <button onClick={downloadDocx} className="bg-zinc-800 px-4 py-2 rounded font-medium">
                  Download DOCX
                </button>
              </div>

              {sections.slice(0, visibleSectionCount).map((section, idx) => (
                <Section
                  key={`${section.title}-${idx}`}
                  title={section.title}
                  content={section.content}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      {section.action}
                      {section.canRefine && (
                        <button
                          onClick={() => refineSection(section)}
                          disabled={refiningSectionId === section.id}
                          className="text-sm bg-zinc-800 px-3 py-1 rounded disabled:opacity-50"
                        >
                          {refiningSectionId === section.id ? "Refining..." : "Refine"}
                        </button>
                      )}
                    </div>
                  }
                  onDone={idx === visibleSectionCount - 1 ? revealNextSection : undefined}
                />
              ))}
            </div>

            <aside className="bg-zinc-900 p-6 rounded-xl lg:sticky lg:top-8">
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Thumbnail Ideas</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Generate stronger thumbnail directions.
                  </p>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Topic</p>
                  <p className="mt-2 text-sm text-zinc-200">{topic || "No topic yet"}</p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={generateThumbnailIdeas}
                    className="w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
                    disabled={!result}
                  >
                    Generate Thumbnail Ideas
                  </button>

                  {generatedThumbnailIdeas.length > 0 && (
                    <button
                      onClick={generateThumbnailIdeas}
                      className="w-full rounded-lg bg-zinc-800 px-4 py-3 text-sm font-semibold text-white"
                    >
                      Regenerate Thumbnail Ideas
                    </button>
                  )}
                </div>

                {generatedThumbnailIdeas.length > 0 ? (
                  <div className="space-y-3">
                    {generatedThumbnailIdeas.map((idea, idx) => (
                      <ThumbnailIdeaCard key={`${idea.concept}-${idx}`} idea={idea} index={idx} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-400">
                    Click <span className="font-semibold text-zinc-200">Generate Thumbnail Ideas</span> to reveal focused thumbnail concepts for this topic.
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function ThumbnailIdeaCard({ idea, index }: { idea: ThumbnailIdea; index: number }) {
  const concept = useTypewriter(idea.concept, 8);
  const text = useTypewriter(idea.text, 8);
  const style = useTypewriter(idea.style, 6);
  const composition = useTypewriter(idea.composition, 6);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Idea {index + 1}</p>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Concept</p>
        <p className="mt-1 text-sm font-semibold text-white">{concept}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Text</p>
        <p className="mt-1 text-sm text-zinc-200">{text}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Style</p>
        <p className="mt-1 text-sm text-zinc-200">{style}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Composition</p>
        <p className="mt-1 text-sm text-zinc-200">{composition}</p>
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
    <div className="bg-zinc-900 p-6 rounded-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{normalizeSectionTitle(title)}</h2>
        {action}
      </div>
      <MarkdownContent text={typed} />
    </div>
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
      nodes.push(<hr key={`hr-${i}`} className="my-4 border-zinc-700" />);
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
        <ul key={`ul-${i}`} className="mb-3 list-disc space-y-1 pl-6 text-zinc-300">
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
        <ol key={`ol-${i}`} className="mb-3 list-decimal space-y-1 pl-6 text-zinc-300">
          {items.map((item, idx) => (
            <li key={`oli-${i}-${idx}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (/^\*\*.+\*\*$/.test(line)) {
      nodes.push(
        <h3 key={`h3-${i}`} className="mb-2 mt-4 text-lg font-semibold text-white">
          {renderInlineMarkdown(line)}
        </h3>
      );
      i++;
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      nodes.push(
        <h3 key={`h3m-${i}`} className="mb-2 mt-4 text-lg font-semibold text-white">
          {renderInlineMarkdown(line.replace(/^#{1,6}\s+/, ""))}
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
        <p key={`p-${i}`} className="mb-3 leading-7 text-zinc-300">
          {renderInlineMarkdown(paragraphLines.join(" "))}
        </p>
      );
      continue;
    }

    i++;
  }

  return <div className="max-w-none">{nodes}</div>;
}

function renderInlineMarkdown(value: string) {
  const cleaned = value.replace(/\*\*(.*?)\*\*/g, "$1");
  return <Fragment>{cleaned}</Fragment>;
}


