import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Heart,
  BusFront,
  BedDouble,
  Shirt,
  Camera,
  Wine,
  CakeSlice,
  Music2,
  Utensils,
  Sparkles,
  HandHeart,
  PartyPopper,
  Sun,
  Moon,
  Flower2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Rings } from "./components/Rings";
import { RsvpPage } from "./components/RsvpPage";
import { wedding, weddingEvents, receptionEvents } from "./data/wedding";
import { downloadWeddingCalendar } from "./lib/calendar";

function SectionTitle({
  script,
  children,
}: {
  script: string;
  children: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <span className="script">{script}</span>
      <h2>{children}</h2>
    </div>
  );
}

function Countdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const difference = Math.max(
    0,
    new Date(wedding.ceremony.start).getTime() - now,
  );
  const values = [
    Math.floor(difference / 86400000),
    Math.floor(difference / 3600000) % 24,
    Math.floor(difference / 60000) % 60,
    Math.floor(difference / 1000) % 60,
  ];
  return (
    <div
      className="countdown"
      role="timer"
      aria-label={
        difference ? "Time until our wedding" : "Our wedding day has arrived"
      }
    >
      {values.map((value, index) => (
        <div className="countdown-part" key={index}>
          <span>{String(value).padStart(2, "0")}</span>
          <small>{["Days", "Hours", "Minutes", "Seconds"][index]}</small>
        </div>
      ))}
    </div>
  );
}

const weddingIcons: LucideIcon[] = [Flower2, Heart, Camera, Utensils];
const receptionIcons: LucideIcon[] = [
  Wine,
  Sparkles,
  CakeSlice,
  Camera,
  PartyPopper,
  Utensils,
  Camera,
  HandHeart,
  Music2,
  Moon,
];

function Program() {
  const [selected, setSelected] = useState<"wedding" | "reception">("wedding");
  const events = selected === "wedding" ? weddingEvents : receptionEvents;
  const icons = selected === "wedding" ? weddingIcons : receptionIcons;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <section id="program" className="program section-pad">
      <SectionTitle script="the">Program</SectionTitle>
      <p className="section-intro">A day to remember. A lifetime to cherish.</p>
      <div
        className="program-tabs"
        role="tablist"
        aria-label="Celebration program"
      >
        {(["wedding", "reception"] as const).map((item, index) => (
          <button
            key={item}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            role="tab"
            id={`${item}-tab`}
            aria-selected={selected === item}
            aria-controls={`${item}-panel`}
            tabIndex={selected === item ? 0 : -1}
            onClick={() => setSelected(item)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : 1 - index;
                setSelected(next ? "reception" : "wedding");
                tabs.current[next]?.focus();
              }
            }}
          >
            {item === "wedding" ? <Sun size={16} /> : <Wine size={16} />}
            <span>{item === "wedding" ? "The wedding" : "The reception"}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${selected}-panel`}
        aria-labelledby={`${selected}-tab`}
        tabIndex={0}
        className="program-panel"
      >
        <p className="program-location">
          {selected === "wedding" ? wedding.venue : wedding.reception.venue}
        </p>
        <div className={`timeline ${selected}`}>
          <Rings className="timeline-rings" />
          <ol>
            {events.map((event, index) => {
              const Icon = icons[index] ?? Heart;
              return (
                <li
                  key={event.id}
                  className={index % 2 ? "event-right" : "event-left"}
                >
                  <div className="event-content">
                    <time>{event.time}</time>
                    <h3>{event.description}</h3>
                  </div>
                  <span className="event-dot" />
                  <div className="event-icon">
                    <Icon aria-hidden="true" strokeWidth={1} size={34} />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className="fine-print">
        Thursday, 11 February 2027 <span>·</span> All times are in IST
      </p>
    </section>
  );
}

function App() {
  const [isRsvp, setIsRsvp] = useState(window.location.hash === "#rsvp");
  const [calendarStatus, setCalendarStatus] = useState("");
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash === "#rsvp";
      setIsRsvp(next);
      if (next) window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.title = isRsvp
      ? "RSVP | Visakh & Archana"
      : "Visakh & Archana | 11 February 2027";
  }, [isRsvp]);
  const calendar = () => {
    downloadWeddingCalendar();
    setCalendarStatus(
      "Your calendar file is ready. Open it to add both celebrations.",
    );
    window.setTimeout(() => setCalendarStatus(""), 6000);
  };
  const returnToInvitation = () => {
    window.location.hash = "invitation";
    setIsRsvp(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
          document
            .getElementById("main")
            ?.scrollIntoView({ behavior: "instant" });
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a
          href="#invitation"
          className="monogram"
          aria-label="Visakh and Archana, invitation"
          onClick={isRsvp ? returnToInvitation : undefined}
        >
          <img src="/monogram.svg" alt="" width="64" height="64" />
        </a>
        <nav aria-label="Main navigation">
          <a
            href="#invitation"
            onClick={isRsvp ? returnToInvitation : undefined}
          >
            Our wedding
          </a>
          <a href="#program" onClick={() => setIsRsvp(false)}>
            The day
          </a>
          <a href="#details" onClick={() => setIsRsvp(false)}>
            Details
          </a>
        </nav>
        <a className="button button-small" href="#rsvp">
          RSVP <ArrowUpRight size={13} />
        </a>
      </header>
      <main id="main" tabIndex={-1}>
        {isRsvp ? (
          <RsvpPage onBack={returnToInvitation} />
        ) : (
          <>
            <section
              className="hero"
              id="invitation"
              aria-label="Visakh and Archana are getting married"
            >
              <div className="photo-artwork hero-artwork">
                <div className="hero-blur" />
                <picture>
                  <source
                    media="(max-width: 600px)"
                    srcSet="/images/hero-mobile.webp"
                  />
                  <img
                    className="hero-photo"
                    src="/images/hero.webp"
                    alt="Visakh and Archana together beneath warm fairy lights"
                    width="1086"
                    height="1448"
                    fetchPriority="high"
                  />
                </picture>
                <div className="hero-shade" />
              </div>
              <div className="hero-top">
                <span>Two hearts. One beautiful beginning.</span>
              </div>
              <div className="hero-copy">
                <span className="script hero-script">We do</span>
                <p className="eyebrow">Together with our families</p>
                <h1>
                  Visakh <span>&</span> Archana
                </h1>
                <p className="hero-invitation">
                  Invite you to celebrate our wedding
                </p>
                <div className="hero-date">
                  <span>Thursday</span>
                  <strong>
                    11 <i>/</i> 02 <i>/</i> 2027
                  </strong>
                  <span>11:00 AM – 11:20 AM</span>
                </div>
                <p className="hero-place">
                  Mukhathala Sree Krishna Swami Temple
                </p>
              </div>
              <a
                className="hero-scroll"
                href="#welcome"
                aria-label="Discover the invitation"
              >
                <ArrowDown size={17} />
              </a>
              <span className="hero-side">
                A little moment. A forever kind of love.
              </span>
            </section>

            <section className="welcome section-pad" id="welcome">
              <Rings className="welcome-rings" />
              <SectionTitle script="the">Countdown</SectionTitle>
              <p className="eyebrow countdown-eyebrow">To our forever</p>
              <Countdown />
              <div className="invitation-note">
                <span className="tiny-heart">
                  <Heart size={16} strokeWidth={1} />
                </span>
                <p>
                  Some days become memories.
                  <br />
                  This one begins our forever.
                </p>
                <span>
                  With full hearts, we invite you to join us as we begin a new
                  chapter.
                  <br className="desktop-break" /> Your presence, love, and
                  blessings will make our day complete.
                </span>
                <p className="script note-script">
                  We can’t wait to celebrate with you!
                </p>
              </div>
              <button className="button button-outline" onClick={calendar}>
                <CalendarDays size={16} /> Add to calendar
              </button>
            </section>

            <section className="venues section-pad" id="celebrations">
              <SectionTitle script="join us for">The celebrations</SectionTitle>
              <div className="venue-grid">
                <article>
                  <Flower2 className="venue-icon" size={35} strokeWidth={1} />
                  <p className="eyebrow">The wedding</p>
                  <h3>
                    Mukhathala Sree Krishna
                    <br />
                    Swami Temple
                  </h3>
                  <p>
                    Thursday, 11 February 2027
                    <br />
                    <strong>11:00 AM – 11:20 AM</strong>
                  </p>
                  <p className="venue-note">
                    A traditional Hindu temple wedding,
                    <br />
                    surrounded by the people we love.
                  </p>
                  <a
                    className="text-link"
                    href="https://www.google.com/maps/search/?api=1&query=Mukhathala+Sree+Krishna+Swami+Temple"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin size={14} /> View directions{" "}
                    <ArrowUpRight size={14} />
                  </a>
                </article>
                <div className="venue-divider">
                  <span>&</span>
                </div>
                <article>
                  <Wine className="venue-icon" size={35} strokeWidth={1} />
                  <p className="eyebrow">The reception</p>
                  <h3>
                    Marine Pride Beach Resort
                    <br />
                    Varkala
                  </h3>
                  <p>
                    Thursday, 11 February 2027
                    <br />
                    <strong>6:00 PM – 10:00 PM</strong>
                  </p>
                  <p className="venue-note">
                    An evening of laughter, celebration,
                    <br />
                    and a little dancing under the stars.
                  </p>
                  <a
                    className="text-link"
                    href="https://www.google.com/maps/search/?api=1&query=Marine+Pride+Beach+Resort+Varkala"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin size={14} /> View directions{" "}
                    <ArrowUpRight size={14} />
                  </a>
                </article>
              </div>
            </section>

            <Program />

            <section className="details" id="details">
              <div className="details-image">
                <img
                  src="/images/details.webp"
                  alt="Archana and Visakh smiling on either side of a sunlit column"
                  width="1122"
                  height="1402"
                  loading="lazy"
                />
                <span className="script">Better together</span>
              </div>
              <div className="details-copy">
                <SectionTitle script="a few">Little details</SectionTitle>
                <div className="detail-item">
                  <Shirt size={25} strokeWidth={1} />
                  <div>
                    <h3>Dress code</h3>
                    <p>
                      <strong>Wedding</strong> · Traditional or everyday wear.
                      <br />
                      <strong>Reception</strong> · Formal party wear.
                    </p>
                    <span>Come comfortable, come as you.</span>
                  </div>
                </div>
                <div className="detail-item">
                  <BusFront size={25} strokeWidth={1} />
                  <div>
                    <h3>Transportation</h3>
                    <p>
                      <strong>Wedding</strong> · Transport from the groom’s
                      home, from 9:00 AM onwards.
                    </p>
                    <p>
                      <strong>Reception</strong> · Departure at 5:00 PM and
                      return at 8:30 PM.
                    </p>
                    <span>
                      Staying for the DJ, or leaving early? Please arrange your
                      own transport. Let us know your travel needs in your RSVP.
                    </span>
                  </div>
                </div>
                <div className="detail-item">
                  <BedDouble size={25} strokeWidth={1} />
                  <div>
                    <h3>Accommodation</h3>
                    <p>
                      We’re happy to arrange a place for you to stay, on
                      request.
                    </p>
                    <span>
                      Please select accommodation in your RSVP so we can plan
                      your stay.
                    </span>
                  </div>
                </div>
                <a href="#rsvp" className="text-link">
                  Tell us what you need <ArrowUpRight size={15} />
                </a>
              </div>
            </section>

            <section className="rsvp-invitation section-pad">
              <div className="rsvp-lettering">
                <span className="script">please</span>
                <div aria-label="RSVP">
                  RS
                  <br />
                  VP
                </div>
                <Rings className="rsvp-rings" />
              </div>
              <div className="rsvp-message">
                <p className="eyebrow">A place for you in our story</p>
                <h2>Will you join us?</h2>
                <p>
                  We would love to celebrate with you.
                  <br />
                  Let us know who’s coming, and how we
                  <br className="desktop-break" /> can make you feel at home.
                </p>
                <a href="#rsvp" className="button">
                  Kindly RSVP <ArrowUpRight size={16} />
                </a>
                <span className="script">With love, always</span>
              </div>
            </section>

            <footer className="photo-footer">
              <div className="photo-artwork footer-artwork">
                <img
                  src="/images/together.webp"
                  alt="Visakh and Archana sharing a quiet, happy moment"
                  width="1086"
                  height="1448"
                  loading="lazy"
                />
                <div className="footer-shade" />
              </div>
              <div className="footer-copy">
                <p className="eyebrow">Save our date</p>
                <p className="footer-date">
                  11.02
                  <br />
                  2027
                </p>
                <p className="script">Visakh & Archana</p>
                <span>Our day will be more beautiful with you in it.</span>
                <button className="button button-light" onClick={calendar}>
                  <CalendarDays size={15} /> Add to calendar
                </button>
              </div>
            </footer>
            <div className="colophon">
              <span>
                Visakh<Heart size={11} /> Archana
              </span>
              <a href="#invitation">Back to the beginning ↑</a>
            </div>
          </>
        )}
      </main>
      <div className={`toast ${calendarStatus ? "visible" : ""}`} role="status">
        {calendarStatus}
      </div>
    </>
  );
}

export default App;
