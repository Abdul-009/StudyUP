export type InboxLink = { label: string; url: string };

/**
 * A "jump straight to your inbox" link for the common webmail providers, so the
 * "check your email" screen can offer an Open-Gmail-style button instead of
 * making people go hunting for the tab.
 */
export function inboxLinkForEmail(email: string): InboxLink {
  const domain = email.split("@")[1]?.toLowerCase().trim() ?? "";

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { label: "Open Gmail", url: "https://mail.google.com/mail/u/0/#inbox" };
  }
  if (["outlook.com", "hotmail.com", "live.com", "msn.com", "hotmail.co.uk"].includes(domain)) {
    return { label: "Open Outlook", url: "https://outlook.live.com/mail/0/" };
  }
  if (["yahoo.com", "ymail.com", "yahoo.co.uk"].includes(domain)) {
    return { label: "Open Yahoo Mail", url: "https://mail.yahoo.com/" };
  }
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return { label: "Open iCloud Mail", url: "https://www.icloud.com/mail/" };
  }
  if (domain === "proton.me" || domain === "protonmail.com" || domain === "pm.me") {
    return { label: "Open Proton Mail", url: "https://mail.proton.me/u/0/inbox" };
  }
  if (domain.endsWith(".edu") || domain.includes("outlook")) {
    return { label: "Open Outlook", url: "https://outlook.office.com/mail/" };
  }
  return { label: "Open your email", url: domain ? `https://${domain}` : "https://mail.google.com/" };
}

/** Best-effort local OS notification — only fires if the user already granted permission. */
export function notifyEmailSent(email: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const note = new Notification("Verify your Study Up email", {
      body: `We sent a confirmation link to ${email}. Open it to finish signing up.`,
      tag: "studyup-verify-email",
    });
    note.onclick = () => window.focus();
  } catch {
    // Some browsers throw if constructed outside a SW context — ignore.
  }
}
