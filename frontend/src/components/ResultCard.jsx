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
        Card matched with {result.accuracy?.toFixed(1) || result.overallAccuracy?.toFixed(1) || "Unknown"}% accuracy.
      </h2>
      <p><strong>Game:</strong> {result.game}</p>
      <p><strong>Game Confidence:</strong> {result.gameConfidence?.toFixed(1) || "Unknown"}%</p>
      <p><strong>Name:</strong> {result.name || "Unknown"}</p>
      <p><strong>Name Confidence:</strong> {result.nameConfidence?.toFixed(1) || "Unknown"}%</p>
      <p><strong>Collector Number:</strong> {result.collectorNumber || "Unknown"}</p>
      <p><strong>Collector Number Confidence:</strong> {result.collectorNumberConfidence?.toFixed(1) || "Unknown"}%</p>
      <p><strong>Set Code:</strong> {result.setCode || "Unknown"}</p>
      <p><strong>Set Name:</strong> {result.setName || "Unknown"}</p>
      <p><strong>Set Confidence:</strong> {result.setConfidence?.toFixed(1) || "Unknown"}%</p>
      <p><strong>Printed Total:</strong> {result.printedTotal || "Unknown"}</p>
      <p><strong>Language:</strong> {result.language || "Unknown"}</p>
      <p><strong>Rarity:</strong> {result.rarity || "Unknown"}</p>
      <p><strong>Foil Treatment:</strong> {result.foilTreatment || "Unknown"}</p>
      <p><strong>Card Type:</strong> {result.cardType || "Unknown"}</p>
      <p><strong>Copyright Year:</strong> {result.copyrightYear || "Unknown"}</p>
      <p><strong>Visible Text:</strong> {result.visibleText.join(", ") || "Unknown"}</p>
      <p><strong>Uncertain Fields:</strong> {result.uncertainFields.join(", ") || "Unknown"}</p>
      <p><strong>Overall Accuracy:</strong> {result.overallAccuracy?.toFixed(1) || "Unknown"}%</p>
      <p><strong>Card ID:</strong> {result.cardID || "Unknown"}</p>
      <p><strong>Notes:</strong> {result.notes || "None"}</p>
    </div>
  );
}

export default ResultCard;
