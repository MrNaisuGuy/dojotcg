import React, { useState } from "react";

function formatPrice(price) {
  return typeof price === "number" && price > 0
    ? `$${price.toFixed(2)}`
    : "No price";
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

function getPriceFreshnessText(candidate, regionalPrices) {
  const basePrice =
    candidate.lowestPrice ??
    regionalPrices?.basePrice ??
    regionalPrices?.us;

  if (typeof basePrice !== "number" || basePrice <= 0) {
    return "No price data";
  }

  if (!candidate.priceUpdatedAt) {
    return "Price data age unavailable";
  }

  const updatedAt = new Date(candidate.priceUpdatedAt);

  if (Number.isNaN(updatedAt.getTime())) {
    return "Price data age unavailable";
  }

  const elapsedMs = Date.now() - updatedAt.getTime();
  const elapsedDays = Math.floor(
    elapsedMs / (24 * 60 * 60 * 1000)
  );

  if (elapsedDays < 1) {
    return "Price data is less than a day old";
  }

  return `Price data is ${elapsedDays} ${
    elapsedDays === 1 ? "day" : "days"
  } old`;
}

const VERIFICATION_COLORS = {
  raw_exact: "#22c55e",
  normalized_exact: "#86efac",
  close: "#facc15",
  review: "#a6a6a6",
  missing: "#a6a6a6",
  conflict: "#fca5a5",
};

function getVerification(candidate, field, fallbackLabel = "Review", fallbackStatus = "review") {
  return candidate.fieldVerification?.[field] || {
    label: fallbackLabel,
    status: fallbackStatus,
  };
}

function MatchCheck({ label, verification }) {
  const color = VERIFICATION_COLORS[verification.status] || "#a6a6a6";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.28rem 0",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        fontSize: "0.78rem",
        textAlign: "left",
      }}
    >
      <span style={{ color: "#e5e7eb", textAlign: "left" }}>
        {label}
      </span>

      <span
        style={{
          color,
          fontWeight: 800,
        }}
      >
        {verification.label}
      </span>
    </div>
  );
}

function PriceRow({ countryCode, label, value }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "1.22em",
          height: "1.22em",
          borderRadius: "2px",
          boxSizing: "border-box",
          overflow: "hidden",
          boxShadow: "0 0 10px rgba(124, 58, 237, 0.58)",
        }}
      >
        <img
          src={`https://flagcdn.com/${countryCode}.svg`}
          alt=""
          aria-hidden="true"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </span>

      <span style={{ color: "#a6a6a6" }}>{label}</span>

      <strong style={{ color: "#f3f4f6" }}>
        {formatPrice(value)}
      </strong>
    </span>
  );
}

function CandidateCard({ candidate, isBest }) {
  const [showDetails, setShowDetails] = useState(false);

  const regionalPrices = getRegionalPrices(candidate);

  const priceFreshnessText = getPriceFreshnessText(
    candidate,
    regionalPrices
  );

  const score =
    typeof candidate.matchScore === "number"
      ? candidate.matchScore <= 1
        ? candidate.matchScore * 100
        : candidate.matchScore
      : null;
  const nameVerification = getVerification(candidate, "name");
  const numberVerification = getVerification(candidate, "number");
  const rarityVerification = getVerification(candidate, "rarity", candidate.rarity ? "Review" : "Missing", candidate.rarity ? "review" : "missing");
  const variantVerification = getVerification(candidate, "variant", candidate.priceVariant ? "Review" : "Missing", candidate.priceVariant ? "review" : "missing");

  return (
    <article
      style={{
        position: "relative",
        overflow: "hidden",
        border: isBest
          ? "1px solid rgba(124, 58, 237, 0.72)"
          : "1px solid #3c3c3c",
        borderRadius: "8px",
        padding: "1rem",
        background:
          "linear-gradient(180deg, #111217 0%, #1f1f27 100%)",
        color: "#f3f4f6",
        boxShadow: isBest
          ? "0 18px 42px rgba(124, 58, 237, 0.22)"
          : "0 10px 24px rgba(0, 0, 0, 0.22)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          height: "4px",
          background:
            "linear-gradient(90deg, #7c3aed, #22c55e)",
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <div>
          <p
            style={{
              margin: "0 0 0.4rem",
              color: "#a6a6a6",
              fontSize: "0.78rem",
            }}
          >
            Match Results
          </p>

          <h2
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 900,
            }}
          >
            {isBest ? "Best Match" : "Candidate Match"}
          </h2>
        </div>

        <div
          style={{
            color: isBest ? "#22c55e" : "#a6a6a6",
            fontSize: "0.78rem",
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: 0,
          }}
        >
          {isBest ? "Selected" : "Review"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          justifyItems: "center",
          marginTop: "0.9rem",
          textAlign: "center",
        }}
      >
        <div>
          {candidate.imageUrl && (
            <img
              src={candidate.imageUrl}
              alt={candidate.name}
              loading="lazy"
              style={{
                display: "block",
                width: "112px",
                aspectRatio: "63 / 88",
                objectFit: "cover",
                borderRadius: "5px",
                boxShadow:
                  "0 8px 20px rgba(0, 0, 0, 0.42)",
              }}
            />
          )}
        </div>

        <div
          style={{
            minWidth: 0,
            maxWidth: "13rem",
            marginTop: "0.65rem",
            textAlign: "center",
          }}
        >
          <h3
            style={{
              margin: "0 0 0.3rem",
              fontSize: "1rem",
              color: "#ffffff",
              fontWeight: 900,
              lineHeight: 1.2,
            }}
          >
            {candidate.name}
          </h3>

          <p
            style={{
              margin: 0,
              color: "#d1d5db",
              fontSize: "0.8rem",
              lineHeight: 1.35,
            }}
          >
            {candidate.rarity || "Unknown rarity"}
          </p>

          <p
            style={{
              margin: "0.3rem 0 0",
              color: "#a6a6a6",
              fontSize: "0.78rem",
              lineHeight: 1.35,
            }}
          >
            {candidate.set || "Unknown set"}
          </p>

          <p
            style={{
              margin: "0.2rem 0 0",
              color: "#a6a6a6",
              fontSize: "0.78rem",
            }}
          >
            {candidate.number
              ? `#${candidate.number}`
              : "#N/A"}
          </p>
        </div>
      </div>

      <div style={{ marginTop: "0.9rem", textAlign: "left" }}>
        <MatchCheck
          label="Name"
          verification={nameVerification}
        />

        <MatchCheck
          label="Number"
          verification={numberVerification}
        />

        <MatchCheck
          label="Rarity"
          verification={rarityVerification}
        />

        <MatchCheck
          label="Variant"
          verification={variantVerification}
        />
      </div>

      <p
        style={{
          margin: "0.8rem 0 0",
          color:
            priceFreshnessText === "No price data"
              ? "#fca5a5"
              : "#a6a6a6",
          fontSize: "0.78rem",
          textAlign: "center",
        }}
      >
        {priceFreshnessText}
      </p>

      <div
        style={{
          display: "flex",
          gap: "0.65rem",
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: "0.8rem",
          fontSize: "0.8rem",
          textAlign: "center",
        }}
      >
        <PriceRow
          countryCode="us"
          label="US"
          value={regionalPrices.us}
        />

        <PriceRow
          countryCode="jp"
          label="JP est."
          value={regionalPrices.jp}
        />

        <PriceRow
          countryCode="kr"
          label="KOR est."
          value={regionalPrices.kr}
        />
      </div>

      <button
        type="button"
        onClick={() =>
          setShowDetails((current) => !current)
        }
        style={{
          width: "100%",
          marginTop: "0.85rem",
          padding: "0.6rem",
          borderRadius: "6px",
          background: "#5b21b6",
          color: "#ffffff",
          fontSize: "0.82rem",
          boxShadow:
            "0 8px 18px rgba(91, 33, 182, 0.28)",
        }}
      >
        {showDetails
          ? "Hide Details"
          : "View Details"}
      </button>

      {showDetails && (
        <div
          style={{
            marginTop: "0.8rem",
            color: "#a6a6a6",
            fontSize: "0.78rem",
            lineHeight: 1.5,
          }}
        >
          {(candidate.priceVariant || candidate.priceUpdatedAt) && (
            <p style={{ margin: "0 0 0.45rem" }}>
              Price
              {candidate.priceVariant ? `: ${candidate.priceVariant}` : ""}
              {candidate.priceUpdatedAt
                ? ` / updated ${candidate.priceUpdatedAt}`
                : ""}
            </p>
          )}

          {candidate.imageSource && (
            <p style={{ margin: "0 0 0.45rem" }}>
              Image: {candidate.imageSource}
            </p>
          )}

          {candidate.dataSource && (
            <p style={{ margin: "0 0 0.45rem" }}>
              Data: {candidate.dataSource}
            </p>
          )}

          {candidate.matchReasons?.length > 0 && (
            <p style={{ margin: "0 0 0.45rem" }}>
              Matched on:{" "}
              {candidate.matchReasons.join(", ")}
            </p>
          )}

          {score !== null && (
            <p style={{ margin: 0 }}>
              Internal rank score: {score.toFixed(0)}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function formatMatchTarget(matchTarget) {
  if (!matchTarget) return null;

  return [
    matchTarget.printedTotal || "unknown",
    matchTarget.number || "unknown",
    matchTarget.name || "unknown",
    matchTarget.game || "unknown",
  ].join(" | ");
}

function normalizeCandidateKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCandidateDisplayKey(candidate) {
  if (candidate.id) {
    return `id:${candidate.id}`;
  }

  if (candidate.externalId) {
    return `external_id:${normalizeCandidateKeyPart(
      candidate.externalId
    )}`;
  }

  const game = normalizeCandidateKeyPart(candidate.game);
  const setId = normalizeCandidateKeyPart(candidate.setId);
  const number = normalizeCandidateKeyPart(candidate.number);
  const language = normalizeCandidateKeyPart(
    candidate.language || "unknown"
  );
  const name = normalizeCandidateKeyPart(candidate.name);

  if (game && setId && number) {
    return `game_set_number_language:${game}:${setId}:${number}:${language}`;
  }

  if (game && name && setId && number) {
    return `game_name_set_number:${game}:${name}:${setId}:${number}`;
  }

  return `fallback:${game}:${name}:${number}`;
}

function dedupeDisplayCandidates(candidates) {
  const seen = new Set();

  return candidates.filter((candidate) => {
    const key = getCandidateDisplayKey(candidate);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function CandidateMatches({
  candidates = [],
  error,
  searchQuery,
  matchTarget,
}) {
  const matchTargetText = formatMatchTarget(matchTarget);

  const displayCandidates =
    dedupeDisplayCandidates(candidates);

  return (
    <section
      style={{
        marginTop: "2rem",
        maxWidth: "760px",
        marginInline: "auto",
        color: "#d4d4d4",
      }}
    >
      {searchQuery && (
        <p
          style={{
            color: "#a6a6a6",
            textAlign: "left",
            fontSize: "0.85rem",
          }}
        >
          Lookup: {searchQuery}
        </p>
      )}

      {error && (
        <p
          style={{
            color: "#fca5a5",
            textAlign: "left",
          }}
        >
          Candidate lookup error: {error}
        </p>
      )}

      {!error && displayCandidates.length === 0 && (
        <div style={{ textAlign: "left" }}>
          <p>No candidates found.</p>

          {matchTargetText && (
            <p
              style={{
                color: "#a6a6a6",
                fontSize: "0.85rem",
                lineHeight: 1.5,
              }}
            >
              Trying to match: {matchTargetText}
            </p>
          )}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(230px, 1fr))",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        {displayCandidates.map((candidate, index) => (
          <CandidateCard
            key={getCandidateDisplayKey(candidate)}
            candidate={candidate}
            isBest={index === 0}
          />
        ))}
      </div>
    </section>
  );
}

export default CandidateMatches;
