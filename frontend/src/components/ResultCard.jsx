import React from "react";

function ResultCard({ result }) {
  if (!result) return null;

  return (
    <div style={{ marginTop: "2rem", color: "#d4d4d4" }}>
      {result.image && (
        <img
        src="/images/dojobird.png" // change to result.image later
        alt={`Image URL: ${result.image}`}
        style={{
            width: "120px",
            borderRadius: "10px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            marginBottom: "1rem",
        }}
        />
      )}

      <h1 className="text-3xl font-bold text-gray-100">Raw Scan Results</h1>
      <h2 className="text-xl font-semibold text-gray-200">
        Card matched with {result.accuracy}% accuracy.
      </h2>
      <p>Name: {result.card}</p>
      <p>Game: {result.game}</p>
      <p>Set: {result.set || "not matched"}</p>
      <p>Language: {result.language}</p>
      <p>Estimated Price: {result.price}</p>
    </div>
  );
}

export default ResultCard;
