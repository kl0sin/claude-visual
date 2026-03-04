import type { SearchResult, SearchMatch } from "../types";
import { formatDate, shortModel } from "../lib/transcriptUtils";

function HighlightSnippet({ snippet, matchOffset, matchLength }: SearchMatch) {
  const before = snippet.slice(0, matchOffset);
  const match = snippet.slice(matchOffset, matchOffset + matchLength);
  const after = snippet.slice(matchOffset + matchLength);
  return (
    <span>
      {before}
      <mark className="search-highlight">{match}</mark>
      {after}
    </span>
  );
}

interface SearchResultsPanelProps {
  query: string;
  results: SearchResult[];
  searching: boolean;
  onSelect: (result: SearchResult, messageIndex: number) => void;
}

export function SearchResultsPanel({
  query,
  results,
  searching,
  onSelect,
}: SearchResultsPanelProps) {
  if (searching) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">⟳</span>
        <span>SEARCHING TRANSCRIPTS...</span>
      </div>
    );
  }

  const queryDisplay = query.length > 32 ? query.slice(0, 32) + "…" : query;

  if (results.length === 0) {
    return (
      <div className="history-empty">
        <span className="history-empty-icon">∅</span>
        <span>NO RESULTS FOR "{queryDisplay.toUpperCase()}"</span>
      </div>
    );
  }

  return (
    <div className="search-results-panel">
      <div className="search-results-header">
        {results.length} SESSION{results.length !== 1 ? "S" : ""} MATCHED
      </div>
      {results.map((result) => (
        <div
          key={`${result.projectId}-${result.session.id}`}
          className="search-result-item"
        >
          <button
            className="search-result-header search-result-header-btn"
            onClick={() => onSelect(result, result.matches[0]?.messageIndex ?? 0)}
            title="Jump to first match"
          >
            <span className="search-result-project">{result.projectName}</span>
            <span className="search-result-date">
              {formatDate(result.session.lastModified)}
            </span>
            {result.session.model && (
              <span className="msg-model">{shortModel(result.session.model)}</span>
            )}
            <span className="search-result-count">
              {result.matches.length} MATCH{result.matches.length !== 1 ? "ES" : ""}
            </span>
          </button>
          {result.matches.map((m, i) => (
            <button
              key={i}
              className="search-snippet search-snippet-btn"
              onClick={() => onSelect(result, m.messageIndex)}
              title="Jump to this match"
            >
              <div className="search-snippet-role">{m.role === "assistant" ? "CLAUDE" : "YOU"}</div>
              <HighlightSnippet {...m} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
