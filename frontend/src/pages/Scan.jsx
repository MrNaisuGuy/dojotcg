import React, { useRef, useState } from "react";
import { analyzeCard } from "../services/cardServices.js";
import ResultCard from "../components/ResultCard.jsx";
import CandidateMatches from "../components/CandidateMatches.jsx";
import CardCarousel from "../components/CardCarousel.jsx";
import mtg from "../assets/mtg.png";
import pokemon from "../assets/pokemon.png";
import onepiece from "../assets/onepiece.png";

function Scan() {
  const swipeTrackRef = useRef(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isMobile] = useState(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  const [swipeActive, setSwipeActive] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);

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

  function updateSwipeProgress(clientX) {
    const track = swipeTrackRef.current;
    if (!track || loading) return;

    const rect = track.getBoundingClientRect();
    const progress = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);

    setSwipeProgress(progress);
  }

  function handleSwipeStart(event) {
    if (loading) return;
    setSwipeActive(true);
    updateSwipeProgress(event.clientX);
  }

  function handleSwipeMove(event) {
    if (!swipeActive) return;
    updateSwipeProgress(event.clientX);
  }

  function handleSwipeEnd() {
    if (!swipeActive) return;

    const completed = swipeProgress >= 0.82;

    setSwipeActive(false);
    setSwipeProgress(0);

    if (completed) {
      handleAnalyze();
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", textAlign: "center", background: "#1e1e1e", color: "#d4d4d4" }}>
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
              marginInline: "auto",
              borderRadius: "12px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
            }}
          />

          <div style={{ marginTop: "1rem" }}>
            {isMobile ? (
              <div
                ref={swipeTrackRef}
                role="button"
                tabIndex={0}
                aria-label="Swipe to analyze"
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
                  background: "#2d2d30",
                  border: "1px solid #3c3c3c",
                  overflow: "hidden",
                  touchAction: "none",
                  userSelect: "none",
                  opacity: loading ? 0.65 : 1,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${Math.max(swipeProgress * 100, 18)}%`,
                    background: "#2563eb",
                    transition: swipeActive ? "none" : "width 180ms ease",
                  }}
                />
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "grid",
                    height: "100%",
                    placeItems: "center",
                    color: swipeProgress > 0.45 ? "#ffffff" : "#d4d4d4",
                    fontWeight: 800,
                  }}
                >
                  {loading ? "Analyzing..." : "Swipe to analyze"}
                </span>
              </div>
            ) : (
              <button onClick={handleAnalyze} disabled={loading}>
                {loading ? "Analyzing..." : "Analyze Card"}
              </button>
            )}
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
