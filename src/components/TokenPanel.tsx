import type { TokenUsage } from "../types";
import { estimateCost, getModelLabel, getPricing, formatCost } from "../../shared/tokens";

interface TokenPanelProps {
  tokens: TokenUsage;
  model?: string;
}

function formatTokenCount(n: number): string {
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function TokenPanel({ tokens, model }: TokenPanelProps) {
  const total = tokens.totalTokens;
  const pricing = getPricing(model);

  // Per-row cost helpers
  const inputCost = formatCost((tokens.inputTokens / 1_000_000) * pricing.input);
  const outputCost = formatCost((tokens.outputTokens / 1_000_000) * pricing.output);
  const cacheRCost = formatCost((tokens.cacheReadTokens / 1_000_000) * pricing.cacheRead);
  const cacheWCost = formatCost((tokens.cacheCreationTokens / 1_000_000) * pricing.cacheWrite);

  // IO bar: input vs output relative to each other
  const ioTotal = tokens.inputTokens + tokens.outputTokens;
  const inputPct = ioTotal > 0 ? (tokens.inputTokens / ioTotal) * 100 : 0;
  const outputPct = ioTotal > 0 ? (tokens.outputTokens / ioTotal) * 100 : 0;

  // Cache bar: read vs write relative to each other
  const cacheTotal = tokens.cacheReadTokens + tokens.cacheCreationTokens;
  const cacheReadPct = cacheTotal > 0 ? (tokens.cacheReadTokens / cacheTotal) * 100 : 0;
  const cacheWritePct = cacheTotal > 0 ? (tokens.cacheCreationTokens / cacheTotal) * 100 : 0;

  return (
    <div className="panel token-panel" role="region" aria-label="Token Consumption">
      <div className="panel-header">
        <span className="panel-icon" aria-hidden="true">
          ◈
        </span>
        TOKEN CONSUMPTION
      </div>

      <div className="token-total">
        <div className="token-total-value">{formatTokenCount(total)}</div>
        <div className="token-total-label">TOTAL TOKENS</div>
        <div className="token-cost">{estimateCost(tokens, model)}</div>
        {model && <div className="token-model">{getModelLabel(model).toUpperCase()}</div>}
      </div>

      <div className="token-bars">
        <div className="token-bar-group">
          <div className="token-bar-label">I/O</div>
          <div className="token-bar">
            <div
              className="token-bar-input"
              style={{ width: `${inputPct}%` }}
              title={`Input: ${formatTokenCount(tokens.inputTokens)} (${inputPct.toFixed(1)}%)`}
            />
            <div
              className="token-bar-output"
              style={{ width: `${outputPct}%` }}
              title={`Output: ${formatTokenCount(tokens.outputTokens)} (${outputPct.toFixed(1)}%)`}
            />
          </div>
        </div>
        {cacheTotal > 0 && (
          <div className="token-bar-group">
            <div className="token-bar-label">CACHE</div>
            <div className="token-bar">
              <div
                className="token-bar-cache"
                style={{ width: `${cacheReadPct}%` }}
                title={`Cache Read: ${formatTokenCount(tokens.cacheReadTokens)} (${cacheReadPct.toFixed(1)}%)`}
              />
              <div
                className="token-bar-cache-write"
                style={{ width: `${cacheWritePct}%` }}
                title={`Cache Write: ${formatTokenCount(tokens.cacheCreationTokens)} (${cacheWritePct.toFixed(1)}%)`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="token-breakdown">
        <div className="token-row">
          <span className="token-dot input" />
          <span className="token-label">INPUT</span>
          <span className="token-dots" />
          <span className="token-row-cost">({inputCost})</span>
          <span className="token-value input">{formatTokenCount(tokens.inputTokens)}</span>
        </div>
        <div className="token-row">
          <span className="token-dot output" />
          <span className="token-label">OUTPUT</span>
          <span className="token-dots" />
          <span className="token-row-cost">({outputCost})</span>
          <span className="token-value output">{formatTokenCount(tokens.outputTokens)}</span>
        </div>
        {tokens.cacheReadTokens > 0 && (
          <div className="token-row">
            <span className="token-dot cache" />
            <span className="token-label">CACHE READ</span>
            <span className="token-dots" />
            <span className="token-row-cost">({cacheRCost})</span>
            <span className="token-value cache">{formatTokenCount(tokens.cacheReadTokens)}</span>
          </div>
        )}
        {tokens.cacheCreationTokens > 0 && (
          <div className="token-row">
            <span className="token-dot cache-write" />
            <span className="token-label">CACHE WRITE</span>
            <span className="token-dots" />
            <span className="token-row-cost">({cacheWCost})</span>
            <span className="token-value cache-write">
              {formatTokenCount(tokens.cacheCreationTokens)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
