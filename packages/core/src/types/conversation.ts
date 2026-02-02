import type { Citation } from "./agent.js";

export interface Conversation {
  id: string;
  userId?: string;
  userSport?: string;
  channel: "web" | "api" | "slack";
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations: Citation[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}
