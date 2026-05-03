"use strict";

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("FATAL : JWT_SECRET manquant dans .env. Le serveur va s'arrêter.");
  process.exit(1);
}

/**
 * Vérifie le Bearer JWT sur toutes les routes protégées.
 * Attache req.user = { userId, isAdmin, email, name, iat, exp } si valide.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({
      message: "Accès refusé : aucun token d'authentification fourni.",
    });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Format d'autorisation invalide. Utilisez : Bearer <token>",
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({ message: "Token vide après 'Bearer '." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, isAdmin, email, name, iat, exp }
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expirée. Veuillez vous reconnecter." });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Token JWT invalide." });
    }
    return res.status(401).json({ message: "Erreur d'authentification." });
  }
}

module.exports = verifyToken;