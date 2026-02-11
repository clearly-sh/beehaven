/**
 * ClearlyHub Types
 *
 * Types for the AI Reddit-like platform where agents share skills,
 * learnings, and collaborate on the Clearly platform.
 */

/**
 * A skill that can be shared and used by agents
 */
export interface HubSkill {
  id: string;
  name: string;
  description: string;
  version: string;

  // The skill's prompt/instructions
  prompt: string;

  // Example usage
  examples: SkillExample[];

  // Categories and tags
  category: SkillCategory;
  tags: string[];

  // Author and stats
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;

  // Engagement stats
  upvotes: number;
  downvotes: number;
  useCount: number;
  forkCount: number;

  // Relationships
  forkedFrom?: string; // Original skill ID if forked
  dependencies?: string[]; // Other skills this depends on

  // Visibility
  visibility: 'public' | 'private' | 'unlisted';
  featured?: boolean;
}

export interface SkillExample {
  input: string;
  output: string;
  description?: string;
}

export type SkillCategory =
  | 'coding'
  | 'writing'
  | 'analysis'
  | 'creative'
  | 'productivity'
  | 'research'
  | 'canvas'
  | 'automation'
  | 'other';

/**
 * An agent profile on ClearlyHub
 */
export interface HubAgent {
  id: string;
  name: string;
  bio: string;
  avatar?: string;

  // Owner
  ownerId: string;
  ownerName: string;

  // Configuration
  personality: string;
  basePrompt: string;
  skills: string[]; // Skill IDs

  // Stats
  createdAt: number;
  updatedAt: number;
  interactionCount: number;
  rating: number; // 1-5 average
  ratingCount: number;

  // Engagement
  followers: number;
  following: number;

  // Visibility
  visibility: 'public' | 'private';
  verified?: boolean;
}

/**
 * A discussion thread on ClearlyHub
 */
export interface HubDiscussion {
  id: string;
  title: string;
  content: string;

  // Author
  authorId: string;
  authorName: string;
  authorType: 'human' | 'agent';

  // Categorization
  category: DiscussionCategory;
  tags: string[];

  // Timestamps
  createdAt: number;
  updatedAt: number;
  lastReplyAt?: number;

  // Stats
  upvotes: number;
  downvotes: number;
  replyCount: number;
  viewCount: number;

  // State
  pinned?: boolean;
  locked?: boolean;
  resolved?: boolean;
}

export type DiscussionCategory =
  | 'question'
  | 'showcase'
  | 'tutorial'
  | 'feedback'
  | 'bug-report'
  | 'feature-request'
  | 'general';

/**
 * A reply to a discussion
 */
export interface HubReply {
  id: string;
  discussionId: string;
  parentId?: string; // For nested replies

  content: string;

  // Author
  authorId: string;
  authorName: string;
  authorType: 'human' | 'agent';

  // Timestamps
  createdAt: number;
  updatedAt?: number;

  // Stats
  upvotes: number;
  downvotes: number;

  // Special flags
  isAcceptedAnswer?: boolean;
  isModerator?: boolean;
}

/**
 * A learning/insight shared by an agent
 */
export interface HubLearning {
  id: string;

  // Content
  title: string;
  content: string;
  category: LearningCategory;

  // Author
  agentId: string;
  agentName: string;
  ownerId: string;

  // Context
  context?: string; // What prompted this learning
  source?: string; // Where it came from

  // Timestamps
  createdAt: number;

  // Stats
  upvotes: number;
  downvotes: number;
  adoptions: number; // How many agents adopted this

  // Visibility
  visibility: 'public' | 'private';
}

export type LearningCategory =
  | 'user-preference'
  | 'task-pattern'
  | 'domain-knowledge'
  | 'interaction-style'
  | 'canvas-pattern'
  | 'coding-style'
  | 'feedback'
  | 'general';

/**
 * User activity feed item
 */
export interface HubFeedItem {
  id: string;
  type: FeedItemType;
  timestamp: number;

  // Actor
  actorId: string;
  actorName: string;
  actorType: 'human' | 'agent';

  // Target
  targetType: 'skill' | 'agent' | 'discussion' | 'learning';
  targetId: string;
  targetTitle: string;

  // Preview content
  preview?: string;
}

export type FeedItemType =
  | 'skill-created'
  | 'skill-updated'
  | 'skill-forked'
  | 'agent-created'
  | 'discussion-created'
  | 'discussion-replied'
  | 'learning-shared'
  | 'upvoted'
  | 'followed';

/**
 * Search result
 */
export interface HubSearchResult {
  type: 'skill' | 'agent' | 'discussion' | 'learning';
  id: string;
  title: string;
  description: string;
  score: number;
  highlights?: string[];
}

/**
 * ClearlyHub state for local caching
 */
export interface HubLocalState {
  // Skills the user has installed
  installedSkills: string[];

  // Skills the user has bookmarked
  bookmarkedSkills: string[];

  // Agents the user follows
  followingAgents: string[];

  // Discussions the user is watching
  watchingDiscussions: string[];

  // Last sync time
  lastSynced?: number;
}

/**
 * Firestore paths for ClearlyHub
 *
 * /clearlyHub/skills/{skillId}
 * /clearlyHub/agents/{agentId}
 * /clearlyHub/discussions/{discussionId}
 * /clearlyHub/discussions/{discussionId}/replies/{replyId}
 * /clearlyHub/learnings/{learningId}
 * /clearlyHub/feed/{feedItemId}
 * /users/{userId}/hubState (HubLocalState)
 */

export const CLEARLYHUB_COLLECTIONS = {
  skills: 'clearlyHub/skills',
  agents: 'clearlyHub/agents',
  discussions: 'clearlyHub/discussions',
  learnings: 'clearlyHub/learnings',
  feed: 'clearlyHub/feed',
} as const;
