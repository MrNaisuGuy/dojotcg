export default function handler(req, res) {
  res.status(200).json({
    card: "Dojobird", // live data later
    language: "Engrish", // live data later
    price: "$6...8", // live data later
    accuracy: "0.0001", // live data later
    image: "/images/dojobird.png", // URL later
  });
}