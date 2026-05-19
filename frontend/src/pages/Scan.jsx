import React, { useState } from "react";
import { analyzeCard } from "../services/cardServices.js";
import ResultCard from "../components/ResultCard.jsx";
import dojobird from "../assets/dojobird.png"; // delete later

function Scan() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [resultImage, setResultImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  function handleImageUpload(event) {
    const file = event.target.files[0];
    
    if (!file) return;

    setResult(null);
    setLoading(false);
    setFileName(file.name);

    const imageUrl = URL.createObjectURL(file);

    setSelectedImage(imageUrl);

    // const data = await analyzeCard();

    setResult(data);
    setLoading(false);
  }

  async function handleAnalyze() {
    setLoading(true);

    const data = await analyzeCard();

    setResult(data);
    setLoading(false);
  }

  return (
    <main style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Scan Card</h1>
      <p>
         <label
          htmlFor="card-upload"
          style={{
            display: "inline-block",
            padding: "1rem 2rem",
            background: "#2563eb",
            color: "white",
            borderRadius: "12px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
         >
          {isMobile ? "Take a picture of your card." : "Upload a card image to analyze it."}
         </label>
      </p>

      <input id="card-upload" type="file" accept="image/*" capture={isMobile ? "environment" : undefined} onChange={handleImageUpload} style={{display: "none"}}/>
      
      {selectedImage && (
        <div style={{ marginTop: "2rem" }}>
          <p>Card Preview</p>

          <img
            src={selectedImage}
            alt="Selected card"
            style={{
              maxWidth: "300px",
              width: "100%",
              borderRadius: "12px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
            }}
          />

          <div style={{ marginTop: "1rem" }}>
            <button onClick={handleAnalyze}>Analyze Card</button>
          </div>
        </div>
      )}

      {loading && <p>Analyzing card...</p>}
      <ResultCard result={result} />
      
    </main>
  );
}

export default Scan;