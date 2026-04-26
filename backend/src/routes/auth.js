"use strict";
const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const axios    = require("axios");
const { upsertUser, saveSession } = require("../database/db");

const JWT_SECRET  = process.env.JWT_SECRET;
const OP_BASE_URL = process.env.OP_BASE_URL;

router.post("/login", async (req, res) => {
  const { token: opToken } = req.body;

  if (!opToken) {
    return res.status(400).json({ message: "Token OpenProject obligatoire." });
  }

  try {
    const opRes = await axios.get(`${OP_BASE_URL}/api/v3/users/me`, {
      headers: {
        Authorization: "Basic " + Buffer.from(`apikey:${opToken}`).toString("base64"),
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    const opUser  = opRes.data;
    const userId  = opUser.id;
    const isAdmin = opUser.admin === true;

    // ✅ Sauvegarder l'utilisateur en base
    upsertUser(userId, {
      name:    opUser.name,
      email:   opUser.email,
      isAdmin,
    });

    // ✅ Sauvegarder la session avec le bon format objet
    saveSession(userId, {
      opToken,
      isAdmin,
      deviceId: "web",
    });

    const jwtToken = jwt.sign(
      { userId, isAdmin },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      jwt:   jwtToken,
      token: jwtToken,
      user: {
        id:      userId,
        name:    opUser.name,
        email:   opUser.email,
        isAdmin,
      },
    });

  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(401).json({ message: "Token OpenProject invalide." });
    }
    if (err.response?.status === 404) {
      return res.status(500).json({ message: "URL OpenProject incorrecte — vérifiez OP_BASE_URL dans .env" });
    }
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      return res.status(503).json({ message: "Impossible de joindre OpenProject. Vérifiez Docker." });
    }
    console.error("Erreur login:", err.message);
    res.status(500).json({ message: "Erreur serveur lors de la connexion." });
  }
});

router.post("/logout", (req, res) => {
  res.json({ message: "Déconnecté." });
});

module.exports = router;