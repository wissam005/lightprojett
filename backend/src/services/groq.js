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
    temperature: 0.2,
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
Analyse attentivement la description du projet et génère le nombre de tâches EXACT nécessaire.
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

// ── 4. Rapport COMPLET et PROFESSIONNEL ────────────────────────
async function generateWeeklyReport(projects) {
  const prompt = `Tu es un directeur de programme certifié PMP avec 15 ans d'expérience. Tu dois rédiger un rapport de suivi de portefeuille COMPLET, PROFESSIONNEL et TRÈS RICHE en contenu. Réponds UNIQUEMENT en JSON valide.

DONNÉES DES PROJETS :
${JSON.stringify(projects, null, 2)}

CONSIGNES ABSOLUES POUR LA RÉDACTION :

1. ANALYSE (champ "analysis") : Rédige un paragraphe professionnel de MINIMUM 6 phrases qui couvre :
   - L'état actuel précis avec TOUS les chiffres (tâches totales, terminées, en cours, en retard, bloquées)
   - Le calcul du taux de complétion réel en pourcentage
   - L'évaluation du rythme d'avancement (est-ce suffisant pour finir à temps ?)
   - L'impact des tâches en retard ou bloquées sur le projet
   - La comparaison entre heures estimées et heures réalisées si disponible
   - Une appréciation globale de la santé du projet
   Si les données sont limitées, enrichis l'analyse avec des observations méthodologiques pertinentes.

2. RISQUES (champ "risks") : Génère EXACTEMENT 4 risques, chacun avec :
   - Une description précise du risque (pas générique)
   - L'impact potentiel chiffré si possible
   - La probabilité estimée
   Exemple : "Le taux de complétion de 20% avec 2 tâches en cours sur 5 indique un risque de non-livraison dans les délais si le rythme n'accélère pas dans les 2 prochaines semaines"

3. PLAN D'ACTION (champ "actionPlan") : Génère EXACTEMENT 6 étapes avec pour chacune :
   - Une action CONCRÈTE et MESURABLE (pas vague)
   - La priorité (haute/moyenne/faible)
   - Le responsable recommandé
   - La deadline recommandée
   - Le résultat attendu

4. SUMMARY : Rédige un résumé exécutif de 5-6 phrases couvrant l'ensemble du portefeuille avec les chiffres globaux.

5. POINTS FORTS : 3 points forts SPÉCIFIQUES basés sur les données réelles.

6. WORKLOAD : Analyse détaillée de la charge de travail basée sur les données disponibles.

JSON ATTENDU :
{
  "summary": "résumé exécutif de 5-6 phrases avec chiffres globaux, état du portefeuille, points critiques et positifs",
  "generatedAt": "${new Date().toISOString()}",
  "portfolioStats": {
    "totalProjects": ${projects.length},
    "projectsOnTrack": 0,
    "projectsAtRisk": 0,
    "projectsInDanger": 0,
    "totalTasks": 0,
    "totalLateTasks": 0,
    "totalBlockedTasks": 0,
    "averageProgress": 0,
    "totalHoursEstimated": 0,
    "totalHoursDone": 0
  },
  "projects": [
    {
      "name": "nom exact du projet",
      "status": "bon",
      "riskScore": 0,
      "progress": 0,
      "kpis": {
        "totalTasks": 0,
        "doneTasks": 0,
        "lateTasks": 0,
        "blockedTasks": 0,
        "inProgress": 0,
        "todoTasks": 0,
        "totalHours": 0,
        "doneHours": 0,
        "completionRate": "0%",
        "velocityComment": "commentaire sur la vélocité de l'équipe"
      },
      "analysis": "MINIMUM 6 phrases professionnelles et détaillées couvrant tous les aspects du projet avec les vrais chiffres",
      "strengths": [
        "point fort 1 spécifique avec chiffres ou observation concrète",
        "point fort 2 spécifique avec chiffres ou observation concrète",
        "point fort 3 spécifique avec chiffres ou observation concrète"
      ],
      "risks": [
        "Risque 1 : description précise + impact potentiel + probabilité",
        "Risque 2 : description précise + impact potentiel + probabilité",
        "Risque 3 : description précise + impact potentiel + probabilité",
        "Risque 4 : description précise + impact potentiel + probabilité"
      ],
      "actionPlan": [
        {"step": 1, "action": "action concrète et mesurable", "priority": "haute", "owner": "Chef de projet", "deadline": "Dans 2 jours", "expectedResult": "résultat attendu de cette action"},
        {"step": 2, "action": "action concrète et mesurable", "priority": "haute", "owner": "Équipe", "deadline": "Dans 3 jours", "expectedResult": "résultat attendu"},
        {"step": 3, "action": "action concrète et mesurable", "priority": "moyenne", "owner": "Chef de projet", "deadline": "Dans 1 semaine", "expectedResult": "résultat attendu"},
        {"step": 4, "action": "action concrète et mesurable", "priority": "moyenne", "owner": "Équipe", "deadline": "Dans 1 semaine", "expectedResult": "résultat attendu"},
        {"step": 5, "action": "action concrète et mesurable", "priority": "faible", "owner": "Admin", "deadline": "Dans 2 semaines", "expectedResult": "résultat attendu"},
        {"step": 6, "action": "action concrète et mesurable", "priority": "faible", "owner": "Chef de projet", "deadline": "Dans 2 semaines", "expectedResult": "résultat attendu"}
      ],
      "workloadSummary": "analyse détaillée de la charge de travail par membre si données disponibles, sinon recommandations sur l'assignation des tâches non assignées",
      "timeline": {
        "startDate": null,
        "endDate": null,
        "daysRemaining": null,
        "isOnSchedule": true,
        "scheduleComment": "analyse du respect du planning avec recommandations",
        "projectedCompletion": "estimation de la date de complétion réelle basée sur la vélocité actuelle"
      },
      "progressionForecast": "prévision de progression pour les 2 prochaines semaines basée sur le rythme actuel"
    }
  ],
  "globalRecommendations": [
    "recommandation 1 : action concrète transversale avec justification",
    "recommandation 2 : action concrète transversale avec justification",
    "recommandation 3 : action concrète transversale avec justification",
    "recommandation 4 : gouvernance et amélioration continue avec justification"
  ],
  "nextReviewDate": "date recommandée pour la prochaine revue"
}

RÈGLES DE STATUT :
- "bon" si riskScore < 20 ET lateTasks < 15% du total
- "attention" si riskScore 20-50 OU lateTasks 15-40%
- "danger" si riskScore > 50 OU lateTasks > 40%

IMPORTANT : Même avec peu de données, le rapport doit être riche, professionnel et apporter une vraie valeur analytique. Ne génère JAMAIS de contenu vague ou générique.`;

  const text = await callGroq(prompt, 8000);
  const parsed = extractJSON(text);
  if (!parsed.summary || !Array.isArray(parsed.projects)) {
    throw new Error("Format IA invalide");
  }
  return parsed;
}

// ── 5. Plan de travail pour une tâche ─────────────────────────
async function generateTaskPlan(task) {
  const prompt = `Tu es un assistant de gestion de projet. Réponds UNIQUEMENT en JSON valide.
Tâche :
- Titre : ${task.title}
- Description : ${task.description}
- Type : ${task.type || "Développement"}
- Heures estimées : ${task.estimatedHours || "non défini"}
JSON attendu :
{
  "summary": "résumé en 1 phrase",
  "steps": [{"order": 1, "title": "Titre étape", "description": "Ce qu'il faut faire", "duration": "30 min"}],
  "tips": ["conseil pratique 1", "conseil pratique 2"],
  "tools": ["outil recommandé"]
}
Génère entre 4 et 6 étapes réalistes.`;

  const text = await callGroq(prompt);
  return extractJSON(text);
}

// ── 6. Guide Q&R automatique pour une tâche ───────────────────
async function generateTaskGuide(task) {
  const prompt = `Tu es un assistant pédagogique. Réponds UNIQUEMENT en JSON valide.
Tâche :
- Titre : ${task.title}
- Description : ${task.description}
JSON attendu :
{
  "introduction": "phrase d'introduction motivante",
  "qna": [{"question": "Question clé", "answer": "Réponse claire"}],
  "motivation": "phrase de motivation finale"
}
Génère exactement 4 questions-réponses pédagogiques.`;

  const text = await callGroq(prompt);
  return extractJSON(text);
}

// ── 7. Détection de blocage d'une tâche ───────────────────────
async function detectTaskBlockage(task) {
  const blockers = (task.dependsOn || [])
    .filter(d => !d.isDone)
    .map(d => `• #${d.taskId} "${d.title}" (statut: ${d.status})`)
    .join('\n');

  const prompt = task.isBlocked
    ? `Tu es un expert en gestion de projet. Réponds UNIQUEMENT en JSON valide.
La tâche est BLOQUÉE :
- Titre : ${task.title}
- Description : ${task.description}
- Statut : ${task.status}
- Jours sans avancement : ${task.daysStuck || "inconnu"}
- Bloquée par : ${blockers || "dépendances non spécifiées"}
JSON :
{
  "isBlocked": true,
  "reason": "explication précise",
  "solutions": [{"title": "Solution", "description": "action concrète", "priority": "haute"}],
  "urgency": "ignoré"
}
Génère 3 solutions concrètes.`
    : `Tu es un expert en gestion de projet. Réponds UNIQUEMENT en JSON valide.
La tâche n'est PAS bloquée :
- Titre : ${task.title}
- Description : ${task.description}
- Statut : ${task.status}
JSON :
{
  "isBlocked": false,
  "reason": "explication",
  "solutions": [{"title": "Conseil", "description": "conseil préventif", "priority": "faible"}],
  "urgency": "ignoré"
}
Génère 3 conseils préventifs.`;

  const text = await callGroq(prompt);
  return extractJSON(text);
}

// ── 8. Résumé personnalisé pour un membre ─────────────────────
async function generateMemberSummary(member) {
  const prompt = `Tu es un assistant de gestion de projet. Réponds UNIQUEMENT en JSON valide.
Membre :
- Nom : ${member.name}
- Tâches assignées : ${member.totalTasks}
- Terminées : ${member.doneTasks}
- En retard : ${member.lateTasks}
- En cours : ${member.inProgressTasks}
- Liste : ${JSON.stringify(member.tasks || [])}
JSON attendu :
{
  "greeting": "message personnalisé",
  "accomplished": "ce qu'il a accompli",
  "inProgress": "ce qu'il fait",
  "nextPriority": "prochaine tâche prioritaire",
  "encouragement": "message d'encouragement",
  "alert": "alerte si retards, sinon null"
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