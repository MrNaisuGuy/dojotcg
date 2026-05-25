import React from "react";
import { Link, Navigate, useParams } from "react-router-dom";

const boardStyles = `
  .player-layout-page {
    min-height: 100vh;
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 2rem;
    font-family: Inter, system-ui, Arial;
  }

  .player-layout-shell {
    max-width: 980px;
    margin-inline: auto;
  }

  .player-layout-title {
    color: #f3f4f6;
    margin: 0 0 1rem;
    font-size: 2rem;
  }

  .player-layout-frame {
    background: #252526;
    border: 1px solid #3c3c3c;
    border-radius: 8px;
    padding: 1rem;
  }

  .player-layout-board {
    display: grid;
    grid-template-columns: repeat(12, minmax(56px, 1fr));
    grid-template-rows: repeat(7, minmax(58px, auto));
    gap: 0.75rem;
    width: 100%;
    min-width: 760px;
  }

  .player-layout-zone {
    display: grid;
    place-items: center;
    min-height: 64px;
    padding: 0.75rem;
    border-radius: 8px;
    color: #f3f4f6;
    font-weight: 800;
    text-align: center;
  }

  @media (max-width: 640px) {
    .player-layout-page {
      padding: 1rem;
    }

    .player-layout-title {
      font-size: 1.35rem;
      line-height: 1.2;
    }

    .player-layout-frame {
      padding: 0.5rem;
    }

    .player-layout-board {
      min-width: 0;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-template-rows: repeat(7, minmax(34px, auto));
      gap: 0.35rem;
    }

    .player-layout-zone {
      min-height: 36px;
      padding: 0.25rem;
      border-radius: 5px;
      font-size: 0.58rem;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }
  }
`;

const layouts = {
  pokemon: {
    title: "Pokemon TCG Player Layout",
    deckSize: "60 cards",
    deckZoneLabel: "Deck",
    sourceUrl:
      "https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/rulebook/cri_rulebook_en.pdf",
    zones: [
      { label: "Prize Cards", gridColumn: "1 / span 2", gridRow: "2 / span 4", tone: "blue" },
      { label: "Bench", gridColumn: "4 / span 6", gridRow: "2 / span 1", tone: "green" },
      { label: "Active Pokemon", gridColumn: "5 / span 4", gridRow: "4 / span 1", tone: "yellow" },
      { label: "Stadium", gridColumn: "5 / span 4", gridRow: "5 / span 1", tone: "purple" },
      { label: "Deck", gridColumn: "11 / span 2", gridRow: "2 / span 2", tone: "gray" },
      { label: "Discard Pile", gridColumn: "11 / span 2", gridRow: "5 / span 2", tone: "red" },
      { label: "Hand", gridColumn: "4 / span 6", gridRow: "7 / span 1", tone: "gray" },
    ],
  },
  mtg: {
    title: "Magic: The Gathering Player Layout",
    deckSize: "60+ cards",
    deckZoneLabel: "Library",
    sourceUrl: "https://media.wizards.com/2026/downloads/MagicCompRules%2020260417.pdf",
    zones: [
      { label: "Battlefield", gridColumn: "3 / span 8", gridRow: "2 / span 3", tone: "green" },
      { label: "Lands", gridColumn: "3 / span 8", gridRow: "5 / span 1", tone: "yellow" },
      { label: "Library", gridColumn: "11 / span 2", gridRow: "2 / span 2", tone: "gray" },
      { label: "Graveyard", gridColumn: "11 / span 2", gridRow: "5 / span 1", tone: "red" },
      { label: "Exile", gridColumn: "11 / span 2", gridRow: "6 / span 1", tone: "purple" },
      { label: "Stack", gridColumn: "1 / span 2", gridRow: "3 / span 2", tone: "blue" },
      { label: "Hand", gridColumn: "3 / span 8", gridRow: "7 / span 1", tone: "gray" },
    ],
  },
  onepiece: {
    title: "One Piece TCG Player Layout",
    deckSize: "50 cards",
    deckZoneLabel: "Deck",
    sourceUrl: "https://en.onepiece-cardgame.com/pdf/rule_manual.pdf?20230623",
    zones: [
      { label: "Character Area", gridColumn: "4 / span 6", gridRow: "2 / span 2", tone: "green" },
      { label: "Leader", gridColumn: "1 / span 2", gridRow: "3 / span 2", tone: "red" },
      { label: "Stage", gridColumn: "1 / span 2", gridRow: "5 / span 1", tone: "purple" },
      { label: "Life", gridColumn: "1 / span 2", gridRow: "1 / span 1", tone: "yellow" },
      { label: "Deck", gridColumn: "11 / span 2", gridRow: "2 / span 2", tone: "gray" },
      { label: "Trash", gridColumn: "11 / span 2", gridRow: "5 / span 1", tone: "red" },
      { label: "DON!! Deck", gridColumn: "11 / span 2", gridRow: "6 / span 1", tone: "blue" },
      { label: "Cost Area", gridColumn: "4 / span 6", gridRow: "5 / span 1", tone: "blue" },
      { label: "Hand", gridColumn: "4 / span 6", gridRow: "7 / span 1", tone: "gray" },
    ],
  },
};

const tones = {
  blue: { background: "rgba(96, 165, 250, 0.16)", border: "rgba(96, 165, 250, 0.72)" },
  green: { background: "rgba(74, 222, 128, 0.14)", border: "rgba(74, 222, 128, 0.62)" },
  gray: { background: "rgba(148, 163, 184, 0.13)", border: "rgba(148, 163, 184, 0.52)" },
  purple: { background: "rgba(167, 139, 250, 0.15)", border: "rgba(167, 139, 250, 0.64)" },
  red: { background: "rgba(248, 113, 113, 0.14)", border: "rgba(248, 113, 113, 0.62)" },
  yellow: { background: "rgba(250, 204, 21, 0.14)", border: "rgba(250, 204, 21, 0.62)" },
};

function Zone({ deckSize, deckZoneLabel, zone }) {
  const tone = tones[zone.tone] || tones.gray;
  const showDeckSize = zone.label === deckZoneLabel && deckSize;

  return (
    <div
      className="player-layout-zone"
      style={{
        gridColumn: zone.gridColumn,
        gridRow: zone.gridRow,
        border: `1px solid ${tone.border}`,
        background: tone.background,
      }}
    >
      <span>{zone.label}</span>
      {showDeckSize && (
        <span style={{ display: "block", marginTop: "0.2rem", fontSize: "0.82em", fontWeight: 600 }}>
          (Deck Size: {deckSize})
        </span>
      )}
    </div>
  );
}

function PlayerLayout() {
  const { game } = useParams();
  const layout = layouts[game];

  if (!layout) {
    return <Navigate to="/tcg-rules" replace />;
  }

  return (
    <main className="player-layout-page">
      <style>{boardStyles}</style>
      <div className="player-layout-shell">
        <Link
          className="dojo-text-link"
          to="/tcg-rules"
          style={{
            display: "inline-block",
            marginBottom: "2rem",
            textDecoration: "none",
            fontSize: "0.95rem",
          }}
        >
          &larr; Back to Rules
        </Link>

        <h1 className="player-layout-title">{layout.title}</h1>

        <div
          className="player-layout-frame"
          role="img"
          aria-label={`${layout.title} diagram`}
        >
          <div className="player-layout-board">
            {layout.zones.map((zone) => (
              <Zone key={zone.label} deckSize={layout.deckSize} deckZoneLabel={layout.deckZoneLabel} zone={zone} />
            ))}
          </div>
        </div>

        <a
          className="dojo-text-link"
          href={layout.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: "1rem",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Open official rulebook
        </a>
      </div>
    </main>
  );
}

export default PlayerLayout;
