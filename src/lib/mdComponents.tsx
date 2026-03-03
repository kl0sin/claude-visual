import type ReactMarkdown from "react-markdown";

export const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p:          ({ children }) => <p className="md-p">{children}</p>,
  h1:         ({ children }) => <h1 className="md-h">{children}</h1>,
  h2:         ({ children }) => <h2 className="md-h md-h2">{children}</h2>,
  h3:         ({ children }) => <h3 className="md-h md-h3">{children}</h3>,
  h4:         ({ children }) => <h4 className="md-h md-h4">{children}</h4>,
  ul:         ({ children }) => <ul className="md-ul">{children}</ul>,
  ol:         ({ children }) => <ol className="md-ol">{children}</ol>,
  li:         ({ children }) => <li className="md-li">{children}</li>,
  strong:     ({ children }) => <strong className="md-strong">{children}</strong>,
  em:         ({ children }) => <em className="md-em">{children}</em>,
  blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
  hr:         () => <hr className="md-hr" />,
  code:       ({ children, className }) => {
    const isBlock = className?.startsWith("language-");
    return isBlock
      ? <code className={`md-code-block ${className ?? ""}`}>{children}</code>
      : <code className="md-code-inline">{children}</code>;
  },
  pre:        ({ children }) => <pre className="md-pre">{children}</pre>,
  a:          ({ href, children }) => (
    <a className="md-link" href={href} target="_blank" rel="noreferrer">{children}</a>
  ),
  table:  ({ children }) => <div className="md-table-wrap"><table className="md-table">{children}</table></div>,
  thead:  ({ children }) => <thead className="md-thead">{children}</thead>,
  tbody:  ({ children }) => <tbody>{children}</tbody>,
  tr:     ({ children }) => <tr className="md-tr">{children}</tr>,
  th:     ({ children }) => <th className="md-th">{children}</th>,
  td:     ({ children }) => <td className="md-td">{children}</td>,
};
