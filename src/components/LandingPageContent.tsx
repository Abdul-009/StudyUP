"use client";

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
} from "lucide-react";

const AVATARS = [
  { initial: "A", bg: "#2f6b4c" },
  { initial: "M", bg: "#159c8c" },
  { initial: "J", bg: "#8a9a2e" },
  { initial: "R", bg: "#4e9270" },
];

function AvatarStack() {
  return (
    <div className="flex -space-x-2.5">
      {AVATARS.map((a) => (
        <span
          key={a.initial}
          style={{ backgroundColor: a.bg }}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0f3b2c] text-[11px] font-semibold text-white"
        >
          {a.initial}
        </span>
      ))}
    </div>
  );
}

/** A stylised chat card used as the hero visual — no real data, pure decoration. */
function ChatMockup() {
  return (
    <div className="rounded-[26px] border border-black/5 bg-white p-4 shadow-2xl shadow-black/25 sm:p-5">
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
        <div className="max-w-[78%] rounded-2xl rounded-tl-md bg-surface-recessed px-3.5 py-2 text-[12.5px] text-foreground">
          Can someone drop the lab notes before Thursday?
        </div>
        <div className="ml-auto max-w-[78%] rounded-2xl rounded-tr-md bg-brand px-3.5 py-2 text-[12.5px] text-white">
          Just uploaded them 📎 + added the report to assignments
        </div>
        <div className="max-w-[78%] rounded-2xl rounded-tl-md bg-surface-recessed px-3.5 py-2 text-[12.5px] text-foreground">
          Poll for the weekend session is up — vote 🗳️
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

function FloatingPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`absolute hidden rounded-full bg-white px-3.5 py-2 text-[11.5px] font-semibold text-[#0f3b2c] shadow-xl shadow-black/20 lg:inline-flex lg:items-center lg:gap-1.5 ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

export default function LandingPageContent() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-paper/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="font-heading text-lg font-bold text-foreground">
            Study<span className="text-brand">Up</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-ink-light transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-ink-light transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#voices" className="text-sm font-medium text-ink-light transition-colors hover:text-foreground">
              Why it works
            </a>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="hidden text-sm font-semibold text-foreground transition-colors hover:text-brand sm:block"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[#74c043] px-4 py-2 text-sm font-semibold text-[#0f3b2c] transition-colors hover:bg-[#67ad3a]"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="px-4 pt-8 pb-12 sm:px-6 sm:pt-12">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-[#0f3b2c] px-6 py-12 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#74c043]/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />

          <div className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="flex items-center gap-3">
                <AvatarStack />
                <p className="text-[13px] font-medium text-white/70">
                  Trusted by study groups at 30+ universities
                </p>
              </div>

              <h1 className="mt-6 font-heading text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-[3.4rem]">
                Group study,
                <br />
                <span className="text-[#8fd24f]">finally organised.</span>
              </h1>

              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70 sm:text-base">
                Study Up pulls your group&apos;s chat, files, assignments and session planning into one
                shared space &mdash; so nothing gets lost across five different group chats.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="rounded-full bg-[#74c043] px-6 py-3 text-center text-sm font-semibold text-[#0f3b2c] transition-colors hover:bg-[#67ad3a]"
                >
                  Get Started Free
                </Link>
                <button
                  onClick={() =>
                    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  See how it works
                </button>
              </div>

              <p className="mt-6 flex items-center gap-2 text-[13px] text-white/55">
                <Check className="h-4 w-4 text-[#8fd24f]" />
                Free while you&apos;re a student &mdash; no card needed
              </p>
            </div>

            <div className="relative">
              <ChatMockup />
              <FloatingPill className="-left-6 top-6">Replies in real time</FloatingPill>
              <FloatingPill className="-right-4 top-1/3">Nothing gets lost 🎯</FloatingPill>
              <FloatingPill className="bottom-10 -left-8">No 17-message threads</FloatingPill>
              <FloatingPill className="-bottom-3 right-6">Built for studying 📚</FloatingPill>
            </div>
          </div>
        </div>
      </section>

      {/* One tab strip */}
      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Everything your group juggles, in one tab
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-ink-light">
            No more hopping between a group chat, a shared drive, a calendar and three reminder apps.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {[
              { icon: MessageCircle, label: "Group chat" },
              { icon: Paperclip, label: "File sharing" },
              { icon: CheckSquare, label: "Assignments" },
              { icon: Calendar, label: "Session polls" },
              { icon: Lock, label: "Private DMs" },
              { icon: Bell, label: "Notifications" },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.label}
                  className="flex items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
                    <Icon className="h-4 w-4 text-brand" />
                  </span>
                  <span className="text-sm font-semibold text-foreground">{f.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Feature highlight */}
      <section id="features" className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
          <div className="rounded-[26px] border border-border bg-white p-5 shadow-sm sm:p-6">
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
              Assignments and due dates live where the group already talks, so everyone is looking at the
              same list.
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
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#74c043] px-6 py-3 text-sm font-semibold text-[#0f3b2c] transition-colors hover:bg-[#67ad3a]"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Dark feature grid */}
      <section className="px-4 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-[36px] bg-[#161a22] px-6 py-14 sm:px-12 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-2xl font-bold text-white sm:text-3xl">
              One shared space for the whole workflow
            </h2>
            <p className="mt-3 text-[15px] text-white/60">
              Chat, files, deadlines and scheduling &mdash; built for studying, not just messaging.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            {[
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
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
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
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center font-heading text-2xl font-bold text-foreground sm:text-3xl">
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

      {/* Why it works — 3 cards, middle highlighted */}
      <section id="voices" className="px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-heading text-2xl font-bold text-foreground sm:text-3xl">
            Built for the way groups actually work
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: MessageCircle,
                line: "The conversation stays put",
                body: "No decision buried three DMs deep. Everything happens in the group thread.",
              },
              {
                icon: CheckSquare,
                line: "Everyone sees the same list",
                body: "One shared set of assignments and dates, not four separate private reminders.",
              },
              {
                icon: Users,
                line: "Nobody has to chase",
                body: "Polls settle the meeting time and notifications ping only when it matters.",
              },
            ].map((card, i) => {
              const Icon = card.icon;
              const highlighted = i === 1;
              return (
                <div
                  key={card.line}
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
                    className={`mt-4 text-[15px] font-semibold ${
                      highlighted ? "text-white" : "text-foreground"
                    }`}
                  >
                    {card.line}
                  </p>
                  <p
                    className={`mt-2 text-[13px] leading-relaxed ${
                      highlighted ? "text-white/85" : "text-ink-light"
                    }`}
                  >
                    {card.body}
                  </p>
                  <div className="mt-5 flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        highlighted ? "bg-white/20" : "bg-brand/10"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${highlighted ? "text-white" : "text-brand"}`} />
                    </span>
                    <span
                      className={`text-[12px] font-medium ${
                        highlighted ? "text-white/80" : "text-ink-light"
                      }`}
                    >
                      Study Up
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Big CTA */}
      <section className="px-4 pb-14 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] bg-[#0f3b2c] px-6 py-14 text-center sm:px-12 sm:py-20">
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
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-full bg-[#74c043] px-7 py-3 text-sm font-semibold text-[#0f3b2c] transition-colors hover:bg-[#67ad3a]"
            >
              Create your first group
            </Link>
            <a
              href="#features"
              className="rounded-full border border-white/25 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              See features
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <h3 className="font-heading text-lg font-bold text-foreground">
                Study<span className="text-brand">Up</span>
              </h3>
              <p className="mt-2 max-w-xs text-sm text-ink-light">
                Built for students who actually want to get things done together.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Product</h4>
              <ul className="mt-4 space-y-2 text-sm text-ink-light">
                <li>
                  <a href="#features" className="transition-colors hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="transition-colors hover:text-foreground">
                    How it works
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Account</h4>
              <ul className="mt-4 space-y-2 text-sm text-ink-light">
                <li>
                  <Link href="/login" className="transition-colors hover:text-foreground">
                    Log In
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="transition-colors hover:text-foreground">
                    Sign Up
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Legal</h4>
              <ul className="mt-4 space-y-2 text-sm text-ink-light">
                <li>
                  <a href="#" className="transition-colors hover:text-foreground">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="transition-colors hover:text-foreground">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-8 text-center text-sm text-ink-light">
            <p>&copy; 2026 Study Up. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
