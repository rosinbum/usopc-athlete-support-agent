import type { TopicDomain } from "./agent.js";

export interface DomainCategory {
  id: TopicDomain;
  label: string;
  description: string;
  keywords: string[];
  escalationTargets: string[];
}

export interface ContactInfo {
  organization: string;
  role: string;
  email?: string;
  phone?: string;
  url?: string;
  description: string;
}

export interface DeadlineRule {
  id: string;
  name: string;
  domain: TopicDomain;
  durationDays: number;
  description: string;
  sourceReference: string;
}
