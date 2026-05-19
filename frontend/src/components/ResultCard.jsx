import React from "react";

function ResultCard({ result }) {
  if (!result) return null;

  return (
    <div style={{ marginTop: "2rem" }}>
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

      <h2>Card matched with {result.accuracy}% accuracy.</h2>
      <p>Name: {result.name}</p>
      <p>Language: {result.language}</p>
      <p>Estimated Price: {result.price}</p>
    </div>
  );
}

export default ResultCard;
