const REPO_URL = "https://github.com/kl0sin/claude-visual";

export function Footer() {
  return (
    <footer className="footer">
      <p className="footer-text">
        CLAUDE VISUAL // NEURAL MONITOR // MIT LICENSE
      </p>
      <ul className="footer-links">
        <li>
          <a href={REPO_URL} className="footer-link" target="_blank" rel="noopener noreferrer">
            GITHUB
          </a>
        </li>
        <li>
          <a href={`${REPO_URL}/issues`} className="footer-link" target="_blank" rel="noopener noreferrer">
            ISSUES
          </a>
        </li>
        <li>
          <a href={`${REPO_URL}/releases`} className="footer-link" target="_blank" rel="noopener noreferrer">
            RELEASES
          </a>
        </li>
      </ul>
    </footer>
  );
}
