import { useEffect, useState } from "react";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      if (window.scrollY > 60) setIsOpen(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setIsOpen(false);

  return (
    <>
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <a href="#" className="nav-logo" onClick={close}>
          <img src="icon.png" alt="Claude Visual" />
          <span className="nav-logo-text">
            <span className="nav-logo-main">CLAUDE</span>{" "}
            <span className="nav-logo-accent">VISUAL</span>
          </span>
        </a>

        <ul className="nav-links">
          <li><a href="#features" className="nav-link">FEATURES</a></li>
          <li><a href="#demo" className="nav-link">DEMO</a></li>
          <li><a href="#download" className="nav-link">DOWNLOAD</a></li>
          <li>
            <a
              href="https://github.com/kl0sin/claude-visual"
              className="nav-cta"
              target="_blank"
              rel="noopener noreferrer"
            >
              GITHUB
            </a>
          </li>
        </ul>

        <button
          className={`nav-hamburger ${isOpen ? "open" : ""}`}
          onClick={() => setIsOpen((v) => !v)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      {isOpen && (
        <div className="nav-mobile-menu">
          <a href="#features" className="nav-mobile-link" onClick={close}>FEATURES</a>
          <a href="#demo" className="nav-mobile-link" onClick={close}>DEMO</a>
          <a href="#download" className="nav-mobile-link" onClick={close}>DOWNLOAD</a>
          <a
            href="https://github.com/kl0sin/claude-visual"
            className="nav-mobile-link nav-mobile-cta"
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
          >
            GITHUB ↗
          </a>
        </div>
      )}
    </>
  );
}
