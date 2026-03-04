import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MD_COMPONENTS } from "../lib/mdComponents";
import type {
  HistorySession,
  HistorySessionDetail,
  TranscriptContent,
  TranscriptMessage,
  TokenUsage,
  SessionInfo,
} from "../types";
import { estimateCost } from "../../shared/tokens";
import {
  formatTokenCount,
  formatDate,
  shortModel,
  computeDuration,
  groupIntoTurns,
  isProcessMessage,
  isSystemInstruction,
  hasVisibleContent,
  parseInstructionName,
  getFirstText,
  getResultText,
  resultPreview,
  getToolKeyParam,
  type ConversationTurn,
} from "../lib/transcriptUtils";

// ── Tool use block ──────────────────────────────────────────

function ToolUseBlock({ name, input }: { name: string; input: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = useMemo(() => JSON.stringify(input, null, 2), [input]);
  const preview = useMemo(
    () =>
      Object.entries(input)
        .slice(0, 2)
        .map(([k, v]) => {
          const val = typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40);
          return `${k}: ${val}`;
        })
        .join(", "),
    [input],
  );

  return (
    <div className="tool-block">
      <button
        className="tool-block-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="tool-block-icon">⚙</span>
        <span className="tool-block-name">{name}</span>
        {preview && (
          <span className="tool-block-preview" data-tooltip={preview}>
            {preview}
          </span>
        )}
        <span className="tool-block-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && <pre className="tool-block-body">{inputStr}</pre>}
    </div>
  );
}

// ── Tool result block ───────────────────────────────────────

function ToolResultBlock({ content, isError }: { content: unknown; isError?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((c: unknown) =>
              typeof c === "object" && c !== null && "text" in c
                ? (c as { text: string }).text
                : JSON.stringify(c),
            )
            .join("\n")
        : JSON.stringify(content, null, 2);

  const preview = text.slice(0, 80).replace(/\n/g, " ");
  const needsExpand = text.length > 80;

  return (
    <div className={`tool-result-block ${isError ? "error" : ""}`}>
      <button
        className="tool-result-header"
        aria-expanded={needsExpand ? expanded : undefined}
        style={!needsExpand ? { cursor: "default" } : undefined}
        onClick={() => needsExpand && setExpanded((e) => !e)}
      >
        <span className="tool-result-icon">{isError ? "✗" : "✓"}</span>
        <span className="tool-result-preview">
          {preview}
          {needsExpand && !expanded ? "…" : ""}
        </span>
        {needsExpand && <span className="tool-block-chevron">{expanded ? "▲" : "▼"}</span>}
      </button>
      {expanded && <pre className="tool-block-body">{text}</pre>}
    </div>
  );
}

// ── Instruction block ────────────────────────────────────────

function InstructionBlock({ content }: { content: TranscriptContent[] }) {
  const [expanded, setExpanded] = useState(false);
  const text = getFirstText(content);
  const name = parseInstructionName(text);

  if (!hasVisibleContent(text) || !hasVisibleContent(name)) return null;

  return (
    <div className="instruction-block">
      <button
        className="instruction-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="instruction-icon">⬡</span>
        <span className="instruction-label">INSTRUCTION</span>
        <span className="instruction-name">{name}</span>
        <span className="tool-block-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && <pre className="instruction-body">{text}</pre>}
    </div>
  );
}

// ── Token badge with breakdown tooltip ──────────────────────

function TokenBadge({
  tokens,
  className = "msg-tokens",
}: {
  tokens: TokenUsage;
  className?: string;
}) {
  const hasBreakdown =
    tokens.inputTokens > 0 ||
    tokens.outputTokens > 0 ||
    tokens.cacheReadTokens > 0 ||
    tokens.cacheCreationTokens > 0;

  return (
    <span className="token-badge">
      <span className={className}>{formatTokenCount(tokens.totalTokens)} tokens</span>
      {hasBreakdown && (
        <div className="token-tooltip">
          {tokens.inputTokens > 0 && (
            <div className="token-tooltip-row">
              <span className="token-tooltip-label">Input</span>
              <span className="token-tooltip-value">{formatTokenCount(tokens.inputTokens)}</span>
            </div>
          )}
          {tokens.outputTokens > 0 && (
            <div className="token-tooltip-row">
              <span className="token-tooltip-label">Output</span>
              <span className="token-tooltip-value">{formatTokenCount(tokens.outputTokens)}</span>
            </div>
          )}
          {tokens.cacheReadTokens > 0 && (
            <div className="token-tooltip-row">
              <span className="token-tooltip-label">Cache read</span>
              <span className="token-tooltip-value">
                {formatTokenCount(tokens.cacheReadTokens)}
              </span>
            </div>
          )}
          {tokens.cacheCreationTokens > 0 && (
            <div className="token-tooltip-row">
              <span className="token-tooltip-label">Cache write</span>
              <span className="token-tooltip-value">
                {formatTokenCount(tokens.cacheCreationTokens)}
              </span>
            </div>
          )}
          <div className="token-tooltip-row token-tooltip-total">
            <span className="token-tooltip-label">Total</span>
            <span className="token-tooltip-value">{formatTokenCount(tokens.totalTokens)}</span>
          </div>
        </div>
      )}
    </span>
  );
}

// ── Thinking block ───────────────────────────────────────────

function ThinkingBlock({
  thinking,
  redacted,
  label = "THINKING",
}: {
  thinking?: string;
  redacted?: boolean;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = thinking ? thinking.slice(0, 80).replace(/\n/g, " ") : "";
  const isLong = thinking ? thinking.length > 80 : false;

  return (
    <div className="thinking-block">
      <button
        className="thinking-header"
        aria-expanded={redacted ? undefined : expanded}
        onClick={() => !redacted && setExpanded((e) => !e)}
        style={redacted ? { cursor: "default" } : undefined}
      >
        <span className="thinking-icon">◈</span>
        <span className="thinking-label">{label}</span>
        {redacted ? (
          <span className="thinking-preview redacted">redacted</span>
        ) : (
          <span
            className="thinking-preview"
            data-tooltip={!expanded && isLong ? thinking : undefined}
          >
            {!expanded && preview}
            {!expanded && isLong ? "…" : ""}
          </span>
        )}
        {!redacted && <span className="tool-block-chevron">{expanded ? "▲" : "▼"}</span>}
      </button>
      {!redacted && expanded && thinking && (
        <div className="thinking-body md-content">
          <ReactMarkdown components={MD_COMPONENTS} remarkPlugins={[remarkGfm]}>
            {thinking}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// ── Message bubble ──────────────────────────────────────────

/** Renders `text` with all case-insensitive occurrences of `query` wrapped in <mark>. */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="search-highlight">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

const MessageBubble = memo(function MessageBubble({
  role,
  content,
  tokens,
  model,
  highlightQuery,
  duration,
}: {
  role: "user" | "assistant";
  content: TranscriptContent[];
  tokens?: { totalTokens: number } | undefined;
  model?: string;
  highlightQuery?: string;
  duration?: string;
}) {
  if (isSystemInstruction(role, content)) {
    return <InstructionBlock content={content} />;
  }

  const isProcess = isProcessMessage(role, content);

  const textParts = content.filter((c): c is { type: "text"; text: string } => c.type === "text");
  const toolUses = content.filter(
    (
      c,
    ): c is {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    } => c.type === "tool_use",
  );
  const toolResults = content.filter(
    (
      c,
    ): c is {
      type: "tool_result";
      tool_use_id: string;
      content: unknown;
      is_error?: boolean;
    } => c.type === "tool_result",
  );

  const bubbleClass = isProcess ? "process" : role;
  const hasError = toolResults.some((r) => r.is_error);

  return (
    <div className={`msg-bubble ${bubbleClass}`}>
      <div className="msg-meta">
        {isProcess ? (
          <>
            <span className={`msg-role-process ${hasError ? "error" : ""}`}>
              {hasError ? "✗" : "◎"} PROCESS
            </span>
            <span className="msg-process-count">
              {toolResults.length} result{toolResults.length !== 1 ? "s" : ""}
            </span>
          </>
        ) : role === "assistant" ? (
          <>
            <span className="msg-role">CLAUDE</span>
            {model && <span className="msg-model">{shortModel(model)}</span>}
            {tokens && tokens.totalTokens > 0 && (
              <span className="msg-tokens">{formatTokenCount(tokens.totalTokens)} tokens</span>
            )}
            {duration && <span className="turn-duration">{duration}</span>}
          </>
        ) : (
          <span className="msg-role">YOU</span>
        )}
      </div>
      <div className="msg-content">
        {textParts.map((c, i) => (
          <p key={i} className="msg-text">
            {highlightQuery ? <HighlightText text={c.text} query={highlightQuery} /> : c.text}
          </p>
        ))}
        {toolUses.map((c, i) => (
          <ToolUseBlock key={i} name={c.name} input={c.input} />
        ))}
        {toolResults.map((c, i) => (
          <ToolResultBlock key={i} content={c.content} isError={c.is_error} />
        ))}
      </div>
    </div>
  );
});

// ── Step row (expandable) ────────────────────────────────────

function StepRow({ msg, prevTimestamp }: { msg: TranscriptMessage; prevTimestamp?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isProcess = isProcessMessage(msg.role, msg.content);
  const toolUses = msg.content.filter(
    (c): c is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
      c.type === "tool_use",
  );
  const toolResults = msg.content.filter(
    (c): c is { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean } =>
      c.type === "tool_result",
  );
  const textParts = msg.content.filter(
    (c): c is { type: "text"; text: string } => c.type === "text",
  );
  const thinkingParts = msg.content.filter(
    (c): c is { type: "thinking"; thinking: string } => c.type === "thinking",
  );
  const redactedThinking = msg.content.some((c) => c.type === "redacted_thinking");
  const hasThinking = thinkingParts.length > 0 || redactedThinking;
  const hasError = toolResults.some((r) => r.is_error);
  const duration = computeDuration(prevTimestamp, msg.timestamp);
  const hasDetails =
    toolUses.length > 0 || toolResults.length > 0 || textParts.length > 0 || hasThinking;

  // For tool steps: name label and key param shown inline
  const toolLabel =
    toolUses.length === 1 ? (toolUses[0]?.name ?? "") : toolUses.map((t) => t.name).join(" · ");
  const toolParam = toolUses[0] != null ? getToolKeyParam(toolUses[0].name, toolUses[0].input) : "";

  // Inline preview for non-tool steps
  const inlinePreview: string | null = (() => {
    if (isProcess && toolResults[0] != null) {
      return resultPreview(toolResults[0].content) || null;
    }
    if (!isProcess && toolUses.length === 0) {
      const first = thinkingParts[0]?.thinking ?? textParts[0]?.text ?? null;
      return first ? first.slice(0, 80).replace(/\n/g, " ") : null;
    }
    return null;
  })();

  return (
    <div className={`step-row-wrap${hasError ? " error" : ""}`}>
      <button
        className="step-row"
        onClick={() => hasDetails && setExpanded((e) => !e)}
        style={hasDetails ? undefined : { cursor: "default" }}
        aria-expanded={hasDetails ? expanded : undefined}
      >
        {/* Icon + label */}
        {isProcess ? (
          <>
            <span className={`step-icon${hasError ? " error" : " result"}`}>
              {hasError ? "✗" : "✓"}
            </span>
            <span className="step-label">RESULT</span>
          </>
        ) : toolUses.length > 0 ? (
          <>
            <span className="step-icon tool">⚙</span>
            <span className="step-tool-name" data-tooltip={toolLabel}>
              {toolLabel}
            </span>
          </>
        ) : hasThinking ? (
          <>
            <span className="step-icon text">◈</span>
            <span className="step-label">THINKING</span>
          </>
        ) : (
          <>
            <span className="step-icon output">◆</span>
            <span className="step-label">OUTPUT</span>
          </>
        )}

        {/* Key param for tool steps — file name, command, etc. */}
        {toolUses.length > 0 && toolParam && (
          <span className="step-inline-preview" data-tooltip={toolParam}>
            {toolParam}
          </span>
        )}

        {/* Inline preview for result / thinking / output steps */}
        {isProcess && !inlinePreview && (
          <span className="step-detail">
            {toolResults.length} result{toolResults.length !== 1 ? "s" : ""}
            {hasError ? " — error" : ""}
          </span>
        )}
        {inlinePreview && (
          <span className="step-inline-preview" data-tooltip={inlinePreview}>
            {inlinePreview}
          </span>
        )}

        {/* Tokens + duration */}
        {!isProcess && msg.tokens && msg.tokens.totalTokens > 0 && (
          <TokenBadge tokens={msg.tokens} className="step-tokens" />
        )}
        {duration && <span className="step-duration">{duration}</span>}
        {hasDetails && <span className="step-chevron">{expanded ? "▲" : "▼"}</span>}
      </button>

      {expanded && (
        <div className="step-details">
          {/* Thinking directly — no nested block */}
          {thinkingParts.map((c, i) => (
            <div key={i} className="thinking-body md-content">
              <ReactMarkdown components={MD_COMPONENTS} remarkPlugins={[remarkGfm]}>
                {c.thinking}
              </ReactMarkdown>
            </div>
          ))}
          {redactedThinking && <p className="step-redacted-thinking">◈ thinking redacted</p>}
          {/* Tool input directly — no ToolUseBlock wrapper, no extra click needed */}
          {toolUses.map((c, i) => (
            <div key={i} className="step-tool-input">
              {toolUses.length > 1 && <div className="step-tool-input-name">⚙ {c.name}</div>}
              <pre className="tool-block-body">{JSON.stringify(c.input, null, 2)}</pre>
            </div>
          ))}
          {/* Tool results — directly, no nested ToolResultBlock */}
          {toolResults.map((c, i) => (
            <pre key={i} className={`step-result-body${c.is_error ? " error" : ""}`}>
              {getResultText(c.content)}
            </pre>
          ))}
          {/* Plain text — OUTPUT step */}
          {textParts.length > 0 && !hasThinking && toolUses.length === 0 && (
            <div className="step-text-body md-content">
              <ReactMarkdown components={MD_COMPONENTS} remarkPlugins={[remarkGfm]}>
                {textParts.map((c) => c.text).join("\n")}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Turn steps panel (collapsible, embedded in Claude bubble) ─

function TurnStepsPanel({
  steps,
  autoExpand,
}: {
  steps: TranscriptMessage[];
  autoExpand?: boolean;
}) {
  const [expanded, setExpanded] = useState(autoExpand ?? false);

  // Build summary: tool counts, result counts, thinking, output
  const toolCounts = new Map<string, number>();
  let resultOkCount = 0;
  let resultErrCount = 0;
  let thinkingCount = 0;
  let outputCount = 0;

  for (const m of steps) {
    const hasToolUse = m.content.some((c) => c.type === "tool_use");
    const hasThinkingBlock = m.content.some(
      (c) => c.type === "thinking" || c.type === "redacted_thinking",
    );
    const hasText = m.content.some((c) => c.type === "text");
    if (m.role === "assistant" && !hasToolUse && !hasThinkingBlock && hasText) {
      outputCount++;
    }
    for (const c of m.content) {
      if (c.type === "tool_use") {
        toolCounts.set(c.name, (toolCounts.get(c.name) ?? 0) + 1);
      } else if (c.type === "tool_result") {
        if (c.is_error) resultErrCount++;
        else resultOkCount++;
      } else if (c.type === "thinking" || c.type === "redacted_thinking") {
        thinkingCount++;
      }
    }
  }

  const toolEntries = Array.from(toolCounts.entries());
  const hasAnySummary =
    toolEntries.length > 0 ||
    resultOkCount > 0 ||
    resultErrCount > 0 ||
    thinkingCount > 0 ||
    outputCount > 0;

  return (
    <div className="turn-steps">
      <button
        className="turn-steps-toggle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="turn-steps-icon">⚙</span>
        <span className="turn-steps-summary">
          {hasAnySummary ? (
            <>
              {toolEntries.map(([name, count], i) => (
                <span key={name} className="summary-tool">
                  {i > 0 && <span className="summary-sep">·</span>}
                  {name}
                  {count > 1 && <span className="summary-count"> ×{count}</span>}
                </span>
              ))}
              {resultOkCount > 0 && (
                <span className="summary-results">
                  <span className="summary-sep">·</span>✓ {resultOkCount}
                </span>
              )}
              {resultErrCount > 0 && (
                <span className="summary-results has-error">
                  <span className="summary-sep">·</span>✗ {resultErrCount}
                </span>
              )}
              {thinkingCount > 0 && (
                <span className="summary-thinking">
                  <span className="summary-sep">·</span>◈ {thinkingCount}
                </span>
              )}
              {outputCount > 0 && (
                <span className="summary-output">
                  <span className="summary-sep">·</span>◆ {outputCount}
                </span>
              )}
            </>
          ) : (
            <span className="summary-tool">
              {steps.length} step{steps.length !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="turn-steps-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="turn-steps-list">
          {steps.map((step, i) => (
            <StepRow
              key={i}
              msg={step}
              prevTimestamp={i === 0 ? undefined : steps[i - 1]?.timestamp}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Conversation turn view ────────────────────────────────────

const ConversationTurnView = memo(function ConversationTurnView({
  turn,
  isTarget,
  targetInSteps,
  highlightQuery,
  targetRef,
}: {
  turn: ConversationTurn;
  isTarget?: boolean;
  targetInSteps?: boolean;
  highlightQuery?: string;
  targetRef?: (node: HTMLDivElement | null) => void;
}) {
  const duration = computeDuration(turn.input.timestamp, turn.output?.timestamp);

  // Extract output content pieces
  const outputThinking =
    turn.output?.content.filter(
      (c): c is { type: "thinking"; thinking: string } => c.type === "thinking",
    ) ?? [];
  const outputRedactedThinking =
    turn.output?.content.some((c) => c.type === "redacted_thinking") ?? false;
  const outputTextParts =
    turn.output?.content.filter((c): c is { type: "text"; text: string } => c.type === "text") ??
    [];
  const outputToolUses =
    turn.output?.content.filter(
      (c): c is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        c.type === "tool_use",
    ) ?? [];

  const hasClaudeBubble = turn.steps.length > 0 || turn.output != null;

  return (
    <div ref={isTarget ? targetRef : undefined} className="conv-turn">
      {/* User input bubble */}
      <MessageBubble
        role={turn.input.role}
        content={turn.input.content}
        highlightQuery={isTarget && !targetInSteps ? highlightQuery : undefined}
      />

      {/* Claude bubble — steps + thinking + response text combined */}
      {hasClaudeBubble && (
        <div className="msg-bubble assistant">
          <div className="msg-meta">
            <span className="msg-role">CLAUDE</span>
            {turn.output?.model && (
              <span className="msg-model">{shortModel(turn.output.model)}</span>
            )}
            <div className="msg-meta-right">
              {turn.output?.tokens && turn.output.tokens.totalTokens > 0 && (
                <TokenBadge tokens={turn.output.tokens} />
              )}
              {duration && <span className="turn-duration">{duration}</span>}
            </div>
          </div>

          {turn.steps.length > 0 && (
            <TurnStepsPanel steps={turn.steps} autoExpand={targetInSteps} />
          )}

          {/* Reasoning blocks from the final response — differentiated from mid-step thinking */}
          {(outputThinking.length > 0 || outputRedactedThinking) && (
            <div className="output-thinking">
              {outputThinking.map((c, i) => (
                <ThinkingBlock key={i} thinking={c.thinking} label="REASONING" />
              ))}
              {outputRedactedThinking && <ThinkingBlock redacted label="REASONING" />}
            </div>
          )}

          {(outputTextParts.length > 0 || outputToolUses.length > 0) && (
            <div className="msg-content md-content">
              {outputTextParts.map((c, i) =>
                isTarget && !targetInSteps && highlightQuery ? (
                  <p key={i} className="msg-text">
                    <HighlightText text={c.text} query={highlightQuery} />
                  </p>
                ) : (
                  <ReactMarkdown key={i} components={MD_COMPONENTS} remarkPlugins={[remarkGfm]}>
                    {c.text}
                  </ReactMarkdown>
                ),
              )}
              {outputToolUses.map((c, i) => (
                <ToolUseBlock key={i} name={c.name} input={c.input} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── Transcript panel ─────────────────────────────────────────

const DEFAULT_LIMIT = 300;
// Must stay in sync with estimateSize below. Used to compensate for prepended items.
const VIRTUAL_ESTIMATE_PX = 150;

interface TranscriptPanelProps {
  session: HistorySession;
  scrollToMessageIndex?: number;
  highlightQuery?: string;
  apiBase: string;
  authHeaders: Record<string, string>;
}

export function TranscriptPanel({
  session,
  scrollToMessageIndex,
  highlightQuery,
  apiBase,
  authHeaders,
}: TranscriptPanelProps) {
  const [detail, setDetail] = useState<HistorySessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [liveStatus, setLiveStatus] = useState<"idle" | "thinking" | "live">("idle");
  const parentRef = useRef<HTMLDivElement>(null);
  // null   → initial/retry load: scroll to end
  // number → Load All: target scrollTop in pixels after prepending (preserves viewport)
  const scrollTargetRef = useRef<number | null>(null);
  const lastKnownTotalRef = useRef(0);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether user is near the bottom (to decide auto-scroll on live update)
  const isAtBottomRef = useRef(true);
  const turnsLengthRef = useRef(0);

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
  }, []);

  // Callback ref attached to the search-target message.
  // Fires synchronously when the element enters the DOM — avoids useEffect timing issues
  // where setDetail + setLoading may not be batched, leaving targetRef.current null.
  const targetCallbackRef = useCallback((node: HTMLDivElement | null) => {
    node?.scrollIntoView({ block: "center" });
  }, []);

  const messages = detail?.messages ?? [];
  const isTruncated = detail != null && detail.totalMessages > messages.length;
  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  // In search mode we disable virtualisation so scrollIntoView works reliably.
  const searchMode = scrollToMessageIndex !== undefined;

  // Map a message index (from search results) to the turn that contains it.
  const targetTurnInfo = useMemo(() => {
    if (scrollToMessageIndex === undefined) return null;
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (t == null) continue;
      if (
        t.inputOriginalIdx === scrollToMessageIndex ||
        t.outputOriginalIdx === scrollToMessageIndex
      ) {
        return { turnIdx: i, inSteps: false };
      }
      if (t.stepOriginalIndices.includes(scrollToMessageIndex)) {
        return { turnIdx: i, inSteps: true };
      }
    }
    return null;
  }, [turns, scrollToMessageIndex]);

  const rowVirtualizer = useVirtualizer({
    count: searchMode ? 0 : turns.length, // disabled in search mode
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_ESTIMATE_PX,
    overscan: 8,
  });

  // Keep refs current so polling closure doesn't go stale
  useEffect(() => {
    turnsLengthRef.current = turns.length;
  }, [turns.length]);
  useEffect(() => {
    if (detail) lastKnownTotalRef.current = detail.totalMessages;
  }, [detail?.totalMessages]);

  // Live polling — silent background re-fetch every 2.5s after initial load
  useEffect(() => {
    if (!detail) return;

    const showLive = (status: "thinking" | "live") => {
      setLiveStatus(status);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveTimerRef.current = setTimeout(() => setLiveStatus("idle"), 4000);
    };

    const interval = setInterval(async () => {
      try {
        // 1. Check if this session is actively processing (catches Thinking mode)
        const sessionsR = await fetch(`${apiBase}/api/sessions`, { headers: authHeaders });
        if (sessionsR.ok) {
          const sessions: SessionInfo[] = await sessionsR.json();
          const active = sessions.find((s) => s.id === session.id);
          if (active?.isProcessing) {
            showLive("thinking");
          }
        }

        // 2. Check for new messages in the transcript
        const r = await fetch(
          `${apiBase}/api/history/session?path=${encodeURIComponent(session.filePath)}&limit=${DEFAULT_LIMIT}`,
          { headers: authHeaders },
        );
        if (!r.ok) return;
        const newData: HistorySessionDetail = await r.json();

        if (newData.totalMessages > lastKnownTotalRef.current) {
          lastKnownTotalRef.current = newData.totalMessages;
          setDetail(newData); // silent update — no loading spinner
          showLive("live");

          // Auto-scroll if user is near the bottom
          requestAnimationFrame(() => {
            if (isAtBottomRef.current) {
              rowVirtualizer.scrollToIndex(turnsLengthRef.current - 1, { align: "end" });
            }
          });
        }
      } catch {
        // ignore network errors silently
      }
    }, 2500);

    return () => {
      clearInterval(interval);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.filePath, !!detail]);

  // Fetch on session change, or when toggling between normal (limit=300) and search-nav (limit=all).
  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    const limit = scrollToMessageIndex !== undefined ? 999999 : DEFAULT_LIMIT;
    fetch(
      `${apiBase}/api/history/session?path=${encodeURIComponent(session.filePath)}&limit=${limit}`,
      { headers: authHeaders },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: HistorySessionDetail) => setDetail(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.filePath, retryKey, scrollToMessageIndex !== undefined]);

  // Handles Load All pixel-restore and normal-mode scroll-to-end.
  // Search-mode scrolling is handled by targetCallbackRef (fires on DOM attach, before effects).
  useEffect(() => {
    if (!detail || turns.length === 0) return;
    const pixelTarget = scrollTargetRef.current;
    scrollTargetRef.current = null;
    if (pixelTarget !== null) {
      if (parentRef.current) parentRef.current.scrollTop = pixelTarget;
    } else if (!searchMode) {
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(turns.length - 1, { align: "end" });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const handleLoadAll = useCallback(() => {
    // Convert current scroll position to the equivalent position after prepending.
    // New items (detail.offset of them) each have estimated height VIRTUAL_ESTIMATE_PX.
    const savedScrollTop = parentRef.current?.scrollTop ?? 0;
    const prependedCount = detail?.offset ?? 0;
    scrollTargetRef.current = savedScrollTop + prependedCount * VIRTUAL_ESTIMATE_PX;
    setLoadingAll(true);
    fetch(
      `${apiBase}/api/history/session?path=${encodeURIComponent(session.filePath)}&limit=999999`,
      { headers: authHeaders },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: HistorySessionDetail) => {
        setDetail(data);
      })
      .catch(() => {})
      .finally(() => setLoadingAll(false));
  }, [session.filePath, detail]);

  if (loading) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">⟳</span>
        <span>LOADING TRANSCRIPT...</span>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">✗</span>
        <span>FAILED TO LOAD: {error}</span>
        <button className="history-retry-btn" onClick={() => setRetryKey((k) => k + 1)}>
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div className="transcript-view">
      <div className="transcript-header">
        <div className="transcript-meta">
          <span className="transcript-id">{session.id.slice(0, 8)}…</span>
          <span className="transcript-date">{formatDate(session.lastModified)}</span>
          {session.model && <span className="msg-model">{shortModel(session.model)}</span>}
          {liveStatus !== "idle" && (
            <span className={`live-badge${liveStatus === "thinking" ? " thinking" : ""}`}>
              {liveStatus === "thinking" ? "◈ THINKING" : "● LIVE"}
            </span>
          )}
        </div>
        <div className="transcript-stats">
          <span className="transcript-stat">
            <span className="stat-label">EVENTS</span>
            <span className="stat-value cyan">{session.userTurns}</span>
          </span>
          <span className="transcript-stat">
            <span className="stat-label">TOKENS</span>
            <span className="stat-value magenta">
              {formatTokenCount(session.tokens.totalTokens)}
            </span>
          </span>
          <span className="transcript-stat">
            <span className="stat-label">COST</span>
            <span className="stat-value yellow">{estimateCost(session.tokens, session.model)}</span>
          </span>
        </div>
      </div>

      {isTruncated && (
        <div className="transcript-truncated-banner">
          <span>
            Showing last {messages.length} of {detail.totalMessages} messages
          </span>
          <button className="transcript-load-all-btn" onClick={handleLoadAll} disabled={loadingAll}>
            {loadingAll ? "LOADING..." : "LOAD ALL"}
          </button>
        </div>
      )}

      <div ref={parentRef} className="transcript-messages" onScroll={handleScroll}>
        {searchMode ? (
          // Non-virtual rendering: all turns in the DOM so scrollIntoView is accurate.
          <div>
            {turns.map((turn, idx) => {
              const isTarget = targetTurnInfo?.turnIdx === idx;
              const inSteps = isTarget ? (targetTurnInfo?.inSteps ?? false) : false;
              return (
                <div
                  key={idx}
                  className={`transcript-virtual-row${isTarget ? " search-target" : ""}`}
                >
                  <ConversationTurnView
                    turn={turn}
                    isTarget={isTarget}
                    targetInSteps={inSteps}
                    highlightQuery={isTarget ? highlightQuery : undefined}
                    targetRef={isTarget ? targetCallbackRef : undefined}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          // Virtual rendering for normal browsing (handles large transcripts efficiently).
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const turn = turns[virtualRow.index];
              if (!turn) return null;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="transcript-virtual-row"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ConversationTurnView turn={turn} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {liveStatus !== "idle" && (
        <div className={`live-bottom-bar${liveStatus === "thinking" ? " thinking" : ""}`}>
          <span className="live-bottom-dot">{liveStatus === "thinking" ? "◈" : "●"}</span>
          <span className="live-bottom-text">
            {liveStatus === "thinking" ? "THINKING..." : "LIVE — receiving updates"}
          </span>
        </div>
      )}
    </div>
  );
}
