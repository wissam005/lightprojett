const Groq = require("groq-sdk");

function getClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key || key === "gsk_ta_cle_ici") {
    throw new Error("GROQ_API_KEY non configurée dans .env");
  }
  return new Groq({ apiKey: key });
}

async function callGroq(prompt, maxTokens = 1024) {
  console.log("🤖 Appel Groq...");
  const client = getClient();
  const response = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: maxTokens,
  });
  console.log("✅ Réponse Groq reçue");
  return response.choices[0].message.content;
}

function extractJSON(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Format IA invalide — JSON introuvable");
  try {
    return JSON.parse(match[0]);
  } catch {
    throw new Error("Format IA invalide — JSON mal formé");
  }
}

// ── 1. Générer les tâches d'un projet ──────────────────────────
async function analyzeProject(title, description) {
  const prompt = `Tu es un assistant de gestion de projet professionnel. Réponds UNIQUEMENT en JSON valide, sans texte avant ou après.
Projet :
- Titre : ${title}
- Description : ${description}
JSON attendu :
{
  "correctedDescription": "description corrigée en français professionnel",
  "tasks": [
    {"title": "Titre tâche", "description": "Description courte", "estimatedHours": 4, "type": "Développement"}
  ]
}
Analyse attentivement la description du projet et génère le nombre de tâches EXACT nécessaire pour réaliser ce projet complètement.
Ne génère ni trop peu ni trop — si le projet est simple génère 2-3 tâches, si il est complexe génère 10-15 tâches ou plus.
Le nombre de tâches doit être justifié par la complexité réelle du projet décrit.
Types autorisés : Analyse, Développement, Test, Documentation, Déploiement.`;


  const text = await callGroq(prompt);
  const parsed = extractJSON(text);
  if (!parsed.correctedDescription || !Array.isArray(parsed.tasks)) {
    throw new Error("Format IA invalide");
  }
  return parsed;
}

// ── 2. Analyser le risque d'un projet ──────────────────────────
async function analyzeProjectRisk(project) {
  const prompt = `Tu es un expert en gestion de projet. Réponds UNIQUEMENT en JSON valide.
Données du projet :
- Nom : ${project.name}
- Tâches totales : ${project.totalTasks}
- Tâches terminées : ${project.doneTasks}
- Tâches en retard : ${project.lateTasks}
- Progression : ${project.progress}%
JSON attendu :
{"riskScore": 25, "status": "bon", "explanation": "explication en français"}
Règles : bon = 0-33, attention = 34-66, danger = 67-100`;

  const text = await callGroq(prompt);
  return extractJSON(text);
}

// ── 3. Chat IA sur un projet ───────────────────────────────────
async function chatWithAI(projectContext, question) {
  const prompt = `Tu es un assistant de gestion de projet. Réponds en français en 2-3 phrases max.
Contexte : ${JSON.stringify(projectContext)}
Question : ${question}`;

  const text = await callGroq(prompt);
  return { answer: text.trim() };
}

// ── 4. Rapport hebdomadaire ────────────────────────────────────
async function generateWeeklyReport(projects) {
  const prompt = `Tu es un expert senior en gestion de projet. Réponds UNIQUEMENT en JSON valide, sans texte avant ou après.

Voici les données des projets à analyser :
${JSON.stringify(projects, null, 2)}

Pour chaque projet, génère une analyse DÉTAILLÉE et SPÉCIFIQUE basée sur ses vraies données.

JSON attendu :
{
  "summary": "résumé global du portefeuille de projets en 2-3 phrases",
  "projects": [
    {
      "name": "nom exact du projet",
      "status": "bon" | "attention" | "danger",
      "analysis": "paragraphe détaillé expliquant POURQUOI ce projet est dans cet état, basé sur ses chiffres réels (progression, retards, risque)",
      "risks": [
        "risque futur concret si rien ne change",
        "autre risque identifié"
      ],
      "actionPlan": [
        {"step": 1, "action": "action concrète et précise", "priority": "haute" | "moyenne" | "faible"},
        {"step": 2, "action": "action concrète et précise", "priority": "haute" | "moyenne" | "faible"},
        {"step": 3, "action": "action concrète et précise", "priority": "haute" | "moyenne" | "faible"}
      ]
    }
  ],
  "globalRecommendations": [
    "recommandation transversale 1",
    "recommandation transversale 2"
  ]
}

Règles importantes :
- status "bon" si riskScore < 20 ET lateTasks < 15% des tâches totales
- status "attention" si riskScore entre 20-50 OU lateTasks entre 15-40%
- status "danger" si riskScore > 50 OU lateTasks > 40%
- L'analysis doit citer les vrais chiffres du projet (ex: "7 tâches en retard sur 12")
- Génère exactement 3-4 étapes dans actionPlan par projet
- Réponds en français professionnel`;

  const text = await callGroq(prompt, 3000);
  const parsed = extractJSON(text);
  if (!parsed.summary || !Array.isArray(parsed.projects)) {
    throw new Error("Format IA invalide");
  }
  return parsed;
}

// ── 5. Plan de travail pour une tâche ─────────────────────────
async function generateTaskPlan(task) {
  const prompt = `Tu es un assistant de gestion de projet. Réponds UNIQUEMENT en JSON valide.
Voici une tâche assignée à un étudiant :
- Titre : ${task.title}
- Description : ${task.description}
- Type : ${task.type || "Développement"}
- Heures estimées : ${task.estimatedHours || "non défini"}
Génère un plan de travail détaillé.
JSON attendu :
{
  "summary": "résumé en 1 phrase de ce que l'étudiant doit faire",
  "steps": [
    {"order": 1, "title": "Titre étape", "description": "Ce qu'il faut faire", "duration": "30 min"}
  ],
  "tips": ["conseil pratique 1", "conseil pratique 2"],
  "tools": ["outil recommandé"]
}
Génère entre 4 et 6 étapes réalistes.`;

  const text = await callGroq(prompt);
  return extractJSON(text);
}

// ── 6. Guide Q&R automatique pour une tâche ───────────────────
async function generateTaskGuide(task) {
  const prompt = `Tu es un assistant pédagogique pour étudiants en informatique. Réponds UNIQUEMENT en JSON valide.
Tâche :
- Titre : ${task.title}
- Description : ${task.description}
Génère automatiquement 4 questions-réponses qui aident l'étudiant à comprendre et réaliser cette tâche.
JSON attendu :
{
  "introduction": "phrase d'introduction motivante en français",
  "qna": [
    {"question": "Question clé", "answer": "Réponse claire en français"}
  ],
  "motivation": "phrase de motivation finale"
}
Génère exactement 4 questions-réponses pédagogiques.`;

  const text = await callGroq(prompt);
  return extractJSON(text);
}

// ── 7. Détection de blocage d'une tâche ───────────────────────
async function detectTaskBlockage(task) {
  // Liste des tâches bloquantes non terminées
  const blockers = (task.dependsOn || [])
    .filter(d => !d.isDone)
    .map(d => `• #${d.taskId} "${d.title}" (statut: ${d.status})`)
    .join('\n')

  const prompt = task.isBlocked
    ? `Tu es un expert en gestion de projet. Réponds UNIQUEMENT en JSON valide.

La tâche suivante est CONFIRMÉE BLOQUÉE par le système de dépendances :

- Titre : ${task.title}
- Description : ${task.description}
- Statut actuel : ${task.status}
- Jours sans avancement : ${task.daysStuck || "inconnu"}
- Bloquée par ces tâches non terminées :
${blockers || "• Dépendances non spécifiées"}

Génère un plan d'action CONCRET pour débloquer cette situation.

JSON attendu :
{
  "isBlocked": true,
  "reason": "explication précise basée sur les tâches bloquantes listées",
  "solutions": [
    {"title": "Solution 1", "description": "action concrète", "priority": "haute"}
  ],
  "urgency": "ignoré"
}
Génère exactement 3 solutions concrètes. urgency sera ignoré car calculé par le système.`

    : `Tu es un expert en gestion de projet. Réponds UNIQUEMENT en JSON valide.

La tâche suivante n'est PAS bloquée selon le système :

- Titre : ${task.title}
- Description : ${task.description}
- Statut actuel : ${task.status}
- Toutes les dépendances sont terminées ou il n'y en a pas.

Génère des conseils préventifs pour éviter un blocage futur.

JSON attendu :
{
  "isBlocked": false,
  "reason": "explication que la tâche n'est pas bloquée et pourquoi",
  "solutions": [
    {"title": "Conseil 1", "description": "conseil préventif", "priority": "faible"}
  ],
  "urgency": "ignoré"
}
Génère exactement 3 conseils préventifs.`

  const text = await callGroq(prompt)
  return extractJSON(text)
}

// ── 8. Résumé personnalisé pour un membre ─────────────────────
async function generateMemberSummary(member) {
  const prompt = `Tu es un assistant de gestion de projet. Réponds UNIQUEMENT en JSON valide.
Voici les données d'un membre de l'équipe :
- Nom : ${member.name}
- Tâches assignées : ${member.totalTasks}
- Tâches terminées : ${member.doneTasks}
- Tâches en retard : ${member.lateTasks}
- Tâches en cours : ${member.inProgressTasks}
Liste des tâches : ${JSON.stringify(member.tasks || [])}
Génère un résumé personnalisé et motivant.
JSON attendu :
{
  "greeting": "message personnalisé avec le prénom",
  "accomplished": "ce qu'il a accompli cette semaine",
  "inProgress": "ce qu'il est en train de faire",
  "nextPriority": "la prochaine tâche prioritaire à faire",
  "encouragement": "message d'encouragement personnalisé",
  "alert": "alerte si des tâches sont en retard, sinon null"
}`;

  const text = await callGroq(prompt);
  return extractJSON(text);
}

module.exports = {
  analyzeProject,
  analyzeProjectRisk,
  chatWithAI,
  generateWeeklyReport,
  generateTaskPlan,
  generateTaskGuide,
  detectTaskBlockage,
  generateMemberSummary,
};