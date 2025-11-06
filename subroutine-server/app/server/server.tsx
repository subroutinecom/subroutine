import express from "express";

const app = express();
const PORT = 3003;

app.get("/status", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
