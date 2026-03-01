interface Feature {
  icon: string;
  color: string;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    icon: "▹",
    color: "var(--color-cyber-magenta)",
    title: "LIVE EVENT FEED",
    desc: "Every hook event from Claude Code streams in real time — tool calls, subagent spawns, prompts, completions. Nothing is hidden.",
  },
  {
    icon: "◈",
    color: "var(--color-cyber-cyan)",
    title: "TOKEN TRACKING",
    desc: "Input, output, and cache tokens tracked per session and across all agents. Pulled directly from Claude Code transcript files.",
  },
  {
    icon: "$",
    color: "var(--color-cyber-green)",
    title: "COST ESTIMATION",
    desc: "Real-time USD cost estimates based on token usage and model pricing. Know what each session costs before the bill arrives.",
  },
  {
    icon: "▶",
    color: "var(--color-cyber-yellow)",
    title: "AGENT TIMELINE",
    desc: "Live tool action bars with per-tool duration for every active subagent. Scanning animation for running tools, proportional bars for completed ones, red for failures.",
  },
  {
    icon: "⚡",
    color: "var(--color-cyber-purple)",
    title: "TOOL STATISTICS",
    desc: "Aggregate tool call counts, success/failure rates, and timing across sessions. Find which tools Claude reaches for most.",
  },
  {
    icon: "◉",
    color: "var(--color-cyber-orange)",
    title: "MULTI-PLATFORM DESKTOP",
    desc: "Native desktop app via Tauri 2. Runs alongside Claude Code on macOS, Windows, and Linux with zero browser required.",
  },
  {
    icon: "◷",
    color: "var(--color-cyber-purple)",
    title: "SESSION HISTORY BROWSER",
    desc: "Browse every past Claude Code session with virtualized rendering for large transcripts. Full session metadata, token counts, costs, and the complete event timeline.",
  },
  {
    icon: "⌕",
    color: "var(--color-cyber-cyan)",
    title: "FULL-TEXT SEARCH",
    desc: "Grep across all JSONL transcripts in a single query. Matching sessions are listed with highlighted snippets — click to jump directly to the matched message.",
  },
  {
    icon: "◎",
    color: "var(--color-cyber-red)",
    title: "SMART ALERTS",
    desc: "Desktop notifications and in-app toasts for tool failures, permission requests, and session end. Set cost and duration thresholds to get alerted before budgets are exceeded.",
  },
  {
    icon: "▦",
    color: "var(--color-cyber-green)",
    title: "HISTORICAL ANALYTICS",
    desc: "Per-project charts: token and cost trends over 30 days, model breakdown, top tools by usage. Understand how your Claude Code usage evolves over time.",
  },
  {
    icon: "⇄",
    color: "var(--color-cyber-yellow)",
    title: "REMOTE MONITORING",
    desc: "Connect to multiple Claude Visual instances — local or remote. Add servers by URL with optional Bearer token auth and switch between them with one click.",
  },
  {
    icon: "≠",
    color: "var(--color-cyber-magenta)",
    title: "DIFF VIEW",
    desc: "PreToolUse detail for Edit shows a syntax-highlighted side-by-side diff of old_string vs new_string. See exactly what Claude is about to change before it happens.",
  },
];

const ROW1 = FEATURES.slice(0, 6);
const ROW2 = FEATURES.slice(6);

function FeatureCard({ f }: { f: Feature }) {
  return (
    <div
      className="feature-card"
      style={{ "--accent-color": f.color } as React.CSSProperties}
    >
      <span className="feature-icon">{f.icon}</span>
      <p className="feature-title">{f.title}</p>
      <p className="feature-desc">{f.desc}</p>
    </div>
  );
}

export function Features() {
  return (
    <section className="section" id="features">
      <p className="section-label">// CAPABILITIES</p>
      <h2 className="section-title">WHAT YOU CAN SEE</h2>

      <div className="features-marquee-wrap">
        <div className="features-marquee">
          <div className="features-marquee-track">
            {[...ROW1, ...ROW1].map((f, i) => <FeatureCard key={i} f={f} />)}
          </div>
        </div>

        <div className="features-marquee">
          <div className="features-marquee-track features-marquee-track--reverse">
            {[...ROW2, ...ROW2].map((f, i) => <FeatureCard key={i} f={f} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
