import React from "react";

function formatPrice(price) {
  return typeof price === "number" ? `$${price.toFixed(2)}` : "No price";
}

function getRegionalPrices(candidate) {
  const prices = candidate.regionalPrices;

  if (!prices) {
    return {
      us: candidate.lowestPrice,
      jp: null,
      kr: null,
    };
  }

  return prices;
}

function RegionPrice({ countryCode, label, price }) {
  return (
    <span title={label} aria-label={`${label} ${formatPrice(price)}`}>
      <img
        src={`https://flagcdn.com/${countryCode}.svg`}
        alt=""
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "1.15em",
          height: "1.15em",
          marginRight: "0.25rem",
          verticalAlign: "-0.18em",
          borderRadius: "2px",
        }}
      />
      {formatPrice(price)}
    </span>
  );
}

function CandidateMatches({ candidates = [], error, searchQuery }) {
  return (
    <section style={{ marginTop: "2rem", textAlign: "left", maxWidth: "720px", marginInline: "auto", color: "#d4d4d4" }}>
      <h2 style={{ color: "#f3f4f6" }}>Candidate Matches</h2>

      {searchQuery && (
        <p style={{ color: "#a6a6a6" }}>
          Search: {searchQuery}
        </p>
      )}

      {error && (
        <p style={{ color: "#fca5a5" }}>
          JustTCG error: {error}
        </p>
      )}

      {!error && candidates.length === 0 && (
        <p>No JustTCG candidates found.</p>
      )}

      {candidates.map((candidate) => {
        const regionalPrices = getRegionalPrices(candidate);

        return (
          <article
            key={candidate.id}
            style={{
              border: "1px solid #3c3c3c",
              borderRadius: "8px",
              padding: "1rem",
              marginTop: "0.75rem",
              background: "#252526",
              color: "#d4d4d4",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "1rem" }}>
              <div style={{ minWidth: 0 }}>
                <div>
                  <strong>{candidate.name}</strong>
                </div>

                <p style={{ margin: "0.5rem 0" }}>
                  {candidate.game} / {candidate.set || "Unknown set"} / #{candidate.number || "N/A"}
                </p>

                <p style={{ margin: "0.5rem 0" }}>
                  {candidate.rarity || "Unknown rarity"}
                </p>

                <p style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
                  <RegionPrice countryCode="us" label="US" price={regionalPrices.us} />
                  <span aria-hidden="true">/</span>
                  <RegionPrice countryCode="jp" label="JP" price={regionalPrices.jp} />
                  <span aria-hidden="true">/</span>
                  <RegionPrice countryCode="kr" label="KOR" price={regionalPrices.kr} />
                </p>

                {candidate.imageSource && (
                  <p style={{ margin: "0.5rem 0", color: "#a6a6a6", fontSize: "0.9rem" }}>
                    Image: {candidate.imageSource}
                  </p>
                )}

                {candidate.matchReasons?.length > 0 && (
                  <p style={{ margin: 0, color: "#a6a6a6" }}>
                    Matched on: {candidate.matchReasons.join(", ")}
                  </p>
                )}
              </div>

              <div style={{ textAlign: "right" }}>
                <span>{candidate.matchScore?.toFixed(1)}% match</span>

                {candidate.imageUrl && (
                  <img
                    src={candidate.imageUrl}
                    alt={candidate.name}
                    loading="lazy"
                    style={{
                      display: "block",
                      width: "88px",
                      marginTop: "0.5rem",
                      marginLeft: "auto",
                      borderRadius: "6px",
                      boxShadow: "0 4px 12px rgba(15,23,42,0.18)",
                    }}
                  />
                )}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export default CandidateMatches;
