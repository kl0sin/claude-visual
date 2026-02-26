import type { TokenUsage } from "../types";

interface TokenPanelProps {
  tokens: TokenUsage;
}

function formatTokenCount(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function estimateCost(tokens: TokenUsage): string {
  // Claude Opus 4 pricing
  const inputCost = (tokens.inputTokens / 1_000_000) * 15;           // $15/MTok
  const outputCost = (tokens.outputTokens / 1_000_000) * 75;         // $75/MTok
  const cacheWriteCost = (tokens.cacheCreationTokens / 1_000_000) * 18.75; // $18.75/MTok (1.25x input)
  const cacheReadCost = (tokens.cacheReadTokens / 1_000_000) * 1.5;  // $1.50/MTok (0.1x input)
  const total = inputCost + outputCost + cacheWriteCost + cacheReadCost;
  if (total < 0.01) return "$0.00";
  return `$${total.toFixed(2)}`;
}

export function TokenPanel({ tokens }: TokenPanelProps) {
  const total = tokens.totalTokens;
  const inputPct = total > 0 ? (tokens.inputTokens / total) * 100 : 0;
  const outputPct = total > 0 ? (tokens.outputTokens / total) * 100 : 0;

  return (
    <div className="panel token-panel">
      <div className="panel-header">
        <span className="panel-icon">◈</span>
        TOKEN CONSUMPTION
      </div>

      <div className="token-total">
        <div className="token-total-value">{formatTokenCount(total)}</div>
        <div className="token-total-label">TOTAL TOKENS</div>
        <div className="token-cost">{estimateCost(tokens)}</div>
      </div>

      <div className="token-bar">
        <div
          className="token-bar-input"
          style={{ width: `${inputPct}%` }}
          title={`Input: ${inputPct.toFixed(1)}%`}
        />
        <div
          className="token-bar-output"
          style={{ width: `${outputPct}%` }}
          title={`Output: ${outputPct.toFixed(1)}%`}
        />
      </div>

      <div className="token-breakdown">
        <div className="token-row">
          <span className="token-dot input" />
          <span className="token-label">INPUT</span>
          <span className="token-dots" />
          <span className="token-value input">{formatTokenCount(tokens.inputTokens)}</span>
        </div>
        <div className="token-row">
          <span className="token-dot output" />
          <span className="token-label">OUTPUT</span>
          <span className="token-dots" />
          <span className="token-value output">{formatTokenCount(tokens.outputTokens)}</span>
        </div>
        {tokens.cacheReadTokens > 0 && (
          <div className="token-row">
            <span className="token-dot cache" />
            <span className="token-label">CACHE READ</span>
            <span className="token-dots" />
            <span className="token-value cache">{formatTokenCount(tokens.cacheReadTokens)}</span>
          </div>
        )}
        {tokens.cacheCreationTokens > 0 && (
          <div className="token-row">
            <span className="token-dot cache" />
            <span className="token-label">CACHE WRITE</span>
            <span className="token-dots" />
            <span className="token-value cache">{formatTokenCount(tokens.cacheCreationTokens)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
