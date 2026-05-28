// download-card-images.js
import fs from "fs";
import path from "path";

const csvPath = "./all_imgs.csv";
const outDir = "./test-images";

fs.mkdirSync(outDir, { recursive: true });

const rows = fs.readFileSync(csvPath, "utf8").split("\n").slice(1);

function safeName(value) {
  return String(value || "unknown")
    .replace(/[^a-z0-9-_]+/gi, "_")
    .slice(0, 80);
}

for (const row of rows) {
  const cols = row.split(",");
  const [game, name, setId, number, imageUrl] = cols;

  if (!imageUrl?.startsWith("http")) continue;

  const fileName = `${safeName(game)}_${safeName(setId)}_${safeName(number)}_${safeName(name)}.jpg`;
  const filePath = path.join(outDir, fileName);

  const res = await fetch(imageUrl);
  if (!res.ok) {
    console.log("Failed:", imageUrl);
    continue;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  console.log("Saved:", fileName);
}