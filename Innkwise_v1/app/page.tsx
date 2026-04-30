import Link from "next/link";
import { existsSync } from "fs";
import { join } from "path";
import {
  ArrowRight,
  Bot,
  ChevronRight,
  Clapperboard,
  FileText,
  Instagram,
  Linkedin,
  MessageSquareQuote,
  PlayCircle,
  Sparkles,
  Twitter,
  Youtube
} from "lucide-react";
import { AuthAwareLink } from "@/app/components/auth-aware-link";

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Demo", href: "#demo" },
  { label: "CTA", href: "#cta" },
  { label: "Founder's Note", href: "#founders-note" },
  { label: "FAQ", href: "#faq" }
];

const steps = [
  {
    title: "Enter your video topic",
    description:
      "Start with a raw idea, niche prompt, or full concept for your next upload."
  },
  {
    title: "Choose tone and audience",
    description:
      "Dial in delivery style, pacing, and who the script should resonate with."
  },
  {
    title: "Generate your YouTube script instantly",
    description:
      "Get a structured script with hooks, flow, and a clear storytelling arc."
  }
];

const features = [
  {
    title: "Smart Script Generator",
    description: "Generate full YouTube scripts built around clarity, pacing, and retention.",
    icon: Bot
  },
  {
    title: "Hook Generator",
    description: "Produce stronger openers designed to earn the next 10 seconds of attention.",
    icon: Sparkles
  },
  {
    title: "Tone Control",
    description: "Switch between educational, dramatic, witty, and creator-first voice styles.",
    icon: MessageSquareQuote
  },
  {
    title: "YouTube Shorts + Long Form",
    description: "Create scripts for quick vertical clips or deeper long-form storytelling.",
    icon: Clapperboard
  },
  {
    title: "Export to DOCX",
    description: "Move from generation to editing fast with export-ready script files.",
    icon: FileText
  }
];

const faqs = [
  {
    question: "Who is Innkwise Nexora for?",
    answer:
      "It is built for YouTube creators, agencies, and growth teams who need faster ideation and stronger scripts."
  },
  {
    question: "Can it generate scripts for Shorts and long videos?",
    answer:
      "Yes. You can shape outputs for short-form hooks or full-length narrative video structures."
  },
  {
    question: "Can I adjust the tone before generating?",
    answer:
      "Yes. You can tailor the voice, audience, and style before generating the final script."
  }
];

const appDashboardUrl = "/dashboard";
const socialLinks = [
  { label: "X", href: "#", icon: Twitter },
  { label: "Facebook", href: "#", icon: null },
  { label: "Instagram", href: "#", icon: Instagram },
  { label: "LinkedIn", href: "#", icon: Linkedin },
  { label: "YouTube", href: "#", icon: Youtube }
];

export default function Home() {
  const demoVideoExists = existsSync(join(process.cwd(), "public", "demo", "innkwise-demo.mp4"));
  const demoPosterExists = existsSync(
    join(process.cwd(), "public", "demo", "innkwise-demo-poster.jpg")
  );
  const founderHeadshotJpgExists = existsSync(
    join(process.cwd(), "public", "founder", "amruth-headshot.jpg")
  );
  const founderHeadshotJpegExists = existsSync(
    join(process.cwd(), "public", "founder", "amruth-headshot.jpeg")
  );
  const founderHeadshotSrc = founderHeadshotJpgExists
    ? "/founder/amruth-headshot.jpg"
    : founderHeadshotJpegExists
      ? "/founder/amruth-headshot.jpeg"
      : undefined;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.16),transparent_22%),linear-gradient(180deg,#0b1020_0%,#050816_48%,#02040a_100%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-96 bg-[linear-gradient(90deg,transparent,rgba(99,102,241,0.12),transparent)] blur-3xl" />

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <header className="sticky top-0 z-30 -mx-6 border-b border-white/10 bg-[#050816]/80 px-6 backdrop-blur lg:-mx-8 lg:px-8">
          <div className="mx-auto flex h-20 max-w-7xl items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-3 text-sm font-semibold tracking-[0.24em] text-white"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
                IN
              </span>
              <span>Innkwise</span>
            </Link>

            <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="transition hover:text-white">
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <AuthAwareLink
                hrefIfAuthed={appDashboardUrl}
                hrefIfGuest="/auth"
                className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-medium text-cyan-200 transition hover:border-cyan-300/60 hover:bg-cyan-300/15 hover:text-white"
              >
                Try Nexora
                <ArrowRight className="h-4 w-4" />
              </AuthAwareLink>
            </div>
          </div>
        </header>

        <section className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center py-16 text-center lg:py-16">
          <h1 className="mt-8 max-w-4xl text-5xl font-semibold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
            Turn Ideas into{" "}
            <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-400 bg-clip-text text-transparent">
              Viral Scripts
            </span>{" "}
            in Minutes
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            Nexora helps creators generate engaging YouTube scripts, powerful hooks, and
            storytelling structures instantly.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <AuthAwareLink
              hrefIfAuthed={appDashboardUrl}
              hrefIfGuest="/auth"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.02] hover:shadow-[0_12px_40px_rgba(56,189,248,0.35)]"
            >
              Try Nexora for Free
              <ChevronRight className="h-4 w-4" />
            </AuthAwareLink>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              <PlayCircle className="h-4 w-4 text-cyan-300" />
              Watch Demo
            </a>
          </div>
        </section>

        <section id="how-it-works" className="py-8 lg:py-14">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
              Your Script in 3 simple steps
            </h2>
            <p className="mt-4 text-slate-300">
              A clean flow from topic to finished video script, designed to keep creators moving.
            </p>
          </div>

          <div className="mx-auto mt-14 max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-3">
              {steps.map((step, index) => (
                <div
                  key={step.title}
                  className="relative rounded-[1.75rem] border border-white/10 bg-white/5 p-6 text-center transition hover:-translate-y-1 hover:border-cyan-400/30 hover:bg-slate-900/80"
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-lg font-semibold text-slate-950 shadow-[0_0_35px_rgba(59,130,246,0.3)]">
                    {index + 1}
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-12 lg:py-20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="mx-auto max-w-3xl flex-1 text-center">
              <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                Why creators and agencies chose nexora
              </h2>
            </div>
            <AuthAwareLink
              hrefIfAuthed={appDashboardUrl}
              hrefIfGuest="/auth"
              className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 transition hover:text-white"
            >
              Explore Nexora
              <ArrowRight className="h-4 w-4" />
            </AuthAwareLink>
          </div>

          <div className="mx-auto mt-10 grid max-w-6xl justify-center gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div
                  key={feature.title}
                  className="mx-auto w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-white/8 to-white/[0.03] p-6 text-center transition hover:-translate-y-1 hover:border-cyan-400/30 hover:shadow-[0_20px_60px_rgba(8,47,73,0.45)]"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="demo" className="py-12 lg:py-20">
          <div className="mx-auto flex max-w-6xl justify-center">
            <div className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 shadow-2xl shadow-cyan-950/20">
              {demoVideoExists ? (
                <video
                  className="h-[42rem] w-full bg-black object-contain sm:h-[48rem] lg:h-[56rem]"
                  controls
                  playsInline
                  preload="metadata"
                  poster={demoPosterExists ? "/demo/innkwise-demo-poster.jpg" : undefined}
                >
                  <source src="/demo/innkwise-demo.mp4" type="video/mp4" />
                </video>
              ) : (
                <div className="aspect-video w-full bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.2),transparent_30%),linear-gradient(180deg,#07101f_0%,#02040a_100%)]" />
              )}
            </div>
          </div>
        </section>

        <section id="cta" className="py-12 lg:py-20">
          <div className="rounded-[2rem] border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(37,99,235,0.18),rgba(217,70,239,0.14))] p-8 text-center shadow-2xl shadow-cyan-950/20 sm:p-12">
            <h2 className="mt-4 text-3xl font-semibold text-white sm:text-5xl">
              Start Creating Viral Scripts Today
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-100/85">
              Generate hooks, shape the story, and get recording faster with Smart scripting support.
            </p>
            <AuthAwareLink
              hrefIfAuthed={appDashboardUrl}
              hrefIfGuest="/auth"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:scale-[1.02] hover:bg-slate-900"
            >
              Generate your first script for free
              <ArrowRight className="h-4 w-4" />
            </AuthAwareLink>
          </div>
        </section>

        <section id="founders-note" className="py-12 lg:py-20">
          <div className="grid gap-8 rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-cyan-950/10 backdrop-blur-xl lg:grid-cols-[0.38fr_0.62fr] lg:p-10">
            <div className="flex justify-center lg:justify-start">
              {founderHeadshotSrc ? (
                <img
                  src={founderHeadshotSrc}
                  alt="Amruth headshot"
                  className="aspect-[4/5] w-full max-w-xs rounded-[1.75rem] border border-cyan-400/20 object-cover"
                />
              ) : (
                <div className="flex aspect-[4/5] w-full max-w-xs items-center justify-center rounded-[1.75rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-center">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Headshot</p>
                    <p className="mt-3 text-sm text-slate-400">Add /public/founder/amruth-headshot.jpg</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center">
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">A Note from the Founder</h2>
              <p className="mt-6 text-base leading-8 text-slate-300">
                Hi, I&apos;m Amruth - filmmaker, writer, engineer and founder of Innkwise-AI.
                I&apos;m building Innkwise to help creators turn raw ideas into powerful stories
                faster. As someone who&apos;s constantly writing and directing, I know how tough it
                can be to find the right words that truly connect.
              </p>
              <p className="mt-5 text-base leading-8 text-slate-300">
                With Innkwise-AI, I&apos;m making storytelling effortless so creators can spend less
                time stuck on scripts and more time doing what they love creating. Explore Nexora and
                be part of the next wave of storytelling.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="py-12 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mt-4 whitespace-nowrap text-3xl font-semibold text-white sm:text-4xl">
              Common questions from Creators and agencies
            </h2>
          </div>

          <div className="mt-10 grid gap-4">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">{faq.question}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-white/10 py-8 text-sm text-slate-400">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="font-semibold text-white">Innkwise</p>
              <p className="mt-1">Built in Bengaluru for the world</p>
            </div>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex flex-wrap items-center justify-center gap-6">
                <a href="#" className="transition hover:text-white">
                  Terms
                </a>
                <a href="#" className="transition hover:text-white">
                  Privacy
                </a>
                <a href="#" className="transition hover:text-white">
                  Contact
                </a>
              </div>
              <p>Contact: info@innwise.com</p>
              <p>Ãƒâ€šÃ‚Â© 2025 Innkwise-AI. All rights reserved</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-end">
              {socialLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  aria-label={link.label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  {link.icon ? (
                    <link.icon className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold">{link.label.charAt(0)}</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
