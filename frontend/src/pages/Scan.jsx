import React, { useState } from "react";
import { analyzeCard } from "../services/cardServices.js";
import ResultCard from "../components/ResultCard.jsx";
import CandidateMatches from "../components/CandidateMatches.jsx";
import CardCarousel from "../components/CardCarousel.jsx";
import mtg from "../assets/mtg.png";
import pokemon from "../assets/pokemon.png";
import onepiece from "../assets/onepiece.png";

function Scan() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isMobile] = useState(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  function handleImageUpload(event) {
    setShowResult(false);

    const file = event.target.files[0];
    
    if (!file) return;

    setResult(null);
    setLoading(false);
    setFileName(file.name);
    setSelectedFile(file);

    const imageUrl = URL.createObjectURL(file);

    setSelectedImage(imageUrl);
  }

  async function handleAnalyze() {
    if (!selectedFile) {
      alert("Please upload a card image first.");
      return;
    }

    try {
      setLoading(true);
      setShowResult(false);

      const data = await analyzeCard(selectedFile);

      setResult(data);
      setShowResult(true);
    } catch (error) {
      console.error(error);
      alert(`Analyze failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
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
            <button onClick={handleAnalyze} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze Card"}
            </button>
          </div>
        </div>
      )}

      {loading && 
        <CardCarousel
          images={[mtg, pokemon, onepiece]}
        />
      }
      
      {showResult && result && (
        <>
          <ResultCard result={result.visionGuess || result} />
          <CandidateMatches
            candidates={result.candidates || result.justtcgMatches}
            error={result.justtcgError}
            searchQuery={result.justtcgSearchQuery}
          />
        </>
      )}
      
    </main>
  );
}

export default Scan;
