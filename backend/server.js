import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/analyze", (req, res) => {
  res.json({
    card: "Dojobird", // live data later
    language: "Engrish", // live data later
    price: "$6...7", // live data later
    accuracy: "0.0001", // live data later
    image: "/images/dojobird.png", // URL later
  });
});

app.listen(3001, "0.0.0.0", () => {
  console.log("Backend running on http://localhost:3001");
});
