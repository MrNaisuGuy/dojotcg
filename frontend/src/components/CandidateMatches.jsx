import React from "react";

function formatPrice(price) {
  return typeof price === "number" ? `$${price.toFixed(2)}` : "No price";
}

function CandidateMatches({ candidates = [], error, searchQuery }) {
  return (
    <section style={{ marginTop: "2rem", textAlign: "left", maxWidth: "720px", marginInline: "auto" }}>
      <h2>Candidate Matches</h2>

      {searchQuery && (
        <p style={{ color: "#475569" }}>
          Search: {searchQuery}
        </p>
      )}

      {error && (
        <p style={{ color: "#b91c1c" }}>
          JustTCG error: {error}
        </p>
      )}

      {!error && candidates.length === 0 && (
        <p>No JustTCG candidates found.</p>
      )}

      {candidates.map((candidate) => (
        <article
          key={candidate.id}
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            padding: "1rem",
            marginTop: "0.75rem",
            background: "white",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <strong>{candidate.name}</strong>
            <span>{candidate.matchScore}% match</span>
          </div>

          <p style={{ margin: "0.5rem 0" }}>
            {candidate.game} / {candidate.set || "Unknown set"} / #{candidate.number || "N/A"}
          </p>

          <p style={{ margin: "0.5rem 0" }}>
            {candidate.rarity || "Unknown rarity"} / {formatPrice(candidate.lowestPrice)}
          </p>

          {candidate.matchReasons?.length > 0 && (
            <p style={{ margin: 0, color: "#475569" }}>
              Matched on: {candidate.matchReasons.join(", ")}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

export default CandidateMatches;
