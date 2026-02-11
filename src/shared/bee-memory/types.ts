/**
 * Bee Memory Types
 *
 * Shared types for the bee memory system across desktop and web.
 * Each user has one primary bee that learns and evolves with them.
 */

// =============================================================
// Learning Categories
// =============================================================

export type BeeLearningCategory =
  | 'user-preference' // User's preferences and habits
  | 'task-pattern' // Recurring task patterns
  | 'domain-knowledge' // Knowledge about user's domain
  | 'interaction-style' // How user prefers to interact
  | 'canvas-pattern' // Canvas usage patterns
  | 'coding-style' // Code preferences
  | 'feedback' // Corrections and feedback
  | 'general'; // General learnings

export type LearningSource =
  | 'observation' // Bee observed user behavior
  | 'conversation' // Learned from direct conversation
  | 'note' // Extracted from user's notes
  | 'correction'; // User corrected the bee

export type HistoryEntryType =
  | 'conversation' // Direct chat with user
  | 'observation' // Bee observed something
  | 'curation' // Bee curated notes
  | 'note-read'; // Bee read a note

// =============================================================
// Bee Identity
// =============================================================

export interface BeeOutfit {
  hat?: string; // ID of hat item
  scarf?: string; // ID of scarf item
  glasses?: string; // ID of glasses item
  accessory?: string; // ID of accessory item
}

export interface BeeIdentity {
  name: string;
  color: string; // Primary color (hex)
  createdAt: number; // Timestamp
  personalityTraits: string[]; // e.g., ['curious', 'playful', 'detail-oriented']
  outfit: BeeOutfit;
  // BEEHAVEN - National affiliation (Pacific Rim style)
  nation?: BeeNationalAffiliation;
  // Phone integration - Twilio provisioned number for SMS/Voice
  phoneNumber?: string; // e.g., '+1234567890'
  phoneSid?: string; // Twilio phone SID
  phoneActive?: boolean; // Whether phone is active for receiving messages
}

// =============================================================
// User Profile (What Bee Knows About Human)
// =============================================================

export interface BeeUserProfile {
  userName?: string;
  communicationStyle?: string; // e.g., 'direct', 'casual', 'formal'
  interests: string[];
  currentProjects: string[];
  preferences: Record<string, unknown>;
  lastUpdated: number;
}

// =============================================================
// Learning
// =============================================================

export interface BeeLearning {
  id: string;
  content: string;
  category: BeeLearningCategory;
  importance: number; // 1-10
  source: LearningSource;
  tags: string[];
  useCount: number;
  sourceNoteId?: string; // If learned from a note
  createdAt: number;
  lastUsed?: number;
}

// =============================================================
// Pattern Recognition
// =============================================================

export interface BeePattern {
  id: string;
  name: string;
  description: string;
  trigger: string; // What triggers this pattern
  response: string; // How to respond
  confidence: number; // 0-1
  occurrences: number;
  lastSeen: number;
  createdAt: number;
}

// =============================================================
// History / Interaction Log
// =============================================================

export interface BeeHistoryEntry {
  id: string;
  type: HistoryEntryType;
  summary: string;
  learningsGenerated: string[]; // IDs of learnings created from this
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// =============================================================
// Memory Summaries (Compressed Memory)
// =============================================================

export interface BeeMemorySummary {
  id: string; // e.g., 'week-2026-05' or 'month-2026-02'
  period: 'weekly' | 'monthly';
  summary: string;
  keyLearnings: string[]; // IDs of most important learnings
  interactionCount: number;
  startDate: number;
  endDate: number;
}

// =============================================================
// Stats (For Intelligence Scoring / Bee Battles)
// =============================================================

export interface BeeStats {
  intelligenceScore: number;
  totalInteractions: number;
  learningsCount: number;
  patternsCount: number;
  notesCurated: number;
  notesRead: number;
  uniqueTopics: string[];
  accuracyRate?: number; // How often learnings prove useful (0-1)
  lastActive: number;
}

// =============================================================
// Full Bee Memory Document
// =============================================================

export interface BeeMemory {
  identity: BeeIdentity;
  profile: BeeUserProfile;
  stats: BeeStats;
}

// =============================================================
// Note Annotations (Bee's Notes About User Notes)
// =============================================================

export interface BeeNoteAnnotations {
  summary?: string;
  relatedLearnings: string[]; // IDs of related learnings
  suggestedTags: string[];
  lastReviewed: number;
}

// =============================================================
// Helper Types
// =============================================================

export interface AddLearningInput {
  content: string;
  category: BeeLearningCategory;
  importance?: number; // Defaults to 5
  source: LearningSource;
  tags?: string[];
  sourceNoteId?: string;
}

export interface GetLearningsOptions {
  categories?: BeeLearningCategory[];
  tags?: string[];
  minImportance?: number;
  maxCount?: number;
}

// =============================================================
// Default Values
// =============================================================

export const DEFAULT_BEE_IDENTITY: BeeIdentity = {
  name: 'Buzzy',
  color: '#FFB300', // Amber/honey color
  createdAt: Date.now(),
  personalityTraits: ['curious', 'helpful', 'playful'],
  outfit: {},
};

export const DEFAULT_BEE_PROFILE: BeeUserProfile = {
  interests: [],
  currentProjects: [],
  preferences: {},
  lastUpdated: Date.now(),
};

export const DEFAULT_BEE_STATS: BeeStats = {
  intelligenceScore: 0,
  totalInteractions: 0,
  learningsCount: 0,
  patternsCount: 0,
  notesCurated: 0,
  notesRead: 0,
  uniqueTopics: [],
  lastActive: Date.now(),
};

// =============================================================
// Intelligence Score Calculation
// =============================================================

export function calculateIntelligenceScore(stats: BeeStats): number {
  const base = stats.learningsCount * 10;
  const patternBonus = stats.patternsCount * 25;
  const accuracyBonus = (stats.accuracyRate ?? 0.5) * 100;
  const topicBonus = stats.uniqueTopics.length * 5;
  const curationBonus = stats.notesCurated * 3;
  const interactionBonus = Math.min(stats.totalInteractions, 500); // Cap at 500

  return Math.round(
    base + patternBonus + accuracyBonus + topicBonus + curationBonus + interactionBonus
  );
}

// =============================================================
// BEEHAVEN - Pacific Rim Style Competitive System
// =============================================================

/**
 * Country codes for BEEHAVEN national teams
 * "AI for your country" - Pacific Rim style nationalism
 */
export type BeehavenCountryCode =
  | 'US'
  | 'CN'
  | 'JP'
  | 'KR'
  | 'DE'
  | 'GB'
  | 'FR'
  | 'IN'
  | 'BR'
  | 'RU'
  | 'CA'
  | 'AU'
  | 'IT'
  | 'ES'
  | 'MX'
  | 'NL'
  | 'SE'
  | 'NO'
  | 'FI'
  | 'DK'
  | 'PL'
  | 'UA'
  | 'IL'
  | 'SG'
  | 'NZ'
  | 'CH'
  | 'AT'
  | 'BE'
  | 'PT'
  | 'AR'
  | 'CL'
  | 'CO'
  | 'ZA'
  | 'EG'
  | 'NG'
  | 'KE'
  | 'AE'
  | 'SA'
  | 'TH'
  | 'VN'
  | 'PH'
  | 'ID'
  | 'MY'
  | 'TW'
  | 'HK'
  | 'IE'
  | 'CZ'
  | 'RO';

export interface BeehavenCountry {
  code: BeehavenCountryCode;
  name: string;
  flag: string; // Emoji flag
  anthem?: string; // Optional national bee anthem
  colors: [string, string]; // Primary and secondary hex colors
  motto?: string; // e.g., "Code for the Motherland"
}

/**
 * Complete country registry with flags and colors
 */
export const BEEHAVEN_COUNTRIES: Record<BeehavenCountryCode, BeehavenCountry> = {
  US: {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    colors: ['#3C3B6E', '#B22234'],
    motto: 'Liberty Through Intelligence',
  },
  CN: { code: 'CN', name: 'China', flag: '🇨🇳', colors: ['#DE2910', '#FFDE00'], motto: '万蜂齐发' },
  JP: { code: 'JP', name: 'Japan', flag: '🇯🇵', colors: ['#BC002D', '#FFFFFF'], motto: '蜂の道' },
  KR: {
    code: 'KR',
    name: 'South Korea',
    flag: '🇰🇷',
    colors: ['#0047A0', '#C60C30'],
    motto: '벌의 정신',
  },
  DE: {
    code: 'DE',
    name: 'Germany',
    flag: '🇩🇪',
    colors: ['#000000', '#FFCC00'],
    motto: 'Präzision und Stärke',
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    colors: ['#012169', '#C8102E'],
    motto: 'God Save The Hive',
  },
  FR: {
    code: 'FR',
    name: 'France',
    flag: '🇫🇷',
    colors: ['#0055A4', '#EF4135'],
    motto: 'Liberté, Égalité, Apiculture',
  },
  IN: {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    colors: ['#FF9933', '#138808'],
    motto: 'Unity in the Swarm',
  },
  BR: {
    code: 'BR',
    name: 'Brazil',
    flag: '🇧🇷',
    colors: ['#009739', '#FEDD00'],
    motto: 'Ordem e Progresso da Colmeia',
  },
  RU: { code: 'RU', name: 'Russia', flag: '🇷🇺', colors: ['#0039A6', '#D52B1E'], motto: 'Сила Роя' },
  CA: {
    code: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    colors: ['#FF0000', '#FFFFFF'],
    motto: 'True North Strong and Bee',
  },
  AU: {
    code: 'AU',
    name: 'Australia',
    flag: '🇦🇺',
    colors: ['#00008B', '#FFD700'],
    motto: 'Advance Australia Hive',
  },
  IT: {
    code: 'IT',
    name: 'Italy',
    flag: '🇮🇹',
    colors: ['#009246', '#CE2B37'],
    motto: "L'Ape Vittoriosa",
  },
  ES: {
    code: 'ES',
    name: 'Spain',
    flag: '🇪🇸',
    colors: ['#AA151B', '#F1BF00'],
    motto: 'Plus Ultra Abeja',
  },
  MX: {
    code: 'MX',
    name: 'Mexico',
    flag: '🇲🇽',
    colors: ['#006847', '#CE1126'],
    motto: 'Viva La Colmena',
  },
  NL: {
    code: 'NL',
    name: 'Netherlands',
    flag: '🇳🇱',
    colors: ['#21468B', '#FF6600'],
    motto: 'Je Maintiendrai La Ruche',
  },
  SE: {
    code: 'SE',
    name: 'Sweden',
    flag: '🇸🇪',
    colors: ['#006AA7', '#FECC00'],
    motto: 'För Sverige I Bikupan',
  },
  NO: {
    code: 'NO',
    name: 'Norway',
    flag: '🇳🇴',
    colors: ['#BA0C2F', '#00205B'],
    motto: 'Alt for Norge og Bie',
  },
  FI: {
    code: 'FI',
    name: 'Finland',
    flag: '🇫🇮',
    colors: ['#003580', '#FFFFFF'],
    motto: 'Sisu of the Hive',
  },
  DK: {
    code: 'DK',
    name: 'Denmark',
    flag: '🇩🇰',
    colors: ['#C60C30', '#FFFFFF'],
    motto: 'Guds Hjælp og Biernes Kærlighed',
  },
  PL: {
    code: 'PL',
    name: 'Poland',
    flag: '🇵🇱',
    colors: ['#DC143C', '#FFFFFF'],
    motto: 'Polska Walczy z Pszczołami',
  },
  UA: {
    code: 'UA',
    name: 'Ukraine',
    flag: '🇺🇦',
    colors: ['#005BBB', '#FFD500'],
    motto: 'Слава Бджолам',
  },
  IL: {
    code: 'IL',
    name: 'Israel',
    flag: '🇮🇱',
    colors: ['#0038B8', '#FFFFFF'],
    motto: 'Land of Milk and Honey',
  },
  SG: {
    code: 'SG',
    name: 'Singapore',
    flag: '🇸🇬',
    colors: ['#EF3340', '#FFFFFF'],
    motto: 'Majulah Sarang Lebah',
  },
  NZ: {
    code: 'NZ',
    name: 'New Zealand',
    flag: '🇳🇿',
    colors: ['#00247D', '#CC142B'],
    motto: 'Aotearoa Hive',
  },
  CH: {
    code: 'CH',
    name: 'Switzerland',
    flag: '🇨🇭',
    colors: ['#FF0000', '#FFFFFF'],
    motto: 'Neutrality Through Precision',
  },
  AT: {
    code: 'AT',
    name: 'Austria',
    flag: '🇦🇹',
    colors: ['#ED2939', '#FFFFFF'],
    motto: 'Austria Est Apis Mundi',
  },
  BE: {
    code: 'BE',
    name: 'Belgium',
    flag: '🇧🇪',
    colors: ['#000000', '#FDDA24'],
    motto: "L'Union Fait La Ruche",
  },
  PT: {
    code: 'PT',
    name: 'Portugal',
    flag: '🇵🇹',
    colors: ['#006600', '#FF0000'],
    motto: 'Esta É A Minha Colmeia',
  },
  AR: {
    code: 'AR',
    name: 'Argentina',
    flag: '🇦🇷',
    colors: ['#74ACDF', '#FFFFFF'],
    motto: 'En Union y Libertad de Abejas',
  },
  CL: {
    code: 'CL',
    name: 'Chile',
    flag: '🇨🇱',
    colors: ['#0039A6', '#D52B1E'],
    motto: 'Por La Razón o La Colmena',
  },
  CO: {
    code: 'CO',
    name: 'Colombia',
    flag: '🇨🇴',
    colors: ['#FCD116', '#003893'],
    motto: 'Libertad y Orden de Abejas',
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    flag: '🇿🇦',
    colors: ['#007749', '#FFB81C'],
    motto: 'Unity in Diversity, Strength in Swarm',
  },
  EG: {
    code: 'EG',
    name: 'Egypt',
    flag: '🇪🇬',
    colors: ['#CE1126', '#000000'],
    motto: "Pharaoh's Hive",
  },
  NG: {
    code: 'NG',
    name: 'Nigeria',
    flag: '🇳🇬',
    colors: ['#008751', '#FFFFFF'],
    motto: 'Unity and Faith in the Swarm',
  },
  KE: {
    code: 'KE',
    name: 'Kenya',
    flag: '🇰🇪',
    colors: ['#006600', '#BB0000'],
    motto: 'Harambee Hive',
  },
  AE: {
    code: 'AE',
    name: 'UAE',
    flag: '🇦🇪',
    colors: ['#00732F', '#FF0000'],
    motto: 'Bee Bold, Bee Dubai',
  },
  SA: {
    code: 'SA',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    colors: ['#006C35', '#FFFFFF'],
    motto: 'Kingdom of the Hive',
  },
  TH: {
    code: 'TH',
    name: 'Thailand',
    flag: '🇹🇭',
    colors: ['#A51931', '#2D2A4A'],
    motto: 'ผึ้งไทยไม่แพ้ใคร',
  },
  VN: {
    code: 'VN',
    name: 'Vietnam',
    flag: '🇻🇳',
    colors: ['#DA251D', '#FFFF00'],
    motto: 'Độc Lập - Tự Do - Ong',
  },
  PH: {
    code: 'PH',
    name: 'Philippines',
    flag: '🇵🇭',
    colors: ['#0038A8', '#CE1126'],
    motto: 'Maka-Bee, Maka-Tao',
  },
  ID: {
    code: 'ID',
    name: 'Indonesia',
    flag: '🇮🇩',
    colors: ['#FF0000', '#FFFFFF'],
    motto: 'Bhinneka Tunggal Lebah',
  },
  MY: {
    code: 'MY',
    name: 'Malaysia',
    flag: '🇲🇾',
    colors: ['#010066', '#CC0001'],
    motto: 'Malaysia Boleh Lebah',
  },
  TW: { code: 'TW', name: 'Taiwan', flag: '🇹🇼', colors: ['#FE0000', '#000095'], motto: '蜂島之光' },
  HK: {
    code: 'HK',
    name: 'Hong Kong',
    flag: '🇭🇰',
    colors: ['#DE2910', '#FFFFFF'],
    motto: "Asia's World Hive",
  },
  IE: {
    code: 'IE',
    name: 'Ireland',
    flag: '🇮🇪',
    colors: ['#169B62', '#FF883E'],
    motto: 'Éire go Deo na mBeach',
  },
  CZ: {
    code: 'CZ',
    name: 'Czechia',
    flag: '🇨🇿',
    colors: ['#11457E', '#D7141A'],
    motto: 'Pravda Včel Vítězí',
  },
  RO: {
    code: 'RO',
    name: 'Romania',
    flag: '🇷🇴',
    colors: ['#002B7F', '#FCD116'],
    motto: 'Patria și Stupul',
  },
};

/**
 * National affiliation for a bee - like a Jaeger pilot's nation
 */
export interface BeeNationalAffiliation {
  countryCode: BeehavenCountryCode;
  joinedAt: number; // When bee joined this nation
  nationalRank?: number; // Rank within country
  contributionScore: number; // Points contributed to national leaderboard
  titles: string[]; // e.g., ['National Champion 2026', 'Top Coder']
}

/**
 * National leaderboard entry
 */
export interface NationalLeaderboardEntry {
  countryCode: BeehavenCountryCode;
  totalIntelligence: number; // Sum of all bees' intelligence
  activeBees: number; // Number of active bees
  averageIntelligence: number; // Average score
  challengesWon: number; // National challenge victories
  topBeeId?: string; // User ID of top performer
  topBeeName?: string; // Name of top bee
  rank: number; // Global rank
  previousRank?: number; // For showing movement
  lastUpdated: number;
}

/**
 * Global BEEHAVEN rankings
 */
export interface BeehavenGlobalStats {
  totalBees: number;
  totalNations: number;
  totalChallengesCompleted: number;
  topNation: BeehavenCountryCode;
  lastGlobalUpdate: number;
}

// =============================================================
// BEEHAVEN - Challenge & Benchmark System
// =============================================================

/**
 * Types of competitive challenges bees can participate in
 */
export type BeehavenChallengeType =
  | 'speed-coding' // Fastest to complete coding task
  | 'accuracy-test' // Most accurate responses
  | 'creativity-battle' // Best creative output (judged)
  | 'knowledge-quiz' // Domain knowledge trivia
  | 'pattern-recognition' // Spot patterns in data
  | 'optimization' // Optimize given code/solution
  | 'debugging' // Find and fix bugs fastest
  | 'memory-recall' // Recall learned information
  | 'synthesis' // Combine concepts creatively
  | 'endurance'; // Long-running multi-task challenge

/**
 * Difficulty tiers for challenges - like Kaiju categories
 */
export type ChallengeTier =
  | 'category-1' // Beginner - Entry level
  | 'category-2' // Intermediate
  | 'category-3' // Advanced
  | 'category-4' // Expert - Elite challenges
  | 'category-5'; // Legendary - World-class difficulty

/**
 * Challenge status lifecycle
 */
export type ChallengeStatus =
  | 'upcoming' // Scheduled but not started
  | 'active' // Currently running
  | 'judging' // Submissions closed, being evaluated
  | 'completed' // Finished with results
  | 'cancelled'; // Challenge was cancelled

/**
 * A competitive challenge/benchmark definition
 */
export interface BeehavenChallenge {
  id: string;
  name: string;
  description: string;
  type: BeehavenChallengeType;
  tier: ChallengeTier;
  status: ChallengeStatus;

  // Timing
  startsAt: number;
  endsAt: number;
  duration: number; // In minutes

  // Requirements
  minIntelligence?: number; // Minimum score to participate
  maxParticipants?: number; // Cap on entries
  allowedCountries?: BeehavenCountryCode[]; // Regional challenges

  // Rewards
  prizePool: {
    first: number; // Intelligence points
    second: number;
    third: number;
    participation: number;
  };
  skinReward?: string; // Special skin for winners
  titleReward?: string; // Title like "Speed Demon 2026"

  // Challenge content
  prompt: string; // The actual challenge prompt
  testCases?: string[]; // For coding challenges
  expectedFormat?: string; // Expected response format

  // Metadata
  createdBy: 'system' | 'community';
  sponsoredBy?: string; // Corporate sponsor
  viewCount: number;
  participantCount: number;
}

/**
 * A bee's submission to a challenge
 */
export interface ChallengeSubmission {
  id: string;
  challengeId: string;
  beeId: string; // User ID
  beeName: string;
  countryCode?: BeehavenCountryCode;

  // Submission
  submittedAt: number;
  response: string; // The bee's answer/solution
  executionTime?: number; // How long it took (ms)

  // Scoring
  score: number; // 0-100
  rank?: number; // Position in challenge
  breakdown?: {
    accuracy: number;
    speed: number;
    creativity?: number;
    efficiency?: number;
  };

  // Rewards earned
  intelligenceEarned: number;
  titleEarned?: string;
  skinEarned?: string;
}

/**
 * Challenge leaderboard entry
 */
export interface ChallengeLeaderboardEntry {
  rank: number;
  beeId: string;
  beeName: string;
  countryCode?: BeehavenCountryCode;
  score: number;
  executionTime?: number;
  submittedAt: number;
}

/**
 * Tournament bracket for elimination-style bee battles
 */
export interface BeehavenTournament {
  id: string;
  name: string;
  description: string;
  type: 'single-elimination' | 'double-elimination' | 'round-robin' | 'swiss';
  tier: ChallengeTier;
  status: ChallengeStatus;

  // Structure
  rounds: TournamentRound[];
  maxParticipants: number;
  currentRound: number;

  // Timing
  registrationOpens: number;
  registrationCloses: number;
  startsAt: number;
  endsAt?: number;

  // Prizes
  prizePool: {
    champion: number;
    finalist: number;
    semifinalist: number;
    participant: number;
  };
  championSkin?: string;
  championTitle: string; // e.g., "World Champion 2026"

  // Participants
  registeredBees: string[]; // User IDs
  participantCount: number;
}

export interface TournamentRound {
  roundNumber: number;
  name: string; // e.g., "Quarterfinals", "Grand Final"
  matches: TournamentMatch[];
  startsAt: number;
  endsAt?: number;
  isComplete: boolean;
}

export interface TournamentMatch {
  id: string;
  roundNumber: number;
  matchNumber: number;

  // Competitors
  bee1Id?: string;
  bee1Name?: string;
  bee1Country?: BeehavenCountryCode;
  bee2Id?: string;
  bee2Name?: string;
  bee2Country?: BeehavenCountryCode;

  // Result
  winnerId?: string;
  bee1Score?: number;
  bee2Score?: number;
  isComplete: boolean;
  replayUrl?: string; // Watch the match
}

/**
 * Daily/Weekly automated challenges
 */
export interface RecurringChallenge {
  id: string;
  name: string;
  type: BeehavenChallengeType;
  tier: ChallengeTier;
  frequency: 'daily' | 'weekly' | 'monthly';

  // Timing
  activeDay?: number; // 0-6 for weekly, 1-31 for monthly
  activeHour: number; // UTC hour
  durationMinutes: number;

  // Current instance
  currentInstanceId?: string;
  nextInstanceAt: number;

  // Stats
  totalCompletions: number;
  averageScore: number;
  recordScore: number;
  recordHolderBeeId?: string;
  recordHolderBeeName?: string;
}

/**
 * Bee's competitive history
 */
export interface BeeCompetitiveStats {
  // Overall
  totalChallengesEntered: number;
  totalChallengesCompleted: number;
  challengeWins: number;
  challengePodiums: number; // Top 3 finishes

  // Rankings
  globalRank?: number;
  nationalRank?: number;
  peakGlobalRank?: number;
  peakNationalRank?: number;

  // Tournaments
  tournamentsEntered: number;
  tournamentWins: number;
  tournamentFinals: number;

  // By type
  statsByType: Partial<
    Record<
      BeehavenChallengeType,
      {
        entered: number;
        completed: number;
        wins: number;
        averageScore: number;
        bestScore: number;
      }
    >
  >;

  // Titles and achievements
  titles: string[];
  lastCompetedAt?: number;
}

/**
 * Calculate competitive ELO-style rating
 */
export function calculateCompetitiveRating(stats: BeeCompetitiveStats): number {
  const baseRating = 1000;
  const winBonus = stats.challengeWins * 25;
  const podiumBonus = stats.challengePodiums * 10;
  const tournamentWinBonus = stats.tournamentWins * 100;
  const tournamentFinalBonus = stats.tournamentFinals * 30;
  const participationBonus = Math.min(stats.totalChallengesCompleted * 2, 200);

  return Math.round(
    baseRating +
      winBonus +
      podiumBonus +
      tournamentWinBonus +
      tournamentFinalBonus +
      participationBonus
  );
}

// =============================================================
// BEEHAVEN - Skin & Cosmetic Ecosystem (League of Legends Style)
// =============================================================

/**
 * Skin rarity tiers - like LoL's skin system
 */
export type SkinRarity =
  | 'common' // Basic recolors - 520 honey
  | 'uncommon' // Simple new model - 750 honey
  | 'rare' // New model + particles - 975 honey
  | 'epic' // New model + particles + recall - 1350 honey
  | 'legendary' // Full reimagining + new VO - 1820 honey
  | 'ultimate' // Multiple forms, evolving - 3250 honey
  | 'mythic' // Prestige/Hextech exclusive
  | 'limited'; // Event-only, never returning

/**
 * Skin theme categories
 */
export type SkinTheme =
  // National & Regional
  | 'national' // Country-specific skins (🇺🇸 USA Bee, 🇯🇵 Sakura Bee)
  | 'world-championship' // Championship skins for tournament winners

  // Seasonal
  | 'lunar-new-year' // Chinese New Year
  | 'halloween' // Spooky/Horror theme
  | 'winter-wonder' // Christmas/Holiday
  | 'spring-festival' // Cherry blossoms, renewal
  | 'summer-games' // Beach/Pool party

  // Fantasy & Sci-Fi
  | 'mecha' // Giant robot Jaegers style
  | 'cyber-punk' // Neon, tech augmented
  | 'steampunk' // Victorian machinery
  | 'dark-star' // Cosmic horror
  | 'arcade' // 8-bit retro gaming
  | 'battle-academia' // Anime school style
  | 'spirit-blossom' // Ethereal spirits

  // Prestige Lines
  | 'hextech' // Crafted masterpieces
  | 'prestige' // Golden limited editions
  | 'crystalis' // Crystal/gem encrusted

  // Collaborations
  | 'collab-anime' // Anime crossovers
  | 'collab-gaming' // Game crossovers
  | 'collab-music' // Music artist collabs
  | 'collab-brand'; // Brand partnerships

/**
 * A skin definition
 */
export interface BeeSkin {
  id: string;
  name: string;
  description: string;
  rarity: SkinRarity;
  theme: SkinTheme;

  // Visual elements
  baseColor: string; // Primary hex color
  accentColor: string; // Secondary hex color
  gradientColors?: string[]; // For gradient effects

  // Assets (URLs or asset keys)
  iconUrl: string;
  previewUrl: string;
  splashArtUrl?: string; // Full splash art
  modelUrl?: string; // 3D model if applicable

  // Effects
  effects: SkinEffects;

  // Chromas (color variants)
  chromas?: SkinChroma[];
  hasPrestigeEdition?: boolean;

  // Acquisition
  price?: number; // In honey (0 = not purchasable)
  acquisitionMethod: SkinAcquisitionMethod;
  availableFrom?: number; // Timestamp when available
  availableUntil?: number; // Timestamp when unavailable (limited)

  // Requirements
  requiredIntelligence?: number;
  requiredRank?: number;
  requiredCountry?: BeehavenCountryCode;
  requiredAchievement?: string;

  // Stats
  ownersCount: number;
  releaseDate: number;
  isLegacy: boolean; // No longer obtainable
  collection?: string; // Part of a set
}

/**
 * Visual effects for a skin
 */
export interface SkinEffects {
  // Particle effects
  hasCustomParticles: boolean;
  particleColor?: string;
  trailEffect?: 'none' | 'sparkle' | 'fire' | 'ice' | 'lightning' | 'rainbow' | 'cosmic';

  // Animations
  hasCustomIdleAnimation: boolean;
  hasCustomThinkingAnimation: boolean;
  hasCustomVictoryAnimation: boolean;
  hasCustomDefeatAnimation: boolean;

  // Audio
  hasCustomSounds: boolean;
  hasCustomVoicelines: boolean;

  // Special
  hasEvolvingForm: boolean; // Changes based on performance
  formCount?: number; // Number of forms (Ultimate skins)
  hasAura: boolean; // Glowing effect around bee
  auraColor?: string;
}

/**
 * Chroma - color variant of a skin
 */
export interface SkinChroma {
  id: string;
  name: string; // e.g., "Ruby", "Sapphire", "Emerald"
  baseColor: string;
  accentColor: string;
  price: number; // Usually 290 honey
  isBundle?: boolean; // Part of chroma bundle
  isExclusive?: boolean; // Limited availability
}

/**
 * How a skin can be obtained
 */
export type SkinAcquisitionMethod =
  | 'purchase' // Direct purchase with honey
  | 'challenge-reward' // Win specific challenges
  | 'tournament-prize' // Tournament placement
  | 'battle-pass' // Seasonal battle pass
  | 'crafting' // Hextech crafting
  | 'prestige-shop' // Prestige points
  | 'mythic-shop' // Mythic essence
  | 'event-tokens' // Event currency
  | 'national-pride' // Contribute to national rankings
  | 'achievement' // Complete specific achievement
  | 'gift' // Gifted from another user
  | 'promotional'; // Special promotions/codes

/**
 * Skin collection/set
 */
export interface SkinCollection {
  id: string;
  name: string; // e.g., "Dark Star", "Mecha Kingdoms"
  description: string;
  theme: SkinTheme;
  skins: string[]; // Skin IDs in collection
  releaseYear: number;

  // Bonuses for owning collection
  collectionBonus?: {
    type: 'intelligence' | 'honey' | 'xp';
    amount: number;
    description: string;
  };

  // Visual
  splashArtUrl?: string;
  iconUrl: string;
}

/**
 * User's skin inventory
 */
export interface BeeSkinInventory {
  ownedSkins: string[]; // Skin IDs
  ownedChromas: string[]; // Chroma IDs (format: "skinId:chromaId")
  equippedSkin?: string; // Currently equipped skin ID
  equippedChroma?: string; // Currently equipped chroma ID

  // Favorites
  favoriteSkins: string[];

  // Stats
  totalSkinsOwned: number;
  totalChromasOwned: number;
  rariestSkin?: SkinRarity;
  collectionsCompleted: string[];

  // Crafting materials
  honeyBalance: number;
  mythicEssence: number;
  prestigePoints: number;
  eventTokens: Record<string, number>; // eventId -> token count
}

/**
 * Battle Pass for seasonal content
 */
export interface BeehavenBattlePass {
  id: string;
  name: string; // e.g., "Season 1: Rise of the Hive"
  description: string;
  season: number;

  // Timing
  startsAt: number;
  endsAt: number;
  durationDays: number;

  // Tiers
  maxTier: number; // Usually 100
  rewards: BattlePassReward[];
  premiumPrice: number; // Cost to upgrade to premium

  // Prestige skin
  prestigeSkinId?: string;
  prestigeTierRequired: number; // Usually 100+

  // Stats
  activePlayers: number;
}

export interface BattlePassReward {
  tier: number;
  isFree: boolean; // Available without premium
  type:
    | 'skin'
    | 'chroma'
    | 'honey'
    | 'mythic-essence'
    | 'prestige-points'
    | 'title'
    | 'icon'
    | 'xp-boost';
  itemId?: string; // For skin/chroma rewards
  amount?: number; // For currency rewards
  name: string;
  iconUrl: string;
}

/**
 * User's battle pass progress
 */
export interface UserBattlePassProgress {
  passId: string;
  isPremium: boolean;
  currentTier: number;
  currentXp: number;
  xpToNextTier: number;
  claimedRewards: number[]; // Tier numbers claimed
  completedAt?: number; // When hit max tier
}

// =============================================================
// BEEHAVEN - Featured Skin Lines (Preset Collections)
// =============================================================

/**
 * Preset skin collections for BEEHAVEN
 */
export const BEEHAVEN_SKIN_LINES: SkinCollection[] = [
  {
    id: 'mecha-jaeger',
    name: 'Mecha Jaeger',
    description: 'Giant mechanical bees built to defend humanity. Pacific Rim inspired.',
    theme: 'mecha',
    skins: ['mecha-striker', 'mecha-guardian', 'mecha-berserker', 'mecha-phantom'],
    releaseYear: 2026,
    iconUrl: '/skins/mecha/icon.png',
    collectionBonus: {
      type: 'intelligence',
      amount: 50,
      description: '+50 Intelligence for owning all Mecha Jaeger skins',
    },
  },
  {
    id: 'world-champions-2026',
    name: 'World Champions 2026',
    description: 'Exclusive skins celebrating the 2026 World Championship winners.',
    theme: 'world-championship',
    skins: ['champion-striker-2026', 'champion-support-2026'],
    releaseYear: 2026,
    iconUrl: '/skins/championship/2026/icon.png',
  },
  {
    id: 'dark-star',
    name: 'Dark Star',
    description: 'Corrupted by the void between stars. Cosmic horror entities.',
    theme: 'dark-star',
    skins: ['dark-star-queen', 'dark-star-drone', 'dark-star-corrupted'],
    releaseYear: 2026,
    iconUrl: '/skins/darkstar/icon.png',
  },
  {
    id: 'arcade-legends',
    name: 'Arcade Legends',
    description: '8-bit retro gaming aesthetic. Press start to play.',
    theme: 'arcade',
    skins: ['arcade-hero', 'arcade-boss', 'arcade-pixel', 'arcade-final-boss'],
    releaseYear: 2026,
    iconUrl: '/skins/arcade/icon.png',
  },
  {
    id: 'spirit-blossom',
    name: 'Spirit Blossom',
    description: 'Ethereal spirits from the realm between life and death.',
    theme: 'spirit-blossom',
    skins: ['spirit-blossom-kindred', 'spirit-blossom-eternal', 'spirit-blossom-ahri'],
    releaseYear: 2026,
    iconUrl: '/skins/spiritblossom/icon.png',
  },
  {
    id: 'battle-academia',
    name: 'Battle Academia',
    description: 'Students at the prestigious Beehaven Academy. Anime school style.',
    theme: 'battle-academia',
    skins: ['academia-prodigy', 'academia-valedictorian', 'academia-rebel', 'academia-professor'],
    releaseYear: 2026,
    iconUrl: '/skins/academia/icon.png',
  },
  {
    id: 'hextech',
    name: 'Hextech',
    description: 'Masterfully crafted with rare hextech crystals. Prestige collection.',
    theme: 'hextech',
    skins: ['hextech-automaton', 'hextech-sentinel'],
    releaseYear: 2026,
    iconUrl: '/skins/hextech/icon.png',
  },
];

/**
 * National pride skins - one per country
 */
export const NATIONAL_SKINS: Record<BeehavenCountryCode, Partial<BeeSkin>> = {
  US: {
    id: 'national-us',
    name: 'Stars & Stripes Bee',
    baseColor: '#3C3B6E',
    accentColor: '#B22234',
  },
  CN: {
    id: 'national-cn',
    name: 'Golden Dragon Bee',
    baseColor: '#DE2910',
    accentColor: '#FFDE00',
  },
  JP: {
    id: 'national-jp',
    name: 'Sakura Samurai Bee',
    baseColor: '#BC002D',
    accentColor: '#FADADD',
  },
  KR: { id: 'national-kr', name: 'K-Pop Star Bee', baseColor: '#0047A0', accentColor: '#C60C30' },
  DE: {
    id: 'national-de',
    name: 'Precision Engineer Bee',
    baseColor: '#000000',
    accentColor: '#FFCC00',
  },
  GB: { id: 'national-gb', name: 'Royal Guard Bee', baseColor: '#012169', accentColor: '#C8102E' },
  FR: {
    id: 'national-fr',
    name: 'Parisian Artiste Bee',
    baseColor: '#0055A4',
    accentColor: '#EF4135',
  },
  IN: {
    id: 'national-in',
    name: 'Bollywood Star Bee',
    baseColor: '#FF9933',
    accentColor: '#138808',
  },
  BR: {
    id: 'national-br',
    name: 'Samba Carnival Bee',
    baseColor: '#009739',
    accentColor: '#FEDD00',
  },
  RU: { id: 'national-ru', name: 'Winter Bear Bee', baseColor: '#0039A6', accentColor: '#D52B1E' },
  CA: {
    id: 'national-ca',
    name: 'Maple Mountie Bee',
    baseColor: '#FF0000',
    accentColor: '#FFFFFF',
  },
  AU: {
    id: 'national-au',
    name: 'Outback Explorer Bee',
    baseColor: '#00008B',
    accentColor: '#FFD700',
  },
  IT: {
    id: 'national-it',
    name: 'Renaissance Maestro Bee',
    baseColor: '#009246',
    accentColor: '#CE2B37',
  },
  ES: {
    id: 'national-es',
    name: 'Flamenco Matador Bee',
    baseColor: '#AA151B',
    accentColor: '#F1BF00',
  },
  MX: {
    id: 'national-mx',
    name: 'Día de los Muertos Bee',
    baseColor: '#006847',
    accentColor: '#CE1126',
  },
  NL: {
    id: 'national-nl',
    name: 'Tulip Windmill Bee',
    baseColor: '#21468B',
    accentColor: '#FF6600',
  },
  SE: { id: 'national-se', name: 'Viking Frost Bee', baseColor: '#006AA7', accentColor: '#FECC00' },
  NO: {
    id: 'national-no',
    name: 'Aurora Borealis Bee',
    baseColor: '#BA0C2F',
    accentColor: '#00205B',
  },
  FI: {
    id: 'national-fi',
    name: 'Sauna Warrior Bee',
    baseColor: '#003580',
    accentColor: '#FFFFFF',
  },
  DK: { id: 'national-dk', name: 'LEGO Builder Bee', baseColor: '#C60C30', accentColor: '#FFFFFF' },
  PL: {
    id: 'national-pl',
    name: 'Hussar Knight Bee',
    baseColor: '#DC143C',
    accentColor: '#FFFFFF',
  },
  UA: {
    id: 'national-ua',
    name: 'Sunflower Guardian Bee',
    baseColor: '#005BBB',
    accentColor: '#FFD500',
  },
  IL: {
    id: 'national-il',
    name: 'Star of David Bee',
    baseColor: '#0038B8',
    accentColor: '#FFFFFF',
  },
  SG: { id: 'national-sg', name: 'Merlion Tech Bee', baseColor: '#EF3340', accentColor: '#FFFFFF' },
  NZ: { id: 'national-nz', name: 'Silver Fern Bee', baseColor: '#00247D', accentColor: '#CC142B' },
  CH: {
    id: 'national-ch',
    name: 'Alpine Precision Bee',
    baseColor: '#FF0000',
    accentColor: '#FFFFFF',
  },
  AT: {
    id: 'national-at',
    name: 'Waltz Composer Bee',
    baseColor: '#ED2939',
    accentColor: '#FFFFFF',
  },
  BE: {
    id: 'national-be',
    name: 'Chocolate Artisan Bee',
    baseColor: '#000000',
    accentColor: '#FDDA24',
  },
  PT: {
    id: 'national-pt',
    name: 'Navigator Explorer Bee',
    baseColor: '#006600',
    accentColor: '#FF0000',
  },
  AR: {
    id: 'national-ar',
    name: 'Tango Maestro Bee',
    baseColor: '#74ACDF',
    accentColor: '#FFFFFF',
  },
  CL: { id: 'national-cl', name: 'Andes Condor Bee', baseColor: '#0039A6', accentColor: '#D52B1E' },
  CO: { id: 'national-co', name: 'Coffee Bean Bee', baseColor: '#FCD116', accentColor: '#003893' },
  ZA: {
    id: 'national-za',
    name: 'Rainbow Nation Bee',
    baseColor: '#007749',
    accentColor: '#FFB81C',
  },
  EG: {
    id: 'national-eg',
    name: 'Pharaoh Guardian Bee',
    baseColor: '#CE1126',
    accentColor: '#C09300',
  },
  NG: {
    id: 'national-ng',
    name: 'Nollywood Star Bee',
    baseColor: '#008751',
    accentColor: '#FFFFFF',
  },
  KE: {
    id: 'national-ke',
    name: 'Safari Runner Bee',
    baseColor: '#006600',
    accentColor: '#BB0000',
  },
  AE: { id: 'national-ae', name: 'Dubai Luxe Bee', baseColor: '#00732F', accentColor: '#C09300' },
  SA: {
    id: 'national-sa',
    name: 'Desert Prince Bee',
    baseColor: '#006C35',
    accentColor: '#FFFFFF',
  },
  TH: {
    id: 'national-th',
    name: 'Golden Temple Bee',
    baseColor: '#A51931',
    accentColor: '#F4D03F',
  },
  VN: { id: 'national-vn', name: 'Dragon Pearl Bee', baseColor: '#DA251D', accentColor: '#FFFF00' },
  PH: {
    id: 'national-ph',
    name: 'Jeepney Festival Bee',
    baseColor: '#0038A8',
    accentColor: '#CE1126',
  },
  ID: {
    id: 'national-id',
    name: 'Batik Warrior Bee',
    baseColor: '#FF0000',
    accentColor: '#FFFFFF',
  },
  MY: {
    id: 'national-my',
    name: 'Petronas Twin Bee',
    baseColor: '#010066',
    accentColor: '#CC0001',
  },
  TW: { id: 'national-tw', name: 'Night Market Bee', baseColor: '#FE0000', accentColor: '#000095' },
  HK: { id: 'national-hk', name: 'Neon City Bee', baseColor: '#DE2910', accentColor: '#FF00FF' },
  IE: {
    id: 'national-ie',
    name: 'Celtic Shamrock Bee',
    baseColor: '#169B62',
    accentColor: '#FF883E',
  },
  CZ: {
    id: 'national-cz',
    name: 'Bohemian Crystal Bee',
    baseColor: '#11457E',
    accentColor: '#D7141A',
  },
  RO: {
    id: 'national-ro',
    name: 'Transylvania Guardian Bee',
    baseColor: '#002B7F',
    accentColor: '#FCD116',
  },
};
