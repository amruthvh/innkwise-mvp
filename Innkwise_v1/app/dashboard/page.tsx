"use client";

import { useState } from "react";
import axios from "axios";

type ScriptResult = {
  hooks?: string[];
  title_suggestions?: string[];
  thumbnail_text?: string[];
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
  const [length, setLength] = useState(8);
  const [includeResearch, setIncludeResearch] = useState(true);
  const [includeCaseStudy, setIncludeCaseStudy] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);

  const generateScript = async () => {
    try {
      setLoading(true);
      const res = await axios.post("/api/generate-script", {
        topic,
        audience,
        tone,
        length,
        includeResearch,
        includeCaseStudy
      });

      // Supports either direct script payload or { id, output } API wrapper.
      setResult((res.data?.output ?? res.data) as ScriptResult);
    } catch {
      alert("Error generating script");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Innkwise Retention Engine</h1>

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
              <option value={5}>5 min</option>
              <option value={8}>8 min</option>
              <option value={12}>12 min</option>
              <option value={15}>15 min</option>
            </select>
          </div>

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

          <button
            onClick={generateScript}
            disabled={loading || !topic.trim() || !audience.trim()}
            className="bg-white text-black px-6 py-3 rounded font-semibold disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate Script"}
          </button>
        </div>

        {result && (
          <div className="space-y-6">
            <Section title="Hooks" content={result.hooks?.join("\n\n")} />
            <Section title="Titles" content={result.title_suggestions?.join("\n\n")} />
            <Section title="Thumbnail Text" content={result.thumbnail_text?.join("\n\n")} />

            <Section title="Pattern Interrupt" content={result.script?.pattern_interrupt} />
            <Section title="Problem Setup" content={result.script?.problem_setup} />
            <Section
              title="Psychological Explanation"
              content={result.script?.psychological_explanation}
            />
            <Section title="Case Study" content={result.script?.case_study} />
            <Section title="Practical Steps" content={result.script?.practical_steps} />
            <Section title="Engagement Trigger" content={result.script?.engagement_trigger} />
            <Section title="CTA" content={result.script?.cta} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content?: string }) {
  if (!content) return null;

  return (
    <div className="bg-zinc-900 p-6 rounded-xl">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <pre className="whitespace-pre-wrap text-zinc-300">{content}</pre>
    </div>
  );
}
