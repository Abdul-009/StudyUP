"use client";

import Link from "next/link";
import { MessageCircle, Paperclip, CheckSquare, Calendar, Lock, Bell, ArrowRight } from "lucide-react";

export default function LandingPageContent() {
  return (
    <div className="flex min-h-full flex-col bg-paper">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="font-heading text-xl font-bold text-foreground">
            Study<span className="text-brand">Up</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-foreground transition-colors hover:text-brand"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              Sign Up
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-paper to-paper-alt px-4 py-16 sm:py-24 md:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-[-0.02em] text-foreground sm:text-5xl md:text-6xl">
            Study together. <br />
            <span className="text-brand">Stay on track.</span>
          </h1>
          <p className="mt-6 text-lg text-muted sm:text-xl">
            Study Up brings your group's chats, files, assignments, and session planning into one place — 
            so nothing gets lost across five different group chats.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-lg bg-brand px-6 py-3 text-center font-semibold text-white hover:bg-brand-hover transition-colors"
            >
              Get Started Free
            </Link>
            <button
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-lg border border-border px-6 py-3 font-semibold text-foreground hover:bg-surface-recessed transition-colors"
            >
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-border bg-surface p-8 sm:p-12">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              Group work falls apart in the gaps.
            </h2>
            <p className="mt-6 text-lg text-muted leading-relaxed">
              Messages get buried in someone's DMs. Notes get lost in an email chain nobody checks. Nobody agrees on when to meet, so nobody meets. Study Up puts your group's whole workflow — chat, files, deadlines, scheduling — in one shared space built for studying, not just messaging.
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl">
            Everything you need
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: MessageCircle,
                title: "Real-time Group Chat",
                description: "Talk it out instantly, with threaded replies so context never gets lost.",
              },
              {
                icon: Paperclip,
                title: "File Sharing",
                description: "Drop notes, slides, and PDFs right into the conversation — up to 10MB per file.",
              },
              {
                icon: CheckSquare,
                title: "Assignment Tracking",
                description: "Turn 'don't forget the essay' into a shared checklist everyone can see.",
              },
              {
                icon: Calendar,
                title: "Session Scheduling",
                description: "Poll the group, lock in a time, done. No more 17-message scheduling threads.",
              },
              {
                icon: Lock,
                title: "Private Messaging",
                description: "Need to sync with one teammate? Message them directly without leaving the group.",
              },
              {
                icon: Bell,
                title: "Smart Notifications",
                description: "Get pinged only when it matters — new messages, poll results, coming due dates.",
              },
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="flex flex-col gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10">
                    <Icon className="h-6 w-6 text-brand" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-muted">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-surface px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl mb-12">
            How It Works
          </h2>
          <div className="space-y-8">
            {[
              {
                number: "1",
                title: "Create or join a group.",
                description: "Public groups are searchable and joinable instantly; private groups stay off-search, invite-code only.",
              },
              {
                number: "2",
                title: "Chat, share, plan.",
                description: "Real-time discussion, file drops, and scheduling polls, all in one thread.",
              },
              {
                number: "3",
                title: "Stay accountable.",
                description: "Shared assignments and due dates keep everyone honest — no more 'wait, was that due today?'",
              },
            ].map((step, i) => (
              <div key={i} className="flex gap-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white font-bold text-lg">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-muted">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Secondary CTA */}
      <section className="px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            Your next study session starts here.
          </h2>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            Create Your First Group
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                Study<span className="text-brand">Up</span>
              </h3>
              <p className="mt-2 text-sm text-muted">
                Built for students who actually want to get things done together.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground">Product</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li><a href="#features" className="transition-colors hover:text-foreground">Features</a></li>
                <li><a href="#how-it-works" className="transition-colors hover:text-foreground">How It Works</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground">Account</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li><Link href="/login" className="transition-colors hover:text-foreground">Log In</Link></li>
                <li><Link href="/signup" className="transition-colors hover:text-foreground">Sign Up</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground">Legal</h4>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li><a href="#" className="transition-colors hover:text-foreground">Privacy</a></li>
                <li><a href="#" className="transition-colors hover:text-foreground">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-border pt-8 text-center text-sm text-muted">
            <p>&copy; 2026 Study Up. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
