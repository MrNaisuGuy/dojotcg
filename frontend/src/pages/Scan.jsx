import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { analyzeCard } from "../services/cardServices.js";
import CandidateMatches from "../components/CandidateMatches.jsx";
import CardCarousel from "../components/CardCarousel.jsx";
import mtg from "../assets/mtg.png";
import pokemon from "../assets/pokemon.png";
import onepiece from "../assets/onepiece.png";

const maxImageSize = 1600;
const imageQuality = 0.82;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not prepare image for upload."));
        }
      },
      type,
      quality,
    );
  });
}

async function prepareImageFile(file) {
  if (!file.type.startsWith("image/")) return file;

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();

    const scale = Math.min(1, maxImageSize / Math.max(image.naturalWidth, image.naturalHeight));

    if (scale === 1 && file.type !== "image/heic" && file.type !== "image/heif") {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", imageQuality);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "card-photo";

    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function Scan() {
  const swipeTrackRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isMobile] = useState(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [swipeActive, setSwipeActive] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);

  useEffect(() => {
    return () => {
      if (selectedImage) {
        URL.revokeObjectURL(selectedImage);
      }
    };
  }, [selectedImage]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraOpen]);

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
  }

  async function openCamera() {
    setCameraError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1600 },
          height: { ideal: 1600 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setCameraOpen(true);
    } catch (error) {
      console.error(error);
      setCameraError("Camera could not be opened. Check browser permission and try again.");
    }
  }

  function setPreparedSelection(file) {
    const imageUrl = URL.createObjectURL(file);

    setResult(null);
    setLoading(false);
    setFileName(file.name);
    setSelectedFile(file);
    setSelectedImage(imageUrl);
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const scale = Math.min(1, maxImageSize / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", imageQuality);
    const file = new File([blob], `card-photo-${Date.now()}.jpg`, { type: "image/jpeg" });

    setShowResult(false);
    setSwipeProgress(0);
    setPreparedSelection(file);
    stopCamera();
  }

  async function handleImageUpload(event) {
    setShowResult(false);
    setSwipeProgress(0);

    const file = event.target.files?.[0];
    
    if (!file) return;

    let preparedFile = file;

    try {
      preparedFile = await prepareImageFile(file);
    } catch (error) {
      console.warn("Using original image because compression failed.", error);
    }

    setPreparedSelection(preparedFile);
    event.target.value = "";
  }

  async function handleAnalyze({ keepSwipeComplete = false } = {}) {
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
      if (keepSwipeComplete) {
        setSwipeProgress(0);
      }
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
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Some mobile browsers release capture during interrupted gestures.
    }
    if (loading) return;
    setSwipeActive(true);
    updateSwipeProgress(event.clientX);
  }

  function handleSwipeMove(event) {
    event.preventDefault();
    if (!swipeActive) return;
    updateSwipeProgress(event.clientX);
  }

  function handleSwipeEnd(event) {
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be gone after camera/gallery interactions.
    }
    if (!swipeActive) return;

    const completed = swipeProgress >= 0.82;

    if (completed) {
      setSwipeActive(false);
      setSwipeProgress(1);
      handleAnalyze({ keepSwipeComplete: true });
      return;
    }

    setSwipeActive(false);
    setSwipeProgress(0);
  }

  return (
    <main style={{ minHeight: "100vh", padding: "2rem", textAlign: "center", background: "#1e1e1e", color: "#d4d4d4" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto 1.5rem", textAlign: "left" }}>
        <Link
          className="dojo-text-link"
          to="/"
          style={{
            display: "inline-block",
            textDecoration: "none",
            fontSize: "0.95rem",
          }}
        >
          &larr; Back to Home
        </Link>
      </div>

      {isMobile ? (
        <div style={{ display: "grid", gap: "0.75rem", justifyContent: "center" }}>
          <button type="button" className="upload-card-button" onClick={openCamera}>
            Take a picture
          </button>
          <label
            htmlFor="card-gallery-upload"
            className="upload-card-button"
            style={{
              background: "#2d2d30",
              border: "1px solid #3c3c3c",
              color: "#f3f4f6",
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.18)",
            }}
          >
            Choose from gallery
          </label>
        </div>
      ) : (
        <p>
          <label htmlFor="card-gallery-upload" className="upload-card-button">
            Upload a card image to analyze it.
          </label>
        </p>
      )}

      <input
        id="card-gallery-upload"
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        style={{display: "none"}}
      />

      {cameraError && (
        <p style={{ marginTop: "1rem", color: "#fca5a5", fontSize: "0.95rem" }}>
          {cameraError}
        </p>
      )}

      {cameraOpen && (
        <section
          style={{
            display: "grid",
            gap: "0.9rem",
            maxWidth: "360px",
            margin: "1rem auto 0",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              aspectRatio: "3 / 4",
              objectFit: "cover",
              borderRadius: "10px",
              border: "1px solid #3c3c3c",
              background: "#111827",
            }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <button type="button" onClick={capturePhoto}>
              Use photo
            </button>
            <button
              type="button"
              onClick={stopCamera}
              style={{
                background: "#2d2d30",
                border: "1px solid #3c3c3c",
                color: "#f3f4f6",
                boxShadow: "0 8px 20px rgba(0, 0, 0, 0.18)",
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      
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
                onClick={(event) => event.preventDefault()}
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
                    background: "#5b21b6",
                    transition: swipeActive ? "none" : "width 180ms ease",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    zIndex: 2,
                    top: "50%",
                    left: `calc(${swipeProgress * 100}% - ${swipeProgress * 48}px)`,
                    width: "44px",
                    height: "44px",
                    borderRadius: "999px",
                    background: "#ffffff",
                    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.28)",
                    display: "grid",
                    placeItems: "center",
                    transform: "translate(6px, -50%)",
                    transition: swipeActive ? "none" : "left 180ms ease",
                  }}
                >
                  <span
                    style={{
                      color: "#5b21b6",
                      fontSize: "1.25rem",
                      lineHeight: 1,
                      fontWeight: 900,
                    }}
                  >
                    &rsaquo;
                  </span>
                </div>
                <span
                  style={{
                    position: "relative",
                    zIndex: 3,
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
        <CandidateMatches
          candidates={result.candidates || result.justtcgMatches}
          error={result.justtcgError}
          searchQuery={result.justtcgSearchQuery}
          matchTarget={result.matchTarget}
        />
      )}
      
    </main>
  );
}

export default Scan;
