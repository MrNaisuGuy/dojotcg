import React, { useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

const turnFormats = {
  pokemon: {
    title: "Pokemon TCG Turn Format",
    steps: [
      { id: "draw", label: "Draw a card", helper: "Take the top card of your deck and add it to your hand.", required: true },
      { id: "bench", label: "Play Basic Pokemon to the Bench", helper: "Put any Basic Pokemon you want ready for later onto your Bench." },
      { id: "evolve", label: "Evolve eligible Pokemon", helper: "If a Pokemon is ready to evolve, place its evolution card on top." },
      { id: "energy", label: "Attach one Energy card", helper: "Choose one Pokemon and give it one Energy from your hand." },
      { id: "trainers", label: "Play Trainer cards", helper: "Use Item, Supporter, Tool, or Stadium cards that help your turn." },
      { id: "retreat", label: "Retreat your Active Pokemon", helper: "Pay the retreat cost if you want to swap your Active Pokemon with one on the Bench." },
      { id: "ability", label: "Use available Abilities", helper: "Check your Pokemon for special powers you can use before attacking." },
      { id: "attack", label: "Attack or pass", helper: "Pick an attack you can pay for, or decide not to attack.", required: true, endsTurn: true },
    ],
  },
  mtg: {
    title: "Magic: The Gathering Turn Format",
    steps: [
      { id: "untap", label: "Untap", helper: "Turn your tapped cards upright so they are ready again.", required: true },
      { id: "upkeep", label: "Upkeep", helper: "Handle anything that says it happens at the beginning of your turn.", required: true },
      { id: "draw", label: "Draw", helper: "Draw one card from your library.", required: true },
      { id: "main-1", label: "First main phase", helper: "Play a land if you can and cast spells before combat." },
      { id: "combat", label: "Combat phase", helper: "Choose attackers, let blockers happen, and deal combat damage." },
      { id: "main-2", label: "Second main phase", helper: "Cast more spells or play your land if you saved it." },
      { id: "end", label: "End", helper: "Resolve anything that says it happens at the end of the turn.", required: true },
      { id: "cleanup", label: "Cleanup", helper: "Discard down to maximum hand size (usually 7 cards) and clear damage or until end of turn effects.", required: true, endsTurn: true },
    ],
  },
  onepiece: {
    title: "One Piece TCG Turn Format",
    steps: [
      { id: "refresh", label: "Refresh phase", helper: "Set your rested cards active and return attached DON!! cards as needed.", required: true },
      { id: "draw", label: "Draw phase", helper: "Draw one card from your deck.", required: true },
      { id: "don", label: "DON!! phase", helper: "Add DON!! cards so you have resources for the turn.", required: true },
      { id: "main-play", label: "Play cards", helper: "Use DON!! to play Characters, Events, or Stages from your hand." },
      { id: "main-attach", label: "Attach DON!! cards", helper: "Give DON!! cards to your Leader or Characters to make them stronger." },
      { id: "main-activate", label: "Activate effects", helper: "Use any card effects that are available during your main phase." },
      { id: "attack", label: "Attack or pass", helper: "Swing with your Leader or Characters, or skip attacking.", required: true, endsTurn: true },
    ],
  },
};

function TurnFormat() {
  const { game } = useParams();
  const swipeTrackRef = useRef(null);
  const format = turnFormats[game];
  const [completed, setCompleted] = useState({});
  const [isMobile] = useState(() =>
    typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  );
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);
  const [swipeActive, setSwipeActive] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [turnNumber, setTurnNumber] = useState(1);

  const requiredSteps = useMemo(() => format?.steps.filter((step) => step.required) || [], [format]);
  const canEndTurn = requiredSteps.every((step) => completed[step.id]);

  if (!format) {
    return <Navigate to="/tcg-rules" replace />;
  }

  function toggleStep(stepId) {
    setCompleted((current) => ({
      ...current,
      [stepId]: !current[stepId],
    }));
  }

  function endTurn() {
    if (!canEndTurn) return;

    setCompleted({});
    setIsWaitingForOpponent(true);
    setSwipeProgress(0);
  }

  function startNextTurn() {
    setIsWaitingForOpponent(false);
    setSwipeActive(false);
    setSwipeProgress(0);
    setTurnNumber((current) => current + 1);
  }

  function updateSwipeProgress(clientX) {
    const track = swipeTrackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const progress = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);

    setSwipeProgress(progress);
  }

  function handleSwipeStart(event) {
    setSwipeActive(true);
    updateSwipeProgress(event.clientX);
  }

  function handleSwipeMove(event) {
    if (!swipeActive) return;
    updateSwipeProgress(event.clientX);
  }

  function handleSwipeEnd() {
    if (!swipeActive) return;

    const completedSwipe = swipeProgress >= 0.82;

    if (completedSwipe) {
      startNextTurn();
      return;
    }

    setSwipeActive(false);
    setSwipeProgress(0);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#1e1e1e",
        color: "#d4d4d4",
        padding: "2rem",
        fontFamily: "Inter, system-ui, Arial",
      }}
    >
      <div style={{ maxWidth: "760px", marginInline: "auto" }}>
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

        <div
          style={{
            display: "flex",
            alignItems: "start",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <h1 style={{ color: "#f3f4f6", margin: "0 0 0.5rem", fontSize: "2rem" }}>{format.title}</h1>
            <p style={{ color: "#a6a6a6", margin: 0 }}>
              {isWaitingForOpponent
                ? "Your turn is finished. Wait for the other player before starting your next turn."
                : "Complete required steps, use optional steps as needed, then end the turn."}
            </p>
          </div>

          <div
            style={{
              padding: "0.65rem 0.85rem",
              background: "rgba(250, 204, 21, 0.14)",
              border: "1px solid rgba(250, 204, 21, 0.62)",
              borderRadius: "8px",
              color: "#fde68a",
              fontWeight: 800,
              boxShadow: "0 8px 22px rgba(250, 204, 21, 0.1)",
            }}
          >
            Turn {turnNumber}
          </div>
        </div>

        {isWaitingForOpponent ? (
          <section
            style={{
              background: "#252526",
              border: "1px solid #3c3c3c",
              borderRadius: "8px",
              padding: "1.5rem",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#a6a6a6", margin: "0 0 1rem", lineHeight: 1.5 }}>
              {isMobile ? "Swipe the slider when it's your turn again" : "Click below when it's your turn again"}
            </p>

            {isMobile ? (
              <div
                ref={swipeTrackRef}
                role="button"
                tabIndex={0}
                aria-label="Swipe when it is your turn again"
                onPointerDown={handleSwipeStart}
                onPointerMove={handleSwipeMove}
                onPointerUp={handleSwipeEnd}
                onPointerCancel={handleSwipeEnd}
                style={{
                  position: "relative",
                  width: "min(320px, 100%)",
                  height: "56px",
                  marginInline: "auto",
                  borderRadius: "999px",
                  background: "#1f3a2a",
                  border: "1px solid rgba(74, 222, 128, 0.55)",
                  overflow: "hidden",
                  touchAction: "none",
                  userSelect: "none",
                  boxShadow: "0 10px 24px rgba(74, 222, 128, 0.16)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${Math.max(swipeProgress * 100, 18)}%`,
                    background: "#16a34a",
                    transition: swipeActive ? "none" : "width 180ms ease",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    zIndex: 2,
                    top: "50%",
                    left: `calc(${swipeProgress * 100}% - ${swipeProgress * 48}px)`,
                    width: "44px",
                    height: "44px",
                    borderRadius: "999px",
                    background: "#ffffff",
                    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.28)",
                    display: "grid",
                    placeItems: "center",
                    transform: "translate(6px, -50%)",
                    transition: swipeActive ? "none" : "left 180ms ease",
                  }}
                >
                  <span
                    style={{
                      color: "#16a34a",
                      fontSize: "1.25rem",
                      lineHeight: 1,
                      fontWeight: 900,
                    }}
                  >
                    &rsaquo;
                  </span>
                </div>
                <span
                  style={{
                    position: "relative",
                    zIndex: 3,
                    display: "grid",
                    height: "100%",
                    placeItems: "center",
                    color: swipeProgress > 0.45 ? "#ffffff" : "#d4d4d4",
                    fontWeight: 800,
                  }}
                >
                  It's my turn.
                </span>
              </div>
            ) : (
              <button type="button" onClick={startNextTurn}>
                It's my turn.
              </button>
            )}
          </section>
        ) : (
          <>
            <section style={{ display: "grid", gap: "0.75rem" }}>
              {format.steps.map((step, index) => {
                const isComplete = Boolean(completed[step.id]);

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => toggleStep(step.id)}
                    style={{
                      justifyContent: "flex-start",
                      gap: "0.9rem",
                      width: "100%",
                      padding: "1rem",
                      borderRadius: "8px",
                      background: isComplete ? "#14532d" : "#252526",
                      border: `1px solid ${isComplete ? "#4ade80" : "#3c3c3c"}`,
                      color: "#f3f4f6",
                      boxShadow: isComplete ? "0 8px 18px rgba(74, 222, 128, 0.12)" : "none",
                      textAlign: "left",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: "2rem",
                        height: "2rem",
                        borderRadius: "999px",
                        background: isComplete ? "#4ade80" : "#2d2d30",
                        color: isComplete ? "#052e16" : "#d4d4d4",
                        flex: "0 0 auto",
                      }}
                    >
                      {isComplete ? "OK" : index + 1}
                    </span>

                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 800 }}>{step.label}</span>
                      <span
                        style={{
                          display: "block",
                          marginTop: "0.25rem",
                          color: "#c8c8c8",
                          fontSize: "0.92rem",
                          fontStyle: "italic",
                          lineHeight: 1.35,
                        }}
                      >
                        {step.helper}
                      </span>
                      <span style={{ display: "block", marginTop: "0.2rem", color: "#a6a6a6", fontSize: "0.9rem" }}>
                        {step.required ? "Required" : "Optional"}
                        {step.endsTurn ? " / turn-ending step" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>

            <button
              type="button"
              onClick={endTurn}
              disabled={!canEndTurn}
              style={{
                width: "100%",
                marginTop: "1.5rem",
                padding: "1rem",
                borderRadius: "8px",
              }}
            >
              End Turn
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default TurnFormat;
