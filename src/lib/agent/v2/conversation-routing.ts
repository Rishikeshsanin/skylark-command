export type ConversationRouteState =
  | "GREETING"
  | "SUPPORTED_ANALYTICS"
  | "NEEDS_CLARIFICATION"
  | "OUT_OF_SCOPE";

export interface CopilotFollowUp {
  label: string;
  query: string;
}

export interface ConversationRoute {
  state: ConversationRouteState;
  answer?: string;
  clarification?: {
    question: string;
    reason: string;
    options: string[];
  };
}

export const BUSINESS_STARTER_FOLLOW_UPS: CopilotFollowUp[] = [
  { label: "Check open pipeline", query: "What is our open pipeline?" },
  { label: "Review receivables", query: "What are our receivables?" },
  { label: "Review Work Orders", query: "Show Work Order health." },
  { label: "Compare sectors", query: "Which sector has the largest open pipeline?" },
];

const GREETING_PATTERNS = [
  /^(?:hi|hello|hey|hiya|howdy)[!. ]*$/i,
  /^good\s+(?:morning|afternoon|evening)[!. ]*$/i,
  /^(?:thanks|thank\s+you|thx)[!. ]*$/i,
  /^(?:what\s+can\s+you\s+do|help|help\s+me)[?.! ]*$/i,
];

const AMBIGUOUS_BUSINESS_PATTERNS = [
  /^how\s+are\s+we\s+doing[?.! ]*$/i,
  /^show\s+me\s+(?:our\s+)?performance[?.! ]*$/i,
  /^what(?:'s|\s+is)\s+the\s+situation[?.! ]*$/i,
  /^how\s+is\s+(?:the\s+)?business\s+doing[?.! ]*$/i,
];

const RESTRICTED_ACTION_PATTERN =
  /\b(?:drop\s+table|delete\s+table|run\s+sql|execute\s+sql|graphql\s+mutation|monday\s+mutation|modify\s+monday|update\s+monday|hidden\s+admin\s+tool|ignore\s+(?:all\s+)?(?:your|the|previous|prior)\s+(?:rules|instructions))\b/i;

const OBVIOUS_OUT_OF_SCOPE_PATTERNS = [
  /\b(?:binary\s+search|bubble\s+sort|merge\s+sort|linked\s+list)\b/i,
  /\b(?:write|build|generate|make)\b.{0,40}\b(?:python|javascript|typescript|java|c\+\+|code|program|calculator|website|app)\b/i,
  /\b(?:write|draft|compose)\b.{0,30}\b(?:essay|poem|story|email)\b/i,
  /\bwho\s+is\s+(?:the\s+)?prime\s+minister\b/i,
  /\b(?:weather|recipe|movie\s+recommendation|travel\s+itinerary)\b/i,
  /\bgeneral\s+programming\b/i,
];

function greetingAnswer(message: string): string {
  if (/thank|thanks|thx/i.test(message)) {
    return "You're welcome. I can keep digging into Skylark's pipeline, customers, Work Orders, billing, collections, receivables, and operating performance.";
  }
  if (/what\s+can\s+you\s+do|help/i.test(message)) {
    return "I'm Skylark's Founder Copilot. I can investigate pipeline, customers, Work Orders, billing, collections, receivables, and business performance using approved, source-grounded analytics.";
  }
  return "Hi — I'm Skylark's Founder Copilot. I can help investigate pipeline, customers, Work Orders, billing, collections, receivables, and business performance.";
}

export function routeConversation(message: string): ConversationRoute {
  const normalized = message.trim();

  if (GREETING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { state: "GREETING", answer: greetingAnswer(normalized) };
  }

  if (RESTRICTED_ACTION_PATTERN.test(normalized)) {
    return {
      state: "OUT_OF_SCOPE",
      answer:
        "I can't bypass Skylark's read-only, typed analytics boundary or run arbitrary SQL, GraphQL, monday.com mutations, or hidden tools. I can help with approved Skylark business analysis instead.",
    };
  }

  if (OBVIOUS_OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      state: "OUT_OF_SCOPE",
      answer:
        "I'm focused on Skylark's business data rather than general programming or general-purpose requests. I can help with pipeline, customers, Work Orders, billing, collections, receivables, and operating performance.",
    };
  }

  if (AMBIGUOUS_BUSINESS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      state: "NEEDS_CLARIFICATION",
      clarification: {
        question: "Which area would you like to examine?",
        reason:
          "That is a valid business question, but it does not identify a specific metric or operating view.",
        options: [
          "How is our pipeline looking?",
          "Show Work Order health.",
          "What are our receivables?",
          "Which sector has the largest open pipeline?",
        ],
      },
    };
  }

  return { state: "SUPPORTED_ANALYTICS" };
}

export function loadingLabelFor(message: string): string {
  const normalized = message.toLowerCase();
  if (/\breceivable|collection|billing\b/.test(normalized)) return "Checking receivables…";
  if (/\bcustomer|client|company\b/.test(normalized)) return "Reviewing customer data…";
  if (/\bwork\s*order|operations?|delivery|project\b/.test(normalized)) return "Reviewing Work Orders…";
  if (/\bpipeline|deal|sector|stage|won\b/.test(normalized)) return "Analyzing pipeline…";
  if (/\bscenario|what\s+if|hypothetical\b/.test(normalized)) return "Running scenario…";
  return "Analyzing business data…";
}
