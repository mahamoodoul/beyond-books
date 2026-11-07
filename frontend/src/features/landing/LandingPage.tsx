import { Link } from "react-router";

import { usePreferences } from "@/app/providers/PreferencesProvider";
import { Icon } from "@/components/ui/Icon";
import BeyondBooksLogo from "@/components/BeyondBooksLogo";

import { HeartTurntable, HeroSubjects, usePrefersReducedMotion } from "./HeroSubjects";

const steps = ["Upload", "Analyse", "Generate", "Review", "Learn", "Assess", "Improve"];
const painPoints = [
  {
    icon: "file" as const,
    title: "Pages stay on the page.",
    description: "Dense diagrams and long chapters can make it hard to picture how a system really works.",
  },
  {
    icon: "circle-help" as const,
    title: "One lesson can’t fit everyone.",
    description: "Students move at different speeds, but it’s difficult to spot who needs another explanation.",
  },
  {
    icon: "activity" as const,
    title: "Progress is hard to see.",
    description: "A finished worksheet doesn’t always show which ideas have clicked—and which haven’t.",
  },
];

const features = [
  { icon: "sparkles" as const, title: "AI course creation", text: "Turn trusted source material into an editable course outline." },
  { icon: "layers" as const, title: "Interactive 3D learning", text: "Explore structures from every angle and select the details that matter." },
  { icon: "book" as const, title: "Chapter-based lessons", text: "Break big topics into clear, connected learning steps." },
  { icon: "target" as const, title: "Thoughtful assessments", text: "Check understanding with questions built around the lesson." },
  { icon: "lightbulb" as const, title: "Helpful AI evaluation", text: "Give students useful feedback and a next step to try." },
  { icon: "activity" as const, title: "Progress that makes sense", text: "Help learners see their progress and choose what to revisit." },
  { icon: "users" as const, title: "Teacher insights", text: "Spot class-wide patterns and concepts worth teaching again." },
  { icon: "eye" as const, title: "See it in your space", text: "Place 3D models on your desk with augmented reality." },
];

export function LandingPage() {
  const { theme } = usePreferences();
  const reduced = usePrefersReducedMotion();
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link aria-label="Beyond Books home" className="brand" to="/">
          <BeyondBooksLogo showWordmark size={44} variant={theme} />
        </Link>
        <nav aria-label="Landing page navigation" className="landing-nav">
          <a href="#how-it-works">How it works</a>
          <a href="#what-you-can-do">What you can do</a>
          <a href="#example">Example</a>
        </nav>
        <div className="landing-header-actions">
          <Link className="landing-signin" to="/login">Sign in</Link>
          <Link className="button button-primary landing-get-started" to="/register">Get started <Icon name="arrow-right" size={15} /></Link>
        </div>
      </header>

      <section aria-labelledby="landing-title" className="landing-hero">
        <div className="landing-hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A NEW WAY TO LEARN</div>
          <h1 id="landing-title">Turn textbooks into <span>interactive 3D learning.</span></h1>
          <p>Make complex ideas easier to see, explore and remember. Go from a trusted source to a whole new way of understanding.</p>
          <div className="landing-cta-row">
            <Link className="button button-primary" to="/login?role=teacher"><Icon name="users" size={17} /> I’m a teacher <Icon name="arrow-right" size={15} /></Link>
            <Link className="button landing-student-cta" to="/login?role=student"><Icon name="lightbulb" size={16} /> I’m a student</Link>
          </div>
          <div className="landing-trust-line"><Icon name="check" size={14} /> Teacher-guided <span>·</span> Source-grounded <span>·</span> Made for understanding</div>
        </div>
        <HeroSubjects />
        <div className="hero-bottom-note"><span>01</span> THE CURIOUS CLASSROOM</div>
      </section>

      <section aria-labelledby="problem-title" className="landing-section problem-section">
        <div className="landing-section-heading">
          <span className="eyebrow eyebrow-muted">LEARNING SHOULD FEEL DIFFERENT</span>
          <h2 id="problem-title">Some ideas are too important <br className="wide-break" />to leave on the page.</h2>
        </div>
        <div className="pain-grid">
          {painPoints.map((point, index) => (
            <article className="pain-card" key={point.title}>
              <span className={`pain-icon pain-icon-${index}`}><Icon name={point.icon} size={19} /></span>
              <span className="pain-number">0{index + 1}</span>
              <h3>{point.title}</h3>
              <p>{point.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="steps-title" className="landing-section steps-section" id="how-it-works">
        <div className="landing-section-heading centered-heading">
          <span className="eyebrow eyebrow-muted">FROM SOURCE TO “OH, I GET IT”</span>
          <h2 id="steps-title">Seven steps. One new perspective.</h2>
          <p>Your teaching stays at the heart of every step.</p>
        </div>
        <ol aria-label="How Beyond Books works" className="steps-timeline">
          {steps.map((step, index) => (
            <li className="timeline-step" key={step}>
              <span className="timeline-marker">{String(index + 1).padStart(2, "0")}</span>
              <span className="timeline-step-label">{step}</span>
            </li>
          ))}
        </ol>
        <p className="steps-caption"><Icon name="sparkles" size={16} /> AI lends a hand. Teachers guide the learning.</p>
      </section>

      <section aria-labelledby="features-title" className="landing-section features-section" id="what-you-can-do">
        <div className="landing-section-heading">
          <span className="eyebrow eyebrow-muted">A CLASSROOM FULL OF POSSIBILITIES</span>
          <h2 id="features-title">Everything works together.</h2>
          <p>Thoughtful tools for educators. A more visual way forward for learners.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon"><Icon name={feature.icon} size={19} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="example-title" className="landing-section example-section" id="example">
        <div className="example-visual">
          <div className="example-orbit" />
          <div className="example-heart"><HeartTurntable running={!reduced} /></div>
          <span className="example-tag"><Icon name="flask" size={14} /> GRADE 8 BIOLOGY</span>
          <span className="example-visual-label">A chapter<br />you can explore.</span>
        </div>
        <div className="example-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> A SAMPLE LEARNING JOURNEY</span>
          <h2 id="example-title">The circulatory system, from the inside out.</h2>
          <p>Start with a biology textbook. Follow blood through the chambers of the heart. Make sense of oxygen exchange. Then check what’s clicked.</p>
          <ul className="example-list">
            <li><Icon name="check" size={15} /> 5 connected chapters</li>
            <li><Icon name="check" size={15} /> Interactive heart model & blood-flow animation</li>
            <li><Icon name="check" size={15} /> Helpful assessment feedback for every learner</li>
          </ul>
          <Link className="text-link" to="/login?role=student">Open your student workspace <Icon name="arrow-right" size={16} /></Link>
        </div>
      </section>

      <section aria-labelledby="final-cta-title" className="landing-final-cta">
        <span className="eyebrow eyebrow-light">THE NEXT “AHA!” IS CLOSER THAN YOU THINK</span>
        <h2 id="final-cta-title">Ready to see learning differently?</h2>
        <p>Create your account and bring your classroom to life.</p>
        <div className="landing-cta-row">
          <Link className="button final-cta-light" to="/login?role=teacher">I’m a teacher <Icon name="arrow-right" size={15} /></Link>
          <Link className="button final-cta-outline" to="/login?role=student">I’m a student</Link>
        </div>
      </section>
      <footer className="landing-footer">
        <Link aria-label="Beyond Books home" className="brand" to="/">
          <BeyondBooksLogo animated={false} showWordmark size={35} variant={theme} />
        </Link>
        <span>Learning, brought to life.</span>
        <span>© 2026 Beyond Books</span>
      </footer>
    </main>
  );
}
