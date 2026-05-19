import React, { useState } from "react";
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

    setFileName(file.name);
    setSelectedImage(URL.createObjectURL(file));
  }

  function analyzeCard() {
    setLoading(true);

    setTimeout(() => {
      setResult({
        name: "Dojobird", // live data later
        language: "Engrish", // live data later
        price: "$6...7", // live data later
        accuracy: "0.0001", // live data later
      });
      setResultImage(dojobird); // live data later
      setLoading(false);
    }, 1500);
  }

  return (
    <main style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Scan Card</h1>
      <p>
         {isMobile
         ? "Point your camera at a card to scan it." : "Upload a card image to preview it."
         }
      </p>

      <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} />
      
      {selectedImage && (
        <div style={{ marginTop: "2rem" }}>
          <p>{fileName}</p>

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
            <button onClick={analyzeCard}>Analyze Card</button>
          </div>
        </div>
      )}

      {loading && <p>Analyzing card...</p>}

      {result && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Card matched with {result.accuracy}% accuracy.</h2>
            <img
            src={resultImage}
            alt="DojoTCG"
            style={{
                width: "120px",
                borderRadius: "10px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                marginBottom: "1rem",
            }}
            />
          <p>Name: {result.name}</p>
          <p>Language: {result.language}</p>
          <p>Estimated Price: {result.price}</p>
        </div>
      )}
    </main>
  );
}

export default Scan;