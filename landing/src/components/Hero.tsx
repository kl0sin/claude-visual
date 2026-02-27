import { useEffect, useRef, useState } from "react";

export function Hero() {
  const [glitch, setGlitch] = useState(false);
  const glitchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const interval = setInterval(
      () => {
        setGlitch(true);
        glitchTimeout.current = setTimeout(() => setGlitch(false), 150);
      },
      4000 + Math.random() * 3000,
    );
    return () => {
      clearInterval(interval);
      clearTimeout(glitchTimeout.current);
    };
  }, []);

  return (
    <section className="hero">
      <p className="hero-eyebrow">// v0.2.0 — OPEN SOURCE DESKTOP APP</p>

      <h1 className={`hero-title ${glitch ? "glitch" : ""}`}>
        <span className="hero-title-main">CLAUDE</span>
        <span className="hero-title-accent">VISUAL</span>
      </h1>

      <p className="hero-tagline">
        // REAL-TIME <span>NEURAL MONITOR</span> FOR CLAUDE CODE
      </p>

      <div className="hero-actions">
        <a href="#download" className="btn-primary">
          ▼ DOWNLOAD
        </a>
        <a
          href="https://github.com/kl0sin/claude-visual"
          className="btn-ghost"
          target="_blank"
          rel="noopener noreferrer"
        >
          ⌥ VIEW SOURCE
        </a>
      </div>

      <div className="hero-platforms">
        <span className="platform-badge">macOS ARM64</span>
        <span className="platform-badge">macOS Intel</span>
        <span className="platform-badge">Windows x64</span>
        <span className="platform-badge">Linux x64</span>
      </div>
    </section>
  );
}
