"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import axios from "axios";

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

export default function Dashboard() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("Authoritative");
  const [videoType, setVideoType] = useState<"long" | "shorts">("long");
  const [length, setLength] = useState(8);
  const [includeResearch, setIncludeResearch] = useState(true);
  const [includeCaseStudy, setIncludeCaseStudy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [visibleSectionCount, setVisibleSectionCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  const generateScript = async () => {
    try {
      setLoading(true);
      setVisibleSectionCount(0);
      setResult(null);
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

  const sections = (() => {
    if (!result) return [] as Array<{ title: string; content?: string; action?: ReactNode }>;

    if (videoType === "shorts") {
      return [
        { title: "Hook", content: result.hook },
        { title: "Pattern Interrupt", content: result.pattern_interrupt },
        { title: "Main Script", content: result.main_script },
        { title: "CTA", content: result.cta }
      ];
    }

    const longFormSections: Array<{ title: string; content?: string; action?: ReactNode }> = [
      {
        title: "Hooks",
        content: toBulletText(result.hooks),
        action: (
          <button
            onClick={regenerateHooks}
            className="text-sm bg-white text-black px-3 py-1 rounded"
          >
            Regenerate Hooks
          </button>
        )
      },
      {
        title: "Titles",
        content: toBulletText(result.title_suggestions)
      }
    ];

    if (Array.isArray(result.script_timeline)) {
      for (let idx = 0; idx < result.script_timeline.length; idx++) {
        const item = result.script_timeline[idx];
        longFormSections.push({
          title: `${item.time_range ?? "Timeline"} - ${item.section_title ?? "Section"}`,
          content: normalizeBulletFormatting(item.content ?? "")
        });
      }
    }

    longFormSections.push(
      { title: "Pattern Interrupt", content: normalizeBulletFormatting(result.script?.pattern_interrupt ?? "") },
      { title: "Problem Setup", content: normalizeBulletFormatting(result.script?.problem_setup ?? "") },
      {
        title: "Psychological Explanation",
        content: normalizeBulletFormatting(result.script?.psychological_explanation ?? "")
      },
      { title: "Case Study", content: normalizeBulletFormatting(result.script?.case_study ?? "") },
      { title: "Practical Steps", content: normalizeBulletFormatting(result.script?.practical_steps ?? "") },
      {
        title: "Engagement Trigger",
        content: normalizeBulletFormatting(result.script?.engagement_trigger ?? "")
      },
      { title: "CTA", content: normalizeBulletFormatting(result.script?.cta ?? "") }
    );

    return longFormSections;
  })();

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
              disabled={videoType === "shorts"}
            >
              <option value={5}>5 min</option>
              <option value={8}>8 min</option>
              <option value={12}>12 min</option>
              <option value={15}>15 min</option>
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

          {videoType === "long" && (
            <div className="flex gap-6">
              <label>
                <input
                  type="checkbox"
                  checked={includeResearch}
                  onChange={() => setIncludeResearch(!includeResearch)}
                />{" "}
                Include Research
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={includeCaseStudy}
                  onChange={() => setIncludeCaseStudy(!includeCaseStudy)}
                />{" "}
                Include Case Study
              </label>
            </div>
          )}

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
                action={section.action}
                onDone={idx === visibleSectionCount - 1 ? revealNextSection : undefined}
              />
            ))}
          </div>
        )}
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
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      <MarkdownContent text={typed} />
    </div>
  );
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

function toBulletText(items?: string[]) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item == null) return "";
      if (typeof item === "object") return JSON.stringify(item).trim();
      return String(item).trim();
    })
    .filter(Boolean)
    .map((item) => (startsWithBullet(item) ? item : `- ${item}`))
    .join("\n");
}

function startsWithBullet(text: string) {
  return /^(-|\*|\d+\.)\s+/.test(text.trim());
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
    .replace(/<\s*h[1-6][^>]*>/gi, "\n\n**")
    .replace(/<\s*\/h[1-6]\s*>/gi, "**\n")
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
    .trim();
}

function looksLikeHtml(value: string) {
  return /<\s*\/?\s*[a-z][^>]*>/i.test(value);
}

function normalizeGeneratedText(input: string) {
  const htmlNormalized = normalizeHtmlToStructuredText(input);

  return htmlNormalized
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s*(#{1,6}\s+)/g, "\n\n$1")
    .replace(/^#{1,6}\s*(.+)$/gm, "**$1**")
    .replace(/\s+•\s+/g, "\n- ")
    .replace(/\s+●\s+/g, "\n- ")
    .replace(/([.!?])\s+(-\s+)/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n")
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
  const parts = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`b-${idx}`} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={`t-${idx}`}>{part}</Fragment>;
  });
}
