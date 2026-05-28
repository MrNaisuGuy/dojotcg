import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import mtg from "../assets/mtg_carousel.webp";
import pokemon from "../assets/pokemon_carousel.webp";
import onepiece from "../assets/onepiece_carousel.webp";

const defaultResourceLinkStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.75rem 0.9rem",
  background: "#2d2d30",
  color: "#f3f4f6",
  textDecoration: "none",
  borderRadius: "6px",
  border: "1px solid #3c3c3c",
  fontSize: "0.95rem",
  fontWeight: "600",
  boxShadow: "none",
  transform: "translateY(0)",
  transition:
    "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
};

function activateResourceLink(target) {
  target.style.background = "#333842";
  target.style.borderColor = "#60a5fa";
  target.style.boxShadow = "0 8px 20px rgba(96, 165, 250, 0.18)";
  target.style.transform = "translateY(-1px)";
}

function resetResourceLink(target) {
  target.style.background = defaultResourceLinkStyle.background;
  target.style.borderColor = "#3c3c3c";
  target.style.boxShadow = defaultResourceLinkStyle.boxShadow;
  target.style.transform = defaultResourceLinkStyle.transform;
}

function pressResourceLink(target) {
  target.style.transform = "translateY(1px)";
  target.style.boxShadow = "0 3px 10px rgba(96, 165, 250, 0.12)";
}

function ResourceLink({ link }) {
  const sharedProps = {
    style: defaultResourceLinkStyle,
    onFocus: (e) => activateResourceLink(e.currentTarget),
    onBlur: (e) => resetResourceLink(e.currentTarget),
    onMouseEnter: (e) => activateResourceLink(e.currentTarget),
    onMouseLeave: (e) => resetResourceLink(e.currentTarget),
    onMouseDown: (e) => pressResourceLink(e.currentTarget),
    onMouseUp: (e) => activateResourceLink(e.currentTarget),
  };
  const content = (
    <>
      <span>{link.label}</span>
      <span aria-hidden="true" style={{ color: "#93c5fd" }}>
        Open
      </span>
    </>
  );

  if (link.to) {
    return (
      <Link to={link.to} {...sharedProps}>
        {content}
      </Link>
    );
  }

  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" {...sharedProps}>
      {content}
    </a>
  );
}

function TCGRules() {
  const [selectedGameName, setSelectedGameName] = useState(null);
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const resourcePanelRef = useRef(null);
  const games = [
    {
      name: "Pokemon TCG",
      image: pokemon,
      description: "Rulebook, tournament resources, and the official card database for checking exact card details.",
      links: [
        { label: "Turn Format", to: "/turn-format/pokemon" },
        { label: "Player Layout", to: "/player-layout/pokemon" },
        {
          label: "Rulebook",
          url: "https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/cri_rulebook_en.pdf",
        },
        { label: "Card Database", url: "https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/" },
      ],
    },
    {
      name: "Magic: The Gathering",
      image: mtg,
      description: "Official basic rules, comprehensive rules, formats, and card lookup resources from Wizards.",
      links: [
        { label: "Turn Format", to: "/turn-format/mtg" },
        { label: "Player Layout", to: "/player-layout/mtg" },
        { label: "Rulebook", url: "https://media.wizards.com/2026/downloads/MagicCompRules%2020260417.pdf" },
        { label: "Card Database", url: "https://gatherer.wizards.com/" },
      ],
    },
    {
      name: "One Piece TCG",
      image: onepiece,
      description: "Official manuals, comprehensive rules, Q&A, errata, and card search for the Bandai card game.",
      links: [
        { label: "Turn Format", to: "/turn-format/onepiece" },
        { label: "Player Layout", to: "/player-layout/onepiece" },
        { label: "Rulebook", url: "https://en.onepiece-cardgame.com/pdf/rule_manual.pdf?20230623" },
        { label: "Card Database", url: "https://en.onepiece-cardgame.com/cardlist/" },
      ],
    },
  ];

  const pageStyles = {
    fontFamily: "Inter, system-ui, Arial",
    minHeight: "100vh",
    background: "#1e1e1e",
    color: "#d4d4d4",
    padding: "2rem",
  };

  const panelStyles = {
    background: "#252526",
    border: "1px solid #3c3c3c",
    borderRadius: "8px",
  };
  const selectedGame = games.find((game) => game.name === selectedGameName);

  function getScrollBehavior() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const syncNarrowScreen = () => setIsNarrowScreen(mediaQuery.matches);

    syncNarrowScreen();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", syncNarrowScreen);
    } else {
      mediaQuery.addListener(syncNarrowScreen);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", syncNarrowScreen);
      } else {
        mediaQuery.removeListener(syncNarrowScreen);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedGameName || !isNarrowScreen) return;

    const animationFrame = window.requestAnimationFrame(() => {
      resourcePanelRef.current?.scrollIntoView({
        block: "start",
        behavior: getScrollBehavior(),
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isNarrowScreen, selectedGameName]);

  function showSelectedResources() {
    resourcePanelRef.current?.scrollIntoView({ block: "start", behavior: getScrollBehavior() });
  }

  return (
    <main style={pageStyles}>
      <div style={{ maxWidth: "900px", marginInline: "auto" }}>
        <Link
          className="dojo-text-link"
          to="/"
          style={{
            display: "inline-block",
            marginBottom: "2rem",
            textDecoration: "none",
            fontSize: "0.95rem",
          }}
        >
          &larr; Back to Home
        </Link>

        <h1 style={{ color: "#f3f4f6", marginBottom: "1rem", fontSize: "2rem" }}>
          TCG Rules and Card Resources
        </h1>

        <p style={{ color: "#a6a6a6", marginBottom: "1.5rem", maxWidth: "720px", lineHeight: 1.6 }}>
          DojoTCG helps identify cards and compare likely matches. For gameplay, legality, errata, and rulings,
          use the official sources below so the app does not quietly drift out of date.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1.5rem",
            marginBottom: selectedGame ? "1.5rem" : 0,
          }}
        >
          {games.map((game) => {
            const isSelected = game.name === selectedGameName;

            return (
              <button
                key={game.name}
                type="button"
                aria-pressed={isSelected}
                aria-label={`Select ${game.name}`}
                onClick={() => setSelectedGameName(game.name)}
                style={{
                  ...panelStyles,
                  height: isSelected ? "220px" : "180px",
                  padding: "0.75rem",
                  overflow: "hidden",
                  background: "#1e1e1e",
                  borderColor: isSelected ? "#60a5fa" : "#3c3c3c",
                  boxShadow: isSelected ? "0 14px 34px rgba(96, 165, 250, 0.22)" : "none",
                  transform: isSelected ? "translateY(-2px)" : "translateY(0)",
                  transition:
                    "height 180ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "#60a5fa";
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(96, 165, 250, 0.15)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = "#3c3c3c";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "translateY(1px)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = isSelected ? "translateY(-2px)" : "translateY(-1px)";
                }}
              >
                <img
                  src={game.image}
                  alt={game.name}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              </button>
            );
          })}
        </div>

        {selectedGame && isNarrowScreen && (
          <button
            type="button"
            aria-label={`Show ${selectedGame.name} resources`}
            onClick={showSelectedResources}
            style={{
              width: "100%",
              margin: "0 0 1rem",
              padding: "0.65rem",
              borderRadius: "8px",
              background: "#2d2d30",
              border: "1px solid #60a5fa",
              color: "#bfdbfe",
              boxShadow: "0 8px 20px rgba(96, 165, 250, 0.14)",
              fontSize: "1.15rem",
              lineHeight: 1,
            }}
          >
            &darr;
          </button>
        )}

        {selectedGame && (
          <section
            ref={resourcePanelRef}
            style={{
              ...panelStyles,
              padding: "1.5rem",
              boxShadow: "0 14px 34px rgba(0, 0, 0, 0.22)",
            }}
          >
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ textAlign: "left" }}>
                <h2 style={{ margin: "0 0 0.5rem", color: "#f3f4f6", fontSize: "1.4rem" }}>
                  {selectedGame.name}
                </h2>
                <p style={{ margin: 0, color: "#a6a6a6", fontSize: "0.95rem", lineHeight: 1.5 }}>
                  {selectedGame.description}
                </p>
              </div>
            </div>

            <div style={{ display: "grid", gap: "0.65rem" }}>
              {selectedGame.links.map((link) => (
                <ResourceLink key={link.url || link.to} link={link} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default TCGRules;
