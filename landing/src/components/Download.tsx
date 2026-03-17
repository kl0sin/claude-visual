const REPO_URL = "https://github.com/kl0sin/claude-visual";
const RELEASES_URL = `${REPO_URL}/releases`;
const VERSION = "0.4.2";
const VERSION_URL = `${RELEASES_URL}/download/v${VERSION}`;

interface Platform {
  platform: string;
  os: string;
  arch: string;
  filename: string;
}

const PLATFORMS: Platform[] = [
  {
    platform: "APPLE",
    os: "macOS",
    arch: "ARM64 (Apple Silicon)",
    filename: `Claude.Visual_${VERSION}_aarch64.dmg`,
  },
  {
    platform: "APPLE",
    os: "macOS",
    arch: "x64 (Intel)",
    filename: `Claude.Visual_${VERSION}_x64.dmg`,
  },
  {
    platform: "MICROSOFT",
    os: "Windows",
    arch: "x64",
    filename: `Claude.Visual_${VERSION}_x64-setup.exe`,
  },
  {
    platform: "LINUX",
    os: "Linux",
    arch: "x86_64 (AppImage)",
    filename: `Claude.Visual_${VERSION}_amd64.AppImage`,
  },
];

export function Download() {
  return (
    <section className="section" id="download">
      <p className="section-label">// GET STARTED</p>
      <h2 className="section-title">DOWNLOAD</h2>

      <div className="download-grid">
        {PLATFORMS.map((p) => (
          <a
            key={p.filename}
            href={`${VERSION_URL}/${p.filename}`}
            className="download-card"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="download-platform">{p.platform}</span>
            <span className="download-os">{p.os}</span>
            <span className="download-arch">{p.arch}</span>
            <span className="download-arrow">↓ DOWNLOAD</span>
          </a>
        ))}
      </div>

      <p className="download-link-alt">
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
          View all releases on GitHub →
        </a>
      </p>
    </section>
  );
}
