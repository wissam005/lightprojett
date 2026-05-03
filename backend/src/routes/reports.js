"use strict";
const express = require("express");
const router  = express.Router();
const { getAiReports } = require("../database/db");

// GET /api/reports — historique de tous les rapports IA
router.get("/", (req, res) => {
  try {
    const reports = getAiReports();
    res.json(reports);
  } catch (err) {
    console.error("Erreur récupération rapports:", err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;