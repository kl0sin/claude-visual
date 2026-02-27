const REPO_URL = "https://github.com/kl0sin/claude-visual";
const RELEASES_URL = `${REPO_URL}/releases`;
const LATEST_URL = `${RELEASES_URL}/latest/download`;

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
    filename: "claude-visual_aarch64.dmg",
  },
  {
    platform: "APPLE",
    os: "macOS",
    arch: "x64 (Intel)",
    filename: "claude-visual_x64.dmg",
  },
  {
    platform: "MICROSOFT",
    os: "Windows",
    arch: "x64",
    filename: "claude-visual_x64-setup.exe",
  },
  {
    platform: "LINUX",
    os: "Linux",
    arch: "x86_64 (AppImage)",
    filename: "claude-visual_amd64.AppImage",
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
            href={`${LATEST_URL}/${p.filename}`}
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
