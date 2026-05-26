import React, { useLayoutEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import Home from "./pages/Home.jsx";
import Scan from "./pages/Scan.jsx";
import PlayerLayout from "./pages/PlayerLayout.jsx";
import TCGRules from "./pages/TCGRules.jsx";
import TurnFormat from "./pages/TurnFormat.jsx";

function App() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="/tcg-rules" element={<TCGRules />} />
      <Route path="/player-layout/:game" element={<PlayerLayout />} />
      <Route path="/turn-format/:game" element={<TurnFormat />} />
    </Routes>
  );
}

export default App;
