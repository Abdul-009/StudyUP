export type AppTab =
  | "home"
  | "chat"
  | "files"
  | "announcements"
  | "assignments"
  | "polls"
  | "notifications"
  | "profile"
  | "settings";

export type Role = "ADMIN" | "MEMBER";
export type PollType = "MEETING_TIME" | "STUDY_TOPIC" | "CUSTOM";
export type NotifType = "NEW_MESSAGE" | "NEW_ASSIGNMENT" | "POLL_UPDATE" | "ANNOUNCEMENT";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  course: string;
  yearOfStudy: number;
  profilePicUrl: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  isPrivate: boolean;
  inviteCode?: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  lastSeenAt: string;
}

export interface Message {
  id: string;
  groupId: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt?: string;
}

export interface SharedFile {
  id: string;
  groupId: string;
  uploadedBy: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

export interface Announcement {
  id: string;
  groupId: string;
  postedBy: string;
  content: string;
  createdAt: string;
}

export interface Assignment {
  id: string;
  groupId: string;
  createdBy: string;
  title: string;
  description?: string;
  dueDate: string;
  createdAt: string;
}

export interface AssignmentCompletion {
  id: string;
  assignmentId: string;
  userId: string;
  completedAt?: string;
}

export interface Poll {
  id: string;
  groupId: string;
  createdBy: string;
  question: string;
  type: PollType;
  closesAt?: string;
  createdAt: string;
  allowMultiple: boolean;
}

export interface PollOption {
  id: string;
  pollId: string;
  label: string;
}

export interface PollVote {
  id: string;
  pollOptionId: string;
  userId: string;
  votedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotifType;
  groupId?: string;
  refId?: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export const currentUser: UserProfile = {
  id: "user-1",
  name: "Maya Chen",
  email: "maya@studyup.app",
  course: "Computer Science",
  yearOfStudy: 3,
  profilePicUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
};

export const groups: Group[] = [
  {
    id: "group-1",
    name: "Algorithms Sprint",
    description: "Weekly problem solving and review sessions",
    createdBy: currentUser.id,
    createdAt: "2026-06-10T09:00:00.000Z",
    isPrivate: false,
    inviteCode: "ALG-2026",
  },
  {
    id: "group-2",
    name: "Biology Lab Crew",
    description: "Shared notes and lab prep for module 4",
    createdBy: "user-2",
    createdAt: "2026-06-14T13:10:00.000Z",
    isPrivate: true,
    inviteCode: "BIO-42",
  },
];

export const groupMembers: GroupMember[] = [
  { id: "member-1", groupId: "group-1", userId: currentUser.id, role: "ADMIN", joinedAt: "2026-06-10T09:15:00.000Z", lastSeenAt: "2026-07-18T18:00:00.000Z" },
  { id: "member-2", groupId: "group-1", userId: "user-2", role: "MEMBER", joinedAt: "2026-06-10T10:00:00.000Z", lastSeenAt: "2026-07-18T17:50:00.000Z" },
  { id: "member-3", groupId: "group-1", userId: "user-3", role: "MEMBER", joinedAt: "2026-06-11T08:00:00.000Z", lastSeenAt: "2026-07-18T12:30:00.000Z" },
  { id: "member-4", groupId: "group-2", userId: currentUser.id, role: "MEMBER", joinedAt: "2026-06-14T13:10:00.000Z", lastSeenAt: "2026-07-17T20:00:00.000Z" },
  { id: "member-5", groupId: "group-2", userId: "user-4", role: "ADMIN", joinedAt: "2026-06-14T13:12:00.000Z", lastSeenAt: "2026-07-17T19:45:00.000Z" },
];

export const messages: Message[] = [
  { id: "msg-1", groupId: "group-1", userId: "user-2", content: "I can bring the practice questions for tomorrow.", createdAt: "2026-07-18T17:30:00.000Z" },
  { id: "msg-2", groupId: "group-1", userId: currentUser.id, content: "Perfect. I’ll prepare a quick recap of graph traversal.", createdAt: "2026-07-18T17:45:00.000Z" },
  { id: "msg-3", groupId: "group-2", userId: "user-4", content: "The lab notes are updated in the shared files section.", createdAt: "2026-07-17T19:30:00.000Z" },
];

export const files: SharedFile[] = [
  { id: "file-1", groupId: "group-1", uploadedBy: currentUser.id, fileName: "graph-theory-notes.pdf", fileUrl: "/files/graph-theory-notes.pdf", fileType: "pdf", fileSize: 840000, createdAt: "2026-07-16T10:00:00.000Z" },
  { id: "file-2", groupId: "group-2", uploadedBy: "user-4", fileName: "lab-4-cheatsheet.docx", fileUrl: "/files/lab-4-cheatsheet.docx", fileType: "docx", fileSize: 320000, createdAt: "2026-07-17T16:30:00.000Z" },
];

export const announcements: Announcement[] = [
  { id: "ann-1", groupId: "group-1", postedBy: currentUser.id, content: "We are shifting the Friday meetup to 6:30pm to avoid the campus rush.", createdAt: "2026-07-18T16:00:00.000Z" },
  { id: "ann-2", groupId: "group-2", postedBy: "user-4", content: "Remember to bring your labeled slides to the lab demo.", createdAt: "2026-07-17T18:20:00.000Z" },
];

export const assignments: Assignment[] = [
  { id: "assignment-1", groupId: "group-1", createdBy: "user-2", title: "Dynamic Programming Practice", description: "Complete 8 problems before Friday.", dueDate: "2026-07-24T23:59:00.000Z", createdAt: "2026-07-15T08:00:00.000Z" },
  { id: "assignment-2", groupId: "group-2", createdBy: "user-4", title: "Lab Reflection", description: "Upload a short reflection to the shared folder.", dueDate: "2026-07-22T23:59:00.000Z", createdAt: "2026-07-16T12:00:00.000Z" },
];

export const assignmentCompletions: AssignmentCompletion[] = [
  { id: "completion-1", assignmentId: "assignment-1", userId: currentUser.id, completedAt: "2026-07-18T10:00:00.000Z" },
  { id: "completion-2", assignmentId: "assignment-2", userId: currentUser.id },
];

export const polls: Poll[] = [
  {
    id: "poll-1",
    groupId: "group-1",
    createdBy: currentUser.id,
    question: "Which session time works best for the next review?",
    type: "MEETING_TIME",
    closesAt: "2026-07-21T20:00:00.000Z",
    createdAt: "2026-07-18T11:00:00.000Z",
    allowMultiple: false,
  },
  {
    id: "poll-2",
    groupId: "group-1",
    createdBy: "user-3",
    question: "Which topics should we cover next week?",
    type: "STUDY_TOPIC",
    createdAt: "2026-07-17T15:30:00.000Z",
    allowMultiple: true,
  },
];

export const pollOptions: PollOption[] = [
  { id: "option-1", pollId: "poll-1", label: "Tuesday 6:30pm" },
  { id: "option-2", pollId: "poll-1", label: "Wednesday 8:00pm" },
  { id: "option-3", pollId: "poll-2", label: "Dynamic programming" },
  { id: "option-4", pollId: "poll-2", label: "Shortest path" },
  { id: "option-5", pollId: "poll-2", label: "Graph coloring" },
];

export const pollVotes: PollVote[] = [
  { id: "vote-1", pollOptionId: "option-1", userId: "user-2", votedAt: "2026-07-18T11:20:00.000Z" },
  { id: "vote-2", pollOptionId: "option-3", userId: currentUser.id, votedAt: "2026-07-18T11:30:00.000Z" },
  { id: "vote-3", pollOptionId: "option-4", userId: currentUser.id, votedAt: "2026-07-18T11:31:00.000Z" },
];

export const notifications: NotificationItem[] = [
  { id: "notif-1", userId: currentUser.id, type: "NEW_MESSAGE", groupId: "group-1", content: "New chat message from Omar", isRead: false, createdAt: "2026-07-18T18:05:00.000Z" },
  { id: "notif-2", userId: currentUser.id, type: "NEW_ASSIGNMENT", groupId: "group-1", content: "A new assignment was posted for Algorithms Sprint", isRead: false, createdAt: "2026-07-18T17:00:00.000Z" },
  { id: "notif-3", userId: currentUser.id, type: "ANNOUNCEMENT", groupId: "group-2", content: "A new announcement was shared in Biology Lab Crew", isRead: true, createdAt: "2026-07-17T19:00:00.000Z" },
];
