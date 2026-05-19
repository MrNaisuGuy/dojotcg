const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

app.get("/api/analyze", (req, res) => {
  res.json({
    name: "Dojobird",
    language: "English",
    price: "$999",
    image: "/images/dojobird.png",
  });
});

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});