"use client";

import { useState } from "react";
import ChatSidebar from "./ChatSidebar";
import GroupChatClient from "./GroupChatClient";

type SidebarGroup = {
  id: string;
  name: string;
  accentColor: string;
  lastMessage: { content: string; createdAt: string } | null;
};

type MessageRecord = {
  id: string;
  groupId: string;
  userId: string;
  content: string | null;
  createdAt: string;
  editedAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  replyToId: string | null;
  replyTo?: {
    id: string;
    content: string | null;
    isDeleted: boolean;
    user?: {
      name: string;
    };
  } | null;
};

type MemberRecord = {
  id: string;
  userId: string;
  role: "ADMIN" | "MEMBER";
  user: {
    id: string;
    name: string;
    email: string;
    profilePicUrl: string | null;
  } | null;
};

type ChatLayoutProps = {
  sidebarGroups: SidebarGroup[];
  activeGroupId: string;
  groupId: string;
  groupName: string;
  groupColor: string;
  currentUserId: string;
  initialMessages: MessageRecord[];
  initialMembers: MemberRecord[];
};

export default function ChatLayout({
  sidebarGroups,
  activeGroupId,
  groupId,
  groupName,
  groupColor,
  currentUserId,
  initialMessages,
  initialMembers,
}: ChatLayoutProps) {
  // On mobile, only one panel is shown at a time; arriving at a group's chat
  // page shows the chat first, and the back button returns to the list.
  const [showList, setShowList] = useState(false);

  return (
    <div className="flex min-h-[70vh] flex-1 gap-4 md:min-h-[560px]">
      <div className={`${showList ? "flex" : "hidden"} w-full md:flex md:w-auto`}>
        <ChatSidebar groups={sidebarGroups} activeGroupId={activeGroupId} />
      </div>
      <div className={`${showList ? "hidden" : "flex"} min-w-0 flex-1 md:flex`}>
        <GroupChatClient
          groupId={groupId}
          groupName={groupName}
          groupColor={groupColor}
          currentUserId={currentUserId}
          initialMessages={initialMessages}
          initialMembers={initialMembers}
          onBack={() => setShowList(true)}
        />
      </div>
    </div>
  );
}
