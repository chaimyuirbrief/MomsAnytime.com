/**
 * Design reminder — The Keepsake Almanac: editorial scrapbook warmth, asymmetric
 * album-spread composition, warm-paper ground, clay-red seals, and considerate motion.
 */
import { useState } from "react";
import { ArrowDown, ArrowUpRight, Heart, Sparkles } from "lucide-react";
import { handsPhoto, heroPhoto, seal, windowPhoto } from "@/media";
import ContributeForm from "@/components/ContributeForm";

const reflectionLines = [
  "For the rides given, the questions asked, and the doors held open.",
  "For the steady presence that makes a room feel possible.",
  "For all the small care that became someone else’s courage.",
  "For showing up again, in ways that rarely make a list.",
];

const careActs = [
  {
    number: "01",
    title: "She notices",
    text: "The story changes in the pause before a question, the extra blanket, the snack tucked in a bag. Care often begins with attention.",
  },
  {
    number: "02",
    title: "She makes room",
    text: "For a growing voice, a changed mind, a long road home, and every future still waiting to be named.",
  },
  {
    number: "03",
    title: "She carries forward",
    text: "Recipes and reassurances. Boundaries and bravery. The stories that teach us how to belong to one another.",
  },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Home() {
  const [lineIndex, setLineIndex] = useState(0);

  const nextReflection = () => {
    setLineIndex((current) => (current + 1) % reflectionLines.length);
  };

  return (
    <div className="site-shell overflow-x-hidden">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="For All the Moms, return to top">
          <img src={seal.src} alt={seal.alt} className="brand-seal" />
          <span>For all the moms</span>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#honor">The honor</a>
          <a href="#many-ways">Many ways</a>
          <a href="#dedication">A dedication</a>
          <a href="#contribute">Add your voice</a>
        </nav>
        <button className="quiet-button" onClick={() => scrollToSection("dedication")}>
          <span>Pause here</span>
          <ArrowDown size={15} aria-hidden="true" />
        </button>
      </header>

      <main id="top">
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy enter-up">
            <p className="eyebrow"><span className="eyebrow-dot" /> An ongoing thank-you</p>
            <h1 id="hero-title">The hands that make a life feel held.</h1>
            <p className="hero-intro">
              Today, and every day, we honor the people who mother—with tenderness, resolve,
              patience, humor, and love in all its practical forms.
            </p>
            <button className="hero-link" onClick={() => scrollToSection("honor")}>
              Read the tribute <ArrowDown size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="hero-photo-wrap enter-photo">
            <div className="photo-tape" aria-hidden="true" />
            <img
              className="hero-photo"
              src={heroPhoto.src}
              alt={heroPhoto.alt}
            />
            <div className="hero-caption">
              <span>From the everyday</span>
              <span>— with love</span>
            </div>
          </div>

          <div className="hero-margin-note enter-up">
            <span className="margin-line" />
            <p>“Mother” is a role, a relationship, a practice of showing up.</p>
          </div>
        </section>

        <section className="honor-section" id="honor" aria-labelledby="honor-title">
          <div className="honor-aside">
            <p className="section-index">I. The honor</p>
            <span className="vertical-rule" aria-hidden="true" />
            <p className="aside-script">Take a moment<br />to notice it.</p>
          </div>
          <div className="honor-content">
            <p className="eyebrow">The quiet architecture of care</p>
            <h2 id="honor-title">Some of the greatest work happens in the ordinary.</h2>
            <div className="honor-body">
              <p>
                It is the work of remembering who needs a little more time. Of listening past
                the first answer. Of offering guidance without taking over the map. It is work
                that shapes a home, a friendship, a family, and sometimes a whole future.
              </p>
              <p>
                We honor the people who mother children, communities, friends, and chosen
                families. We honor those who do it visibly and those who do it in the quiet.
                We honor the love behind the labor—and the people behind the love.
              </p>
            </div>
          </div>
          <div className="honor-stamp" aria-label="A keepsake-red seal of recognition">
            <Heart size={22} strokeWidth={1.5} aria-hidden="true" />
            <span>seen<br />here</span>
          </div>
        </section>

        <section className="care-section" aria-labelledby="care-title">
          <div className="care-intro">
            <p className="section-index">II. Care leaves clues</p>
            <h2 id="care-title">Look closely. It is everywhere.</h2>
          </div>
          <div className="care-list">
            {careActs.map((act) => (
              <article className="care-act" key={act.number}>
                <span className="care-number">{act.number}</span>
                <div>
                  <h3>{act.title}</h3>
                  <p>{act.text}</p>
                </div>
                <ArrowUpRight className="care-arrow" size={19} aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        <section className="photo-story-section" id="many-ways" aria-labelledby="ways-title">
          <div className="story-image story-image-a">
            <img
              src={windowPhoto.src}
              alt={windowPhoto.alt}
            />
            <p>There is no single picture of a mother.</p>
          </div>
          <div className="story-copy">
            <p className="eyebrow">III. Many ways</p>
            <h2 id="ways-title">Love does not arrive in one shape.</h2>
            <p>
              Some people mother by birth, adoption, step-parenting, fostering, mentoring,
              grieving, advocating, feeding, teaching, tending, calling, and staying. Some are
              met by that care; some learn to make it themselves. All of these stories deserve
              room on the page.
            </p>
            <div className="story-note">
              <span className="note-pin" aria-hidden="true" />
              <p>To every mother, and to everyone who mothers: we are grateful for your many ways of being here.</p>
            </div>
          </div>
          <div className="story-image story-image-b">
            <img
              src={handsPhoto.src}
              alt={handsPhoto.alt}
            />
          </div>
        </section>

        <section className="dedication-section" id="dedication" aria-labelledby="dedication-title">
          <div className="dedication-grid">
            <div className="dedication-side">
              <p className="section-index">IV. A small dedication</p>
              <Sparkles size={21} strokeWidth={1.3} aria-hidden="true" />
            </div>
            <div className="dedication-main">
              <p className="eyebrow">Keep this close</p>
              <h2 id="dedication-title">Pause here. Let someone know they are seen.</h2>
              <p className="dedication-intro">
                A grateful thought can be small, specific, and enough. Carry one of these lines
                with you—or let it lead you to your own.
              </p>
              <div className="reflection-card" aria-live="polite">
                <span className="reflection-quote">“</span>
                <p>{reflectionLines[lineIndex]}</p>
                <button className="reflection-button" onClick={nextReflection}>
                  Another line <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="contribute-section" id="contribute" aria-labelledby="contribute-title">
          <div className="contribute-grid">
            <div className="contribute-intro">
              <p className="section-index">V. Add your voice</p>
              <h2 id="contribute-title">This page is not finished.</h2>
              <p>
                It never will be, and that is the point. Tell us about someone who
                mothered you, or offer what you have—an hour, a photograph, a better
                sentence—to make this a wider room.
              </p>
              <span className="margin-line" aria-hidden="true" />
              <p className="contribute-aside">
                Every note is read by a person, not a system.
              </p>
            </div>
            <ContributeForm />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <img src={seal.src} alt={seal.alt} />
          <span>For all the moms</span>
        </div>
        <p>A little room for gratitude.</p>
        <a href="#top" className="top-link">Back to top <ArrowUpRight size={14} aria-hidden="true" /></a>
      </footer>
    </div>
  );
}
