import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { Features } from "./components/Features";
import { DemoTerminal } from "./components/DemoTerminal";
import { DemoHistory } from "./components/DemoHistory";
import { DemoAlerts } from "./components/DemoAlerts";
import { DemoStats } from "./components/DemoStats";
import { Download } from "./components/Download";
import { Footer } from "./components/Footer";

export function App() {
  return (
    <>
      <div className="scanlines" />
      <div className="grid-bg" />

      <Nav />

      <main style={{ position: "relative", zIndex: 1 }}>
        <Hero />

        <Features />

        <section className="demo-section" id="demo">
          <div className="demos-container">
            <p className="section-label" style={{ textAlign: "center" }}>// LIVE PREVIEW</p>
            <h2 className="section-title" style={{ textAlign: "center", marginBottom: 48 }}>
              SEE IT IN ACTION
            </h2>

            <div className="demo-block">
              <p className="demo-block-label">01 // LIVE MONITOR</p>
              <DemoTerminal />
              <p className="demo-caption">
                Simulated event stream — what you see when Claude Code is running
              </p>
            </div>

            <div className="demo-block">
              <p className="demo-block-label">02 // SESSION HISTORY BROWSER</p>
              <DemoHistory />
              <p className="demo-caption">
                Browse and replay past sessions stored locally on your machine
              </p>
            </div>

            <div className="demo-block">
              <p className="demo-block-label">03 // SMART ALERTS</p>
              <DemoAlerts />
              <p className="demo-caption">
                Desktop notifications + in-app toasts — tool failures, permission requests, cost thresholds
              </p>
            </div>

            <div className="demo-block">
              <p className="demo-block-label">04 // HISTORICAL ANALYTICS</p>
              <DemoStats />
              <p className="demo-caption">
                Per-project KPIs, top tool usage, session trends over 30 days and model breakdown
              </p>
            </div>
          </div>
        </section>

        <Download />
      </main>

      <Footer />
    </>
  );
}
