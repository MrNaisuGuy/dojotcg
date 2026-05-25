import React from "react";
import { Link } from "react-router-dom";
import CardCarousel from "../components/CardCarousel.jsx";

import logo from "../assets/dojotcg.png";
import mtg from "../assets/mtg.png";
import pokemon from "../assets/pokemon.png";
import onepiece from "../assets/onepiece.png";

function Home() {
  return (
    <main
      style={{
        fontFamily: "Inter, system-ui, Arial",
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e1e1e",
        color: "#d4d4d4",
        margin: 0,
      }}
    >
      <div
        style={{
          background: "#252526",
          padding: "2rem 2.5rem",
          borderRadius: "12px",
          border: "1px solid #3c3c3c",
          boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
          maxWidth: "720px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1.75rem",
            color: "#f3f4f6",
          }}
        >
          DojoTCG is in open alpha!
        </h1>

        <p style={{ color: "#c8c8c8" }}>
          Memberships soon available.
        </p>

        <img
          src={logo}
          alt="DojoTCG Logo"
          style={{
            maxWidth: "100%",
            height: "auto",
            margin: "1rem 0",
          }}
        />

        <div style={{ marginTop: "1rem" }}>
          <Link to="/scan">
          <button>Start Scanning</button>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default Home;
