import Link from "next/link";

const foundation = [
  {
    number: "01",
    title: "Maamul fudud",
    description:
      "Hal meel ka eeg dakhliga, hawlaha ganacsiga iyo doorkooda.",
  },
  {
    number: "02",
    title: "Admin gaar ah",
    description:
      "Maamulka platform-ku wuxuu ka duwan yahay workspace-ka ganacsiga.",
  },
  {
    number: "03",
    title: "Diyaar u ah koritaan",
    description:
      "VELTO wuxuu kuu suuragelinayaa inaad ganacsiyo iyo adeegyo kala duwan maamusho.",
  },
];

const steps = [
  {
    number: "01",
    title: "Diiwaangeli ganacsigaaga",
    description:
      "Ganacsigaaga ka diiwaangeli VELTO adigoo buuxinaya xogta loo baahan yahay.",
  },
  {
    number: "02",
    title: "Hel oggolaansho",
    description:
      "Maamulka VELTO ayaa dib u eegaya codsigaaga, kadibna kuu oggolaanaya isticmaalka platform-ka.",
  },
  {
    number: "03",
    title: "Bilow maamulka",
    description:
      "Marka lagu ansixiyo, waxaad heli doontaa workspace kuu gaar ah oo aad ganacsigaaga ku maamusho.",
  },
];

const platformFeatures = [
  {
    icon: "⌂",
    title: "Maamulka Ganacsiga",
    description: "Hawlaha maalinlaha ah ku habeey meel keliya.",
  },
  {
    icon: "▦",
    title: "Products & Inventory",
    description: "La soco alaabtaada iyo heerka kaydka.",
  },
  {
    icon: "↗",
    title: "Sales Management",
    description: "Diiwaangeli iibka oo la soco dhaqdhaqaaqiisa.",
  },
  {
    icon: "◉",
    title: "Customer Management",
    description: "Xogta macaamiishaada si habaysan u maamul.",
  },
  {
    icon: "◇",
    title: "Finance Management",
    description: "Dhaqaalaha ganacsigaaga si cad ula soco.",
  },
  {
    icon: "♧",
    title: "Employee Management",
    description: "Kooxdaada iyo rukhsadahooda meel ku maamul.",
  },
  {
    icon: "⌖",
    title: "Branch Management",
    description: "Laamaha ganacsigaaga ku maamul hal nidaam.",
  },
  {
    icon: "▤",
    title: "Reports & Analytics",
    description: "Ka faa'iidayso warbixinno kaa caawiya go'aan qaadashada.",
  },
];

function PlatformDashboardPreview() {
  return (
    <div
      className="landing-dashboard"
      role="img"
      aria-label="Sawir tusaale ah oo muujinaya dashboard-ka VELTO Super Admin"
    >
      <div className="dashboard-topbar">
        <div className="dashboard-brand">
          <span className="dashboard-brand-mark">V</span>
          <span>VELTO</span>
        </div>
        <div className="dashboard-topbar-right">
          <span className="dashboard-preview-label">DASHBOARD PREVIEW</span>
          <span className="dashboard-avatar">SA</span>
        </div>
      </div>
      <div className="dashboard-content">
        <div className="dashboard-greeting">
          <div>
            <span className="dashboard-eyebrow">PLATFORM OVERVIEW</span>
            <h2>Ku soo dhawoow, Super Admin</h2>
          </div>
          <span className="dashboard-date">Maamulka platform-ka</span>
        </div>
        <div className="dashboard-metrics">
          <article className="dashboard-metric">
            <span>Total Businesses</span>
            <strong>—</strong>
            <small>Xogta platform-ka</small>
          </article>
          <article className="dashboard-metric">
            <span>Active Workspaces</span>
            <strong>—</strong>
            <small>Ganacsiyada firfircoon</small>
          </article>
          <article className="dashboard-metric">
            <span>Business Applications</span>
            <strong>—</strong>
            <small>Codsiyada sugaya</small>
          </article>
        </div>
        <div className="dashboard-lower">
          <div className="dashboard-activity">
            <div className="dashboard-panel-heading">
              <strong>Recent Activities</strong>
              <span>Platform-ka</span>
            </div>
            <div className="dashboard-activity-row">
              <span className="activity-dot activity-dot-green" />
              <span><strong>Business approvals</strong><small>Codsiyada ganacsiga</small></span>
              <b>Maamul</b>
            </div>
            <div className="dashboard-activity-row">
              <span className="activity-dot activity-dot-blue" />
              <span><strong>Subscriptions</strong><small>Qorshayaasha ganacsiga</small></span>
              <b>La soco</b>
            </div>
            <div className="dashboard-activity-row">
              <span className="activity-dot activity-dot-gold" />
              <span><strong>Platform users</strong><small>Kooxda maamulka</small></span>
              <b>Ammaan</b>
            </div>
          </div>
          <div className="dashboard-workspaces">
            <div className="dashboard-panel-heading">
              <strong>Goobaha maamulka</strong>
              <span>VELTO</span>
            </div>
            <div className="workspace-item"><i>▦</i><span>Businesses</span><b>→</b></div>
            <div className="workspace-item"><i>◷</i><span>Applications</span><b>→</b></div>
            <div className="workspace-item"><i>◇</i><span>Subscriptions</span><b>→</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortalPreview({ type }: { type: "admin" | "business" }) {
  const isAdmin = type === "admin";

  return (
    <div className={`portal-preview portal-preview-${type}`} aria-hidden="true">
      <div className="portal-preview-bar">
        <span className="portal-preview-logo">V</span>
        <span>{isAdmin ? "SUPER ADMIN" : "BUSINESS WORKSPACE"}</span>
        <i />
      </div>
      <div className="portal-preview-body">
        <div className="portal-preview-side">
          <span className="portal-side-active" />
          <span />
          <span />
          <span />
        </div>
        <div className="portal-preview-main">
          <div className="portal-preview-title">
            <span>{isAdmin ? "Platform Overview" : "Workspace Overview"}</span>
            <b>{isAdmin ? "VELTO" : "GANACSIGAAGA"}</b>
          </div>
          <div className="portal-preview-cards">
            <i><b /><span /></i>
            <i><b /><span /></i>
            <i><b /><span /></i>
          </div>
          <div className="portal-preview-lines">
            <span /><span /><span />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="landing">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="VELTO bogga hore">
          <span className="brand-mark">V</span>
          <span className="brand-name">VELTO</span>
        </Link>
        <nav className="site-nav" aria-label="Navigation-ka weyn">
          <a href="#about">Ku saabsan</a>
          <Link href="/business/login">Business gal</Link>
          <Link className="nav-register" href="/register">Ganacsi diiwaangeli</Link>
          <Link className="nav-admin" href="/admin/login">Admin gal <span aria-hidden="true">↗</span></Link>
        </nav>
        <details className="mobile-nav">
          <summary aria-label="Fur navigation-ka">
            <span className="mobile-nav-icon" />
          </summary>
          <nav className="mobile-nav-panel" aria-label="Navigation-ka mobilka">
            <a href="#about">Ku saabsan</a>
            <Link href="/business/login">Business gal</Link>
            <Link href="/register">Ganacsi diiwaangeli</Link>
            <Link href="/admin/login">Admin gal <span aria-hidden="true">↗</span></Link>
          </nav>
        </details>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span /> MAAMUL GANACSI OO MIDAYSAN</div>
          <h1 id="hero-title">Ganacsigaaga.<br /><span>Meel keliya.</span></h1>
          <p>
            VELTO waa madal lagu maamulo ganacsiyo kala duwan. Ka bilow
            maamulka platform-ka, kuna dar ganacsiyada aad rabto inaad nidaam
            isku dhafan ku maamusho.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/admin/login">Gal maamulka <span aria-hidden="true">→</span></Link>
            <a className="button button-secondary" href="#about">Wax badan ogow <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-footnote">
            <span className="footnote-check">✓</span>
            <span>Maamul habaysan, oo adiga kuu shaqeeya.</span>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <div className="hero-decoration hero-decoration-one" />
          <div className="hero-decoration hero-decoration-two" />
          <div className="floating-note floating-note-top">
            <span className="floating-note-icon">✓</span>
            <span><strong>Codsi cusub</strong><small>Diyaar u ah dib-u-eegis</small></span>
          </div>
          <PlatformDashboardPreview />
          <div className="floating-note floating-note-bottom">
            <span className="floating-note-icon floating-note-icon-blue">↗</span>
            <span><strong>Laba portal</strong><small>Hal madal oo isku xiran</small></span>
          </div>
        </div>
      </section>

      <section className="foundation-section reveal-on-scroll" id="about" aria-labelledby="foundation-title">
        <div className="section-heading foundation-heading">
          <span className="section-kicker">VELTO FOUNDATION</span>
          <h2 id="foundation-title">Wax walba si cad u kala saar.</h2>
          <p>Maamul guud iyo workspace ganacsi, mid walba shaqadiisa gaarka ah.</p>
        </div>
        <div className="foundation-grid">
          {foundation.map((item) => (
            <article className="foundation-card" key={item.number}>
              <span className="foundation-number">{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-section reveal-on-scroll" id="how-it-works" aria-labelledby="how-title">
        <div className="section-heading">
          <span className="section-kicker">SIDA AY U SHAQAYSO</span>
          <h2 id="how-title">Sida VELTO u shaqeeyo.</h2>
          <p>Bilow fudud, oggolaansho cad, kadibna workspace kuu gaar ah.</p>
        </div>
        <div className="steps-grid">
          {steps.map((step) => (
            <article className="step-card" key={step.number}>
              <span className="step-number">{step.number}</span>
              <span className="step-connector" aria-hidden="true" />
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="features-section reveal-on-scroll" id="features" aria-labelledby="features-title">
        <div className="section-heading">
          <span className="section-kicker">HAL MADAL, QALABYO BADAN</span>
          <h2 id="features-title">Wax kasta oo ganacsigaagu u baahan yahay.</h2>
          <p>Qalab isku xiran oo kaa caawinaya inaad ganacsigaaga maamusho.</p>
        </div>
        <div className="features-grid">
          {platformFeatures.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="portals-section reveal-on-scroll" id="portals" aria-labelledby="portals-title">
        <div className="section-heading">
          <span className="section-kicker">LABA PORTAL, HAL PLATFORM</span>
          <h2 id="portals-title">Maamulku meel walba ayuu ka bilaabmaa.</h2>
          <p>Labada portal way kala duwan yihiin, balse waxay ku wada shaqeeyaan VELTO.</p>
        </div>
        <div className="portals-grid">
          <article className="portal-card portal-card-admin">
            <div className="portal-card-copy">
              <span className="portal-label"><i /> PLATFORM ADMINISTRATION</span>
              <h3>VELTO Super Admin</h3>
              <p>Maamulka guud ee platform-ka. Maamul ganacsiyada, codsiyada, subscriptions-ka iyo hawlaha platform-ka.</p>
              <ul>
                <li>Business Approvals</li>
                <li>Subscription Management</li>
                <li>Platform Finance</li>
                <li>User Management & Analytics</li>
              </ul>
              <Link className="portal-link" href="/admin/login">Gal Super Admin <span aria-hidden="true">→</span></Link>
            </div>
            <PortalPreview type="admin" />
          </article>
          <article className="portal-card portal-card-business">
            <div className="portal-card-copy">
              <span className="portal-label"><i /> MAAMULKA GANACSIGA</span>
              <h3>VELTO Business Workspace</h3>
              <p>Meel uu ganacsi kasta ku maamulo hawlihiisa maalinlaha ah, shaqaalihiisa iyo dhaqaalihiisa.</p>
              <ul>
                <li>Sales & Inventory</li>
                <li>Customers & Employees</li>
                <li>Finance & Reports</li>
                <li>Ganacsigaaga, xogtaada</li>
              </ul>
              <Link className="portal-link" href="/business/login">Gal Business Workspace <span aria-hidden="true">→</span></Link>
            </div>
            <PortalPreview type="business" />
          </article>
        </div>
      </section>

      <section className="register-section reveal-on-scroll" id="register" aria-labelledby="register-title">
        <div className="register-glow register-glow-one" />
        <div className="register-glow register-glow-two" />
        <div className="register-content">
          <span className="section-kicker">MAAMULKAAGA XIGA HALKAN KA BILOW</span>
          <h2 id="register-title">Diyaar ma u tahay inaad ganacsigaaga habayso?</h2>
          <p>Ku bilow VELTO maanta, una samee ganacsigaaga maamul isku dhafan oo fudud.</p>
          <div className="register-actions">
            <Link className="button button-light" href="/register">Ganacsiga diiwaangeli <span aria-hidden="true">→</span></Link>
            <span>Ku biir VELTO oo bilow maamul habaysan.</span>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <Link className="brand" href="/" aria-label="VELTO bogga hore">
              <span className="brand-mark">V</span>
              <span className="brand-name">VELTO</span>
            </Link>
            <p>Hal madal oo ganacsiyada ku caawisa maamul habaysan oo isku xiran.</p>
          </div>
          <nav className="footer-links" aria-label="Footer navigation">
            <Link href="/">Home</Link>
            <a href="#about">Ku saabsan</a>
            <Link href="/register">Business Registration</Link>
            <Link href="/admin/login">Admin Login</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© 2026 VELTO. All rights reserved.</span>
          <span>Maamul ganacsiga, si ka fudud.</span>
        </div>
      </footer>
    </main>
  );
}
