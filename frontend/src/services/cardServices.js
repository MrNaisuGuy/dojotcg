export async function analyzeCard() {

  return new Promise((resolve) => {

    setTimeout(() => {
        resolve({
        card: "Dojobird", // live data later
        language: "Engrish", // live data later
        price: "$6...7", // live data later
        accuracy: "0.0001", // live data later
        image: "dojobird", // live data later
        });
    }, 1500);

  });

}