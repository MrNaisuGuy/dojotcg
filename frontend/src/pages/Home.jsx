import React from "react";
import logo from "../assets/dojotcg.png";
import { Link } from "react-router-dom";

function Home() {
  return (
    <main
      style={{
        fontFamily: "Inter, system-ui, Arial",
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fb",
        margin: 0,
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "2rem 2.5rem",
          borderRadius: "12px",
          boxShadow: "0 8px 30px rgba(20,30,60,0.08)",
          maxWidth: "720px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1.75rem",
          }}
        >
          DojoTCG Coming Eventually
        </h1>

        <p style={{ color: "#556" }}>
          I'll get to it one day...maybeeee
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