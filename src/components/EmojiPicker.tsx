"use client";

import { useEffect, useRef } from "react";

// Dependency-free emoji picker. A curated set covering the emoji people actually
// reach for in chat — enough to feel complete without shipping a 1MB dataset.
const EMOJI_GROUPS: { label: string; emoji: string[] }[] = [
  {
    label: "Smileys",
    emoji: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊",
      "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😋", "😛", "😜", "🤪", "😝",
      "🤗", "🤭", "🤫", "🤔", "🤐", "😐", "😑", "😶", "😏", "😒", "🙄", "😬",
      "😌", "😔", "😪", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "😵",
      "🤯", "🤠", "🥳", "😎", "🤓", "🧐", "😕", "😟", "🙁", "😮", "😯", "😲",
      "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣",
      "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀",
    ],
  },
  {
    label: "Gestures & people",
    emoji: [
      "👍", "👎", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉",
      "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝", "🙏", "✍️", "💪",
      "🦵", "🦶", "👏", "🙌", "👐", "🤲", "🙋", "🤦", "🤷", "💁", "🙆", "🙅",
      "🧑", "👤", "👶", "🧒", "👦", "👧", "🧓", "👴", "👵", "👨‍💻", "👩‍💻", "🎓",
    ],
  },
  {
    label: "Hearts & symbols",
    emoji: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕",
      "💞", "💓", "💗", "💖", "💘", "💝", "💯", "💢", "💥", "💫", "💦", "💨",
      "✅", "❌", "❓", "❗", "‼️", "⭐", "🌟", "✨", "⚡", "🔥", "🎉", "🎊",
      "🏆", "🥇", "🎯", "🔔", "📌", "📎", "🔗", "💡", "⏰", "✔️", "➕", "➖",
    ],
  },
  {
    label: "Study & objects",
    emoji: [
      "📚", "📖", "📕", "📗", "📘", "📙", "📝", "✏️", "🖊️", "🖍️", "📄", "📑",
      "🗂️", "📁", "📅", "📆", "🗓️", "📊", "📈", "📉", "💻", "🖥️", "⌨️", "🖱️",
      "📱", "☕", "🍵", "🧠", "👀", "🕐", "🎧", "🔍", "🧮", "📢", "🏫", "🎒",
    ],
  },
  {
    label: "Food & nature",
    emoji: [
      "🍏", "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒", "🍑", "🥭",
      "🍍", "🥥", "🥝", "🍅", "🥑", "🥦", "🥕", "🌽", "🍞", "🧀", "🍕", "🍔",
      "🍟", "🌮", "🍿", "🍩", "🍪", "🎂", "🍰", "🍫", "🍬", "🍭", "🌱", "🌿",
      "🍀", "🌸", "🌼", "🌻", "🌈", "☀️", "🌙", "⭐", "❄️", "🌊", "🐶", "🐱",
    ],
  },
];

type EmojiPickerProps = {
  onSelect: (emoji: string) => void;
  onClose: () => void;
};

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-[300px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-lg"
      role="dialog"
      aria-label="Emoji picker"
    >
      {EMOJI_GROUPS.map((group) => (
        <div key={group.label} className="mb-2 last:mb-0">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted">
            {group.label}
          </p>
          <div className="grid grid-cols-8 gap-0.5">
            {group.emoji.map((emoji, index) => (
              <button
                key={`${group.label}-${index}`}
                type="button"
                onClick={() => onSelect(emoji)}
                className="rounded-md p-1 text-lg leading-none hover:bg-surface-recessed"
                aria-label={`Insert ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
