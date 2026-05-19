export async function analyzeCard() {

function analyzeCard() {
    alert("here");
    setLoading(true);

    setTimeout(() => {
        setResult({
        name: "Dojobird", // live data later
        language: "Engrish", // live data later
        price: "$6...7", // live data later
        accuracy: "0.0001", // live data later
        });
        setResultImage(dojobird); // live data later
        setLoading(false);
    }, 1500);

    async function handleImageUpload(event) {
      const file = event.target.files[0];

      if (!file) return;

      setResult(null);
      setLoading(false);

      setFileName(file.name);

      const imageUrl = URL.createObjectURL(file);

      setSelectedImage(imageUrl);

      setLoading(true);

      const data = await analyzeCard();

      setResult(data);

      setLoading(false);
    }
  }

}