import Link from "next/link";
import {
  MessageCircle,
  Paperclip,
  CheckSquare,
  Calendar,
  Lock,
  Bell,
  ArrowRight,
  Check,
  Star,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* palette (landing-only): forest #0f3b2c · ink #12161d · lime button #74c043 · lime text #8fd24f */

const HERO_AVATARS = [
  { initial: "A", bg: "#2f6b4c" },
  { initial: "M", bg: "#159c8c" },
  { initial: "J", bg: "#8a9a2e" },
  { initial: "R", bg: "#4e9270" },
];

function AvatarStack({ onDark = true }: { onDark?: boolean }) {
  return (
    <div className="flex -space-x-2.5">
      {HERO_AVATARS.map((a) => (
        <span
          key={a.initial}
          style={{ backgroundColor: a.bg }}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold text-white ${
            onDark ? "border-[#0f3b2c]" : "border-white"
          }`}
        >
          {a.initial}
        </span>
      ))}
    </div>
  );
}

/** Stylised group-chat card — the hero/feature visual. No real data. */
function ChatMockup({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-[24px] border border-black/5 bg-white p-4 shadow-2xl shadow-black/30 sm:p-5 ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-white">
          CS
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">Chem 204 Study Group</p>
          <p className="flex items-center gap-1.5 text-[11px] text-ink-light">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> 5 online
          </p>
        </div>
      </div>

      <div className="space-y-2.5 py-4">
        <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-surface-recessed px-3.5 py-2 text-[12.5px] text-foreground">
          Can someone drop the lab notes before Thursday?
        </div>
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-md bg-brand px-3.5 py-2 text-[12.5px] text-white">
          Just uploaded them 📎 — added the report to assignments too
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-surface-recessed px-3.5 py-2 text-[12.5px] text-foreground">
          Poll for the weekend session is up 🗳️
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border bg-surface-recessed px-4 py-2">
        <Paperclip className="h-4 w-4 text-ink-light" />
        <span className="flex-1 text-[12px] text-ink-light">Write a message</span>
        <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white">Send</span>
      </div>
    </div>
  );
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`absolute hidden items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[11.5px] font-semibold text-[#0f3b2c] shadow-xl shadow-black/20 lg:inline-flex ${className}`}
    >
      {children}
    </span>
  );
}

const SCATTER = [
  { icon: MessageCircle, label: "Group chat", note: "Threaded, real-time", rot: "sm:-rotate-3" },
  { icon: Paperclip, label: "File sharing", note: "Notes, slides, PDFs", rot: "sm:rotate-2" },
  { icon: CheckSquare, label: "Assignments", note: "Shared checklist", rot: "sm:-rotate-1" },
  { icon: Calendar, label: "Session polls", note: "Lock in a time", rot: "sm:rotate-3" },
  { icon: Lock, label: "Private DMs", note: "One-to-one, in group", rot: "sm:-rotate-2" },
  { icon: Bell, label: "Notifications", note: "Only when it matters", rot: "sm:rotate-1" },
];

const DARK_FEATURES = [
  {
    icon: MessageCircle,
    title: "Real-time group chat",
    description: "Talk it out instantly, with threaded replies and read receipts.",
  },
  {
    icon: Paperclip,
    title: "Files in the conversation",
    description: "Drop notes, slides and PDFs right where the group is talking.",
  },
  {
    icon: CheckSquare,
    title: "Assignment tracking",
    description: "A shared checklist of what is due and who has finished it.",
  },
  {
    icon: Calendar,
    title: "Session scheduling",
    description: "Poll the group, lock in a time, done. No endless threads.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Everything used to be split across a group chat, a shared drive and someone's Notes app. Now it's one tab.",
    who: "Group lead",
    role: "BioMed, Year 2",
  },
  {
    quote:
      "The scheduling poll alone saved us. No more forty messages just to pick a time to meet.",
    who: "Study group organiser",
    role: "Computer Science, Year 3",
  },
  {
    quote:
      "Shared assignments mean nobody can say they didn't know it was due. Everyone sees the same list.",
    who: "Course rep",
    role: "Law, Year 1",
  },
];

export default function LandingPageContent() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      {/* ---------- Hero (full green panel with nav inside, Growchat-style) ---------- */}
      <div className="p-3 sm:p-4">
        <section className="relative overflow-hidden rounded-[28px] bg-[#0f3b2c] sm:rounded-[40px]">
          <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full bg-[#74c043]/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-brand/25 blur-3xl" />

          {/* nav */}
          <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
            <Link href="/" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-light.svg" alt="StudyUp" width={132} height={30} className="h-[30px] w-auto" />
            </Link>
            <div className="hidden items-center gap-8 md:flex">
              <a href="#features" className="text-[13.5px] font-medium text-white/75 hover:text-white">
                Features
              </a>
              <a href="#how" className="text-[13.5px] font-medium text-white/75 hover:text-white">
                How it works
              </a>
              <a href="#voices" className="text-[13.5px] font-medium text-white/75 hover:text-white">
                Why StudyUp
              </a>
            </div>
            <div className="flex items-center gap-2.5">
              <Link
                href="/login"
                className="hidden rounded-full border border-white/25 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-white/10 sm:block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-[#74c043] px-4 py-2 text-[13px] font-semibold text-[#0f3b2c] hover:bg-[#67ad3a]"
              >
                Get started
              </Link>
            </div>
          </nav>

          {/* hero body */}
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-14 pt-8 sm:px-8 sm:pb-20 sm:pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
            <div>
              <div className="flex items-center gap-3">
                <AvatarStack />
                <p className="text-[12.5px] font-medium text-white/70">
                  Trusted by study groups at 30+ universities
                </p>
              </div>

              <h1 className="mt-6 font-heading text-[2.6rem] font-bold leading-[1.03] tracking-[-0.02em] text-white sm:text-6xl">
                Group study,
                <br />
                without the
                <br />
                <span className="text-[#8fd24f]">chaos.</span>
              </h1>

              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
                StudyUp pulls your group&apos;s chat, files, assignments and session planning into one
                shared space &mdash; so nothing gets lost across five different group chats.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="rounded-full bg-[#74c043] px-6 py-3 text-center text-sm font-semibold text-[#0f3b2c] hover:bg-[#67ad3a]"
                >
                  Get started free
                </Link>
                <a
                  href="#how"
                  className="rounded-full border border-white/25 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-white/10"
                >
                  See how it works
                </a>
              </div>

              <p className="mt-6 flex items-center gap-2 text-[12.5px] text-white/55">
                <Check className="h-4 w-4 text-[#8fd24f]" />
                Free while you&apos;re a student &mdash; no card needed
              </p>
            </div>

            <div className="relative">
              <ChatMockup />
              <Pill className="-left-6 top-4">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Replies in real time
              </Pill>
              <Pill className="-right-5 top-1/3">Nothing gets lost 🎯</Pill>
              <Pill className="-left-8 bottom-12">No 17-message threads</Pill>
              <Pill className="-bottom-3 right-8">Built for studying 📚</Pill>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- Scattered feature cards ---------- */}
      <section id="features" className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-heading text-2xl font-bold text-foreground sm:text-[2rem]">
            Everything your group juggles, in one place
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-ink-light">
            No skipping between a group chat, a shared drive, a calendar and three reminder apps.
          </p>

          <div className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-4 sm:gap-5">
            {SCATTER.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.label}
                  className={`flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3.5 text-left shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-0.5 hover:rotate-0 ${f.rot}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
                    <Icon className="h-[18px] w-[18px] text-brand" />
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-foreground">{f.label}</span>
                    <span className="block text-[11.5px] text-ink-light">{f.note}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Left mock / right copy ---------- */}
      <section className="px-4 py-8 sm:px-6 sm:py-14">
        <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
          <div className="rounded-[24px] border border-border bg-white p-5 shadow-sm sm:p-6">
            <p className="text-[13px] font-semibold text-foreground">This week</p>
            <div className="mt-4 space-y-2.5">
              {[
                { t: "Lab report — Chem 204", d: "Due Thu", done: false },
                { t: "Read chapters 6–7", d: "Due Fri", done: true },
                { t: "Prep slides for review session", d: "Due Sun", done: false },
              ].map((row) => (
                <div
                  key={row.t}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-recessed px-3.5 py-3"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      row.done ? "border-brand bg-brand text-white" : "border-ink-light/40"
                    }`}
                  >
                    {row.done ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span
                    className={`flex-1 text-[13px] ${
                      row.done ? "text-ink-light line-through" : "text-foreground"
                    }`}
                  >
                    {row.t}
                  </span>
                  <span className="text-[11px] font-medium text-ink-light">{row.d}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-heading text-2xl font-bold leading-tight text-foreground sm:text-[2rem]">
              Turn &ldquo;don&apos;t forget the essay&rdquo; into a shared checklist
            </h2>
            <p className="mt-4 text-[15px] text-ink-light">
              Assignments and due dates live where the group already talks, so everyone is looking at
              the same list.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Shared assignments with due dates everyone can see",
                "Scheduling polls that end the 17-message meeting thread",
                "Threaded replies so context never gets lost",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-[14px] text-foreground">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10">
                    <Check className="h-3.5 w-3.5 text-brand" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#74c043] px-6 py-3 text-sm font-semibold text-[#0f3b2c] hover:bg-[#67ad3a]"
            >
              Get started free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Dark section: mock + 2x2 ---------- */}
      <section id="how" className="px-3 py-8 sm:px-4 sm:py-14">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#12161d] px-5 py-14 sm:rounded-[40px] sm:px-12 sm:py-16">
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="font-heading text-2xl font-bold text-white sm:text-[2rem]">
                One shared space for the whole workflow
              </h2>
              <p className="mt-3 text-[15px] text-white/60">
                Chat, files, deadlines and scheduling &mdash; built for studying, not just messaging.
              </p>
              <div className="mt-8 hidden lg:block">
                <ChatMockup />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {DARK_FEATURES.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#74c043]/15">
                      <Icon className="h-5 w-5 text-[#8fd24f]" />
                    </span>
                    <h3 className="mt-3.5 text-[15px] font-semibold text-white">{card.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{card.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Steps ---------- */}
      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center font-heading text-2xl font-bold text-foreground sm:text-[2rem]">
            Up and running in three steps
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                number: "1",
                title: "Create or join a group",
                description: "Public groups join instantly; private groups are invite-code only.",
              },
              {
                number: "2",
                title: "Chat, share, plan",
                description: "Real-time discussion, file drops and scheduling polls in one thread.",
              },
              {
                number: "3",
                title: "Stay accountable",
                description: "Shared assignments and due dates keep everyone honest.",
              },
            ].map((step) => (
              <div key={step.number} className="rounded-2xl border border-border bg-white p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0f3b2c] text-sm font-bold text-white">
                  {step.number}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-light">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Testimonials ---------- */}
      <section id="voices" className="px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <h2 className="font-heading text-2xl font-bold text-foreground sm:text-[2rem]">
              What study groups say
            </h2>
            <div className="hidden gap-2 sm:flex" aria-hidden>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink-light">
                <ChevronLeft className="h-4 w-4" />
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink-light">
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => {
              const highlighted = i === 1;
              return (
                <div
                  key={t.quote}
                  className={
                    highlighted
                      ? "rounded-2xl bg-brand p-6 text-white shadow-lg shadow-brand/20"
                      : "rounded-2xl border border-border bg-white p-6"
                  }
                >
                  <div className="flex gap-0.5">
                    {[0, 1, 2, 3, 4].map((s) => (
                      <Star
                        key={s}
                        className={`h-3.5 w-3.5 ${
                          highlighted ? "fill-white text-white" : "fill-[#74c043] text-[#74c043]"
                        }`}
                      />
                    ))}
                  </div>
                  <p
                    className={`mt-4 text-[13.5px] leading-relaxed ${
                      highlighted ? "text-white/90" : "text-ink-light"
                    }`}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="mt-5 flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full ${
                        highlighted ? "bg-white/20" : "bg-brand/10"
                      }`}
                    >
                      <Users className={`h-4 w-4 ${highlighted ? "text-white" : "text-brand"}`} />
                    </span>
                    <div>
                      <p
                        className={`text-[13px] font-semibold ${
                          highlighted ? "text-white" : "text-foreground"
                        }`}
                      >
                        {t.who}
                      </p>
                      <p className={`text-[12px] ${highlighted ? "text-white/70" : "text-ink-light"}`}>
                        {t.role}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Big CTA ---------- */}
      <section className="px-3 pb-10 sm:px-4">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#0f3b2c] px-5 py-14 text-center sm:rounded-[40px] sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute -left-20 -top-16 h-72 w-72 rounded-full bg-[#74c043]/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
          <p className="relative text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8fd24f]">
            Start today
          </p>
          <h2 className="relative mx-auto mt-3 max-w-xl font-heading text-3xl font-bold text-white sm:text-4xl">
            Your next study session starts here
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-[15px] text-white/70">
            Create a group, invite your people, and keep everything in one place.
          </p>

          {/* email → signup */}
          <form
            action="/signup"
            method="get"
            className="relative mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <input
              type="email"
              name="email"
              placeholder="you@university.edu"
              aria-label="Email address"
              className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-[#74c043] px-6 py-3 text-sm font-semibold text-[#0f3b2c] hover:bg-[#67ad3a]"
            >
              Get started
            </button>
          </form>
          <p className="relative mt-3 text-[12px] text-white/45">Free for students. Takes a minute.</p>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="mt-auto border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="StudyUp" width={130} height={30} className="h-[30px] w-auto" />
              <p className="mt-3 max-w-xs text-sm text-ink-light">
                Built for students who actually want to get things done together.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Product</h4>
              <ul className="mt-4 space-y-2 text-sm text-ink-light">
                <li>
                  <a href="#features" className="hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how" className="hover:text-foreground">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#voices" className="hover:text-foreground">
                    Why StudyUp
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Account</h4>
              <ul className="mt-4 space-y-2 text-sm text-ink-light">
                <li>
                  <Link href="/login" className="hover:text-foreground">
                    Log in
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="hover:text-foreground">
                    Create account
                  </Link>
                </li>
                <li>
                  <Link href="/forgot-password" className="hover:text-foreground">
                    Reset password
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Legal</h4>
              <ul className="mt-4 space-y-2 text-sm text-ink-light">
                <li>
                  <a href="#" className="hover:text-foreground">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-8 text-center text-sm text-ink-light">
            <p>&copy; 2026 StudyUp. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
