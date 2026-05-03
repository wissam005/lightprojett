"use strict";

const express           = require("express");
const router            = express.Router();
const auth              = require("../middleware/auth");
const { saveAiReport }  = require("../database/db");
const { sendWeeklyReport } = require("../services/emailService");
const {
  analyzeProject,
  analyzeProjectRisk,
  chatWithAI,
  generateWeeklyReport,
  generateTaskPlan,
  generateTaskGuide,
  detectTaskBlockage,
  generateMemberSummary,
} = require("../services/groq");

function handleAIError(err, res) {
  console.error("Erreur IA:", err.message);
  if (err.message?.includes("GROQ_API_KEY"))
    return res.status(500).json({ message: "Clé Groq non configurée dans .env" });
  if (err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("rate_limit"))
    return res.status(429).json({ message: "Quota Groq dépassé — attends quelques secondes" });
  if (err.message?.includes("Format IA invalide"))
    return res.status(500).json({ message: "L'IA n'a pas retourné un format valide, réessaie" });
  if (err.message?.includes("401") || err.message?.includes("invalid_api_key"))
    return res.status(401).json({ message: "Clé Groq invalide — vérifie ton .env" });
  res.status(500).json({ message: "Erreur IA", detail: err.message });
}

// POST /api/ai/analyze
router.post("/analyze", auth, async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description)
    return res.status(400).json({ message: "Titre et description obligatoires" });
  try {
    const result = await analyzeProject(title, description);
    res.json(result);
  } catch (err) { handleAIError(err, res); }
});

// POST /api/ai/risk
router.post("/risk", auth, async (req, res) => {
  const { name, totalTasks, doneTasks, lateTasks, progress } = req.body;
  if (!name) return res.status(400).json({ message: "Données du projet obligatoires" });
  try {
    const result = await analyzeProjectRisk({ name, totalTasks, doneTasks, lateTasks, progress });
    res.json(result);
  } catch (err) { handleAIError(err, res); }
});

// POST /api/ai/chat
router.post("/chat", auth, async (req, res) => {
  const { projectContext, question } = req.body;
  if (!question) return res.status(400).json({ message: "Question obligatoire" });
  try {
    const result = await chatWithAI(projectContext || {}, question);
    res.json(result);
  } catch (err) { handleAIError(err, res); }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/ai/report — rapport hebdomadaire
//  → génère via Groq
//  → sauvegarde en base (ai_reports)
//  → envoie par email à l'admin connecté
// ─────────────────────────────────────────────────────────────
router.post("/report", auth, async (req, res) => {
  const { projects, projectId = 0, selectedProjectNames = null } = req.body;

  const projectsToAnalyze = selectedProjectNames
    ? projects.filter(p => selectedProjectNames.includes(p.name))
    : projects;

  if (!projects || !Array.isArray(projects))
    return res.status(400).json({ message: "Liste de projets obligatoire" });
  try {
    const result = await generateWeeklyReport(projectsToAnalyze);

    // 1. Sauvegarde en base
    try {
      const content = JSON.stringify({
        ...result,
        generatedAt:  new Date().toISOString(),
        projectCount: projectsToAnalyze.length,
        projects:     projectsToAnalyze.map(p => ({
          name:         p.name,
          progress:     p.progress     || 0,
          riskScore:    p.riskScore    || 0,
          lateTasks:    p.lateTasks    || 0,
          blockedTasks: p.blockedTasks || 0,
        })),
      });
      saveAiReport(projectId || 0, content);
      console.log("[AI Report] Sauvegardé en base (projectId =", projectId || 0, ")");
    } catch (saveErr) {
      console.warn("[AI Report] Erreur sauvegarde:", saveErr.message);
    }

    // 2. Envoi email
    try {
      const adminEmail = req.user?.email;
      const adminName  = req.user?.name || "Admin";
      if (adminEmail) {
        await sendWeeklyReport({
          to:       adminEmail,
          name:     adminName,
          projects: projects.map(p => ({
            name:         p.name,
            progress:     p.progress     || 0,
            riskScore:    p.riskScore    || 0,
            lateTasks:    p.lateTasks    || 0,
            blockedTasks: p.blockedTasks || 0,
            budgetTotal:  p.budgetTotal  || null,
            budgetUsed:   p.budgetUsed   || null,
          })),
        });
        console.log("[AI Report] Email envoyé à", adminEmail, "✅");
      } else {
        console.warn("[AI Report] Pas d'email utilisateur — email non envoyé");
      }
    } catch (mailErr) {
      console.warn("[AI Report] Email non envoyé:", mailErr.message);
    }

    res.json(result);
  } catch (err) { handleAIError(err, res); }
});

// POST /api/ai/task-plan
router.post("/task-plan", auth, async (req, res) => {
  const { title, description, type, estimatedHours } = req.body;
  if (!title || !description)
    return res.status(400).json({ message: "Titre et description obligatoires" });
  try {
    const result = await generateTaskPlan({ title, description, type, estimatedHours });
    res.json(result);
  } catch (err) { handleAIError(err, res); }
});

// POST /api/ai/task-guide
router.post("/task-guide", auth, async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description)
    return res.status(400).json({ message: "Titre et description obligatoires" });
  try {
    const result = await generateTaskGuide({ title, description });
    res.json(result);
  } catch (err) { handleAIError(err, res); }
});

// POST /api/ai/task-blockage
router.post("/task-blockage", auth, async (req, res) => {
  const { 
    title, description, status, daysStuck,
    isBlocked, dependsOn  // ← nouveaux champs
  } = req.body;
  
  if (!title || !description)
    return res.status(400).json({ message: "Titre et description obligatoires" });
  
  try {
    const result = await detectTaskBlockage({ 
      title, 
      description, 
      status, 
      daysStuck,
      isBlocked:  Boolean(isBlocked),
      dependsOn:  dependsOn || []
    });
    res.json(result);
  } catch (err) { handleAIError(err, res); }
});

// POST /api/ai/member-summary
router.post("/member-summary", auth, async (req, res) => {
  const { name, totalTasks, doneTasks, lateTasks, inProgressTasks, tasks } = req.body;
  if (!name) return res.status(400).json({ message: "Nom du membre obligatoire" });
  try {
    const result = await generateMemberSummary({ name, totalTasks, doneTasks, lateTasks, inProgressTasks, tasks });
    res.json(result);
  } catch (err) { handleAIError(err, res); }
});

module.exports = router;