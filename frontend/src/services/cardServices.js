// export async function analyzeCard() {

//   return new Promise((resolve) => {

//     setTimeout(() => {
//         resolve({
//         card: "Dojobird", // live data later
//         language: "Engrish", // live data later
//         price: "$6...7", // live data later
//         accuracy: "0.0001", // live data later
//         image: "dojobird", // live data later
//         });
//     }, 6000);

//   });

// }


// export async function analyzeCard() {
//   const response = await fetch("http://localhost:3001/api/analyze");

//   if (!response.ok) {
//     throw new Error("There was an error analyzing the card. Please try again.");
//   }

//   return response.json();
// }

export async function analyzeCard(cardImage) {
  const formData = new FormData();
  formData.append("cardImage", cardImage);

  const response = await fetch("/api/analyze", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.details || errorData?.error || "Failed to analyze card");
  }

  return response.json();
}
