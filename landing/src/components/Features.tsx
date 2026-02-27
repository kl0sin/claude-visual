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
    title: "AGENT PROCESSES",
    desc: "Visualize nested subagent trees as they spawn and complete. Understand exactly which agent is doing what and when.",
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
    desc: "Browse and replay every past Claude Code session stored locally. Filter by date, inspect token usage, costs, and the full event timeline for any completed session.",
  },
];

const TRACK = [...FEATURES, ...FEATURES];

export function Features() {
  return (
    <section className="section" id="features">
      <p className="section-label">// CAPABILITIES</p>
      <h2 className="section-title">WHAT YOU CAN SEE</h2>

      <div className="features-marquee">
        <div className="features-marquee-track">
          {TRACK.map((f, i) => (
            <div
              key={i}
              className="feature-card"
              style={{ "--accent-color": f.color } as React.CSSProperties}
            >
              <span className="feature-icon">{f.icon}</span>
              <p className="feature-title">{f.title}</p>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
