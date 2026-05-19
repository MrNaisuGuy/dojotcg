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


export async function analyzeCard() {
  const response = await fetch("http://localhost:3001/api/analyze");

  if (!response.ok) {
    throw new Error("Failed to analyze card");
  }

  return response.json();
}