import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getReports, generateReport, fetchProjects, fetchStats } from "../services/api";

export default function ReportsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [reports, setReports]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState(null);
  const [projets, setProjets]       = useState([]);
  const [statsMap, setStatsMap]     = useState({});
  const [selected, setSelected]     = useState([]);
  const [activeReport, setActiveReport] = useState(null);

  const C = {
    green: "#9FB878", greenLight: "#f5f6ec", greenMid: "#dfe0c0", greenDark: "#5a6332",
    pink: "#d4538a", pinkLight: "#fce7f3", pinkMid: "#f4b8d4", pinkDark: "#7d1f52",
    orange: "#d4874a", orangeLight: "#fef3e8",
    blue: "#5a8ac4", blueLight: "#eaf2fb",
    bg: "#f6f6f2", card: "#ffffff",
    text: "#2d2d2a", textMuted: "#6e6e68", textLight: "#aaaaaa",
    border: "#e8e8e0", shadow: "0 2px 8px rgba(0,0,0,0.05)",
  };

  const card = (extra = {}) => ({
    background: C.card, borderRadius: "18px", padding: "24px",
    border: `1px solid ${C.border}`, boxShadow: C.shadow, ...extra,
  });

  const getBadge = (riskScore, lateTasks, totalTasks) => {
    const lateRatio = totalTasks > 0 ? lateTasks / totalTasks : 0;
    if (riskScore > 50 || lateRatio > 0.4)
      return { label: "En danger",    color: "#b23a3a", bg: "#fdecea", border: "#f5c6c6", dot: "🔴" };
    if (riskScore > 20 || lateRatio > 0.15)
      return { label: "Attention",    color: "#c27a2a", bg: "#fff3e0", border: "#fdd9b5", dot: "🟠" };
    return   { label: "En bonne voie", color: "#5a6332", bg: C.greenLight, border: C.greenMid, dot: "🟢" };
  };

  useEffect(() => {
  Promise.all([getReports(), fetchProjects()])
    .then(([reps, list]) => {
      setReports(reps || []);
      setProjets(list || []);
      setSelected((list || []).map(p => p.name));
      if (reps?.length > 0) {
        try { setActiveReport(JSON.parse(reps[0].content)); } catch {}
      }
    })
    .catch(() => setError("Impossible de charger les données."))
    .finally(() => setLoading(false));
  }, []);

  const toggleProject = (name) => {
    setSelected(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const toggleAll = () => {
    setSelected(selected.length === projets.length ? [] : projets.map(p => p.name));
  };

  const handleGenerate = async () => {
  if (selected.length === 0) {
    setError("Sélectionnez au moins un projet.");
    return;
  }
  setGenerating(true);
  setError(null);
  try {
    // Charge les stats seulement des projets sélectionnés
    const sMap = {};
    await Promise.all(
      projets
        .filter(p => selected.includes(p.name))
        .map(async (p) => {
          try { sMap[p.id] = await fetchStats(p.id); } catch { sMap[p.id] = null; }
        })
    );
    setStatsMap(sMap);

const projectsData = projets
  .filter(p => selected.includes(p.name))
  .map(p => ({
    name:         p.name,
    progress:     sMap[p.id]?.kpis?.progressCount || 0,
    riskScore:    sMap[p.id]?.riskScore || 0,
    lateTasks:    sMap[p.id]?.kpis?.late || 0,
    blockedTasks: sMap[p.id]?.kpis?.blocked || 0,
    totalTasks:   sMap[p.id]?.kpis?.total || 0,
    doneTasks:    sMap[p.id]?.kpis?.done || 0,
    inProgress:   sMap[p.id]?.kpis?.inProgress || 0,
    totalHours:   sMap[p.id]?.kpis?.totalHours || 0,
    doneHours:    sMap[p.id]?.kpis?.doneHours || 0,
    startDate:    sMap[p.id]?.kpis?.startDate || null,
    endDate:      sMap[p.id]?.kpis?.endDate || null,
    statusDist:   sMap[p.id]?.statusDist || {},
    workload:     sMap[p.id]?.workloadByMember || {},
    tasks:        (sMap[p.id]?.ganttTasks || []).map(t => ({
      title:     t.subject,
      status:    t.status,
      hours:     t.hours,
      late:      t.late,
      done:      t.done,
      assignee:  t.assignee || "Non assigné",
      startDate: t.startDate,
      dueDate:   t.dueDate,
    })),
    lateTasks: (sMap[p.id]?.lateTasks || []).map(t => ({
      title:   t.subject,
      dueDate: t.dueDate,
      assignee: t.assignee || "Non assigné",
    })),
    }));

    const result = await generateReport(projectsData, selected);
    const updated = await getReports();
    setReports(updated);
    setActiveReport(result);
  } catch {
    setError("Erreur lors de la génération.");
  } finally {
    setGenerating(false);
  }
  };

  const handleLogout = () => {
    localStorage.removeItem("jwt");
    localStorage.removeItem("user");
    navigate("/");
  };

  const navItems = [
    { label: "Dashboard",   path: "/dashboard" },
    { label: "Mes projets", path: "/projets" },
    { label: "Mes tâches",  path: "/taches" },
    { label: "Rapports IA", path: "/rapports", active: true },
    { label: "Analyse IA",  path: "/ai" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh", background: C.bg, fontFamily: "'Segoe UI',Arial,sans-serif" }}>

      {/* SIDEBAR */}
      <aside style={{ background: "#fff", borderRight: `1px solid ${C.border}`, padding: "24px 0", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 20px 28px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>🐝</div>
            <span style={{ fontSize: "16px", fontWeight: "700", color: C.text }}>lightproject</span>
          </div>
          <div style={{ padding: "0 12px" }}>
            {navItems.map(item => (
              <div key={item.path} onClick={() => navigate(item.path)}
                style={{ padding: "10px 14px", borderRadius: "12px", fontSize: "13px", cursor: "pointer", marginBottom: "3px",
                  color: item.active ? C.greenDark : C.textMuted,
                  background: item.active ? C.greenLight : "transparent",
                  fontWeight: item.active ? "600" : "400",
                  borderLeft: item.active ? `3px solid ${C.green}` : "3px solid transparent" }}>
                {item.label}
              </div>
            ))}
          </div>
          <div style={{ height: "1px", background: C.border, margin: "16px" }} />
          <div style={{ padding: "0 12px" }}>
            <p style={{ fontSize: "10px", color: C.textLight, textTransform: "uppercase", letterSpacing: "1px", padding: "0 14px", margin: "0 0 6px" }}>Compte</p>
            <div style={{ padding: "10px 14px", borderRadius: "12px", fontSize: "13px", color: C.textMuted, cursor: "pointer" }} onClick={() => navigate("/profil")}>Mon profil</div>
            <div style={{ padding: "10px 14px", borderRadius: "12px", fontSize: "13px", color: C.pink, cursor: "pointer", fontWeight: "500" }} onClick={handleLogout}>Déconnexion</div>
          </div>
        </div>
        <div style={{ margin: "0 16px" }}>
          <div style={{ background: C.greenLight, borderRadius: "14px", padding: "12px", display: "flex", alignItems: "center", gap: "10px", border: `1px solid ${C.greenMid}` }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "700", color: "#fff" }}>
              {user.name?.charAt(0)?.toUpperCase() || "A"}
            </div>
            <div>
              <p style={{ fontSize: "13px", fontWeight: "600", color: C.text, margin: 0 }}>{user.name || "Admin"}</p>
              <p style={{ fontSize: "11px", color: C.textMuted, margin: 0 }}>{user.isAdmin ? "Administrateur" : "Membre"}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ padding: "32px", overflowY: "auto" }}>

        {/* HEADER */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: C.text, margin: "0 0 4px" }}>Rapports IA</h1>
          <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>{reports.length} rapport{reports.length !== 1 ? "s" : ""} généré{reports.length !== 1 ? "s" : ""}</p>
        </div>

        {error && (
          <div style={{ background: "#fdecea", borderRadius: "12px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#b23a3a", border: "1px solid #f5c6c6" }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "20px", alignItems: "start" }}>

          {/* PANNEAU GAUCHE — Sélection projets */}
          <div style={card({ padding: "20px" })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", color: C.text }}>Projets à analyser</span>
              <button onClick={toggleAll}
                style={{ background: "transparent", border: "none", fontSize: "11px", color: C.blue, cursor: "pointer", fontWeight: "600" }}>
                {selected.length === projets.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            </div>

            {loading ? (
              <p style={{ fontSize: "12px", color: C.textLight, textAlign: "center", padding: "12px" }}>Chargement...</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                {projets.map(p => {
                  const stats = statsMap[p.id];
                  const riskScore = stats?.riskScore || 0;
                  const lateTasks = stats?.kpis?.late || 0;
                  const totalTasks = stats?.kpis?.total || 0;
                  const badge = getBadge(riskScore, lateTasks, totalTasks);
                  const isSelected = selected.includes(p.name);
                  return (
                    <div key={p.id} onClick={() => toggleProject(p.name)}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", cursor: "pointer", border: `1px solid ${isSelected ? C.greenMid : C.border}`, background: isSelected ? C.greenLight : "#fafaf8", transition: "all 0.15s" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "5px", border: `2px solid ${isSelected ? C.green : C.border}`, background: isSelected ? C.green : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isSelected && <span style={{ color: "#fff", fontSize: "11px", fontWeight: "700" }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <p style={{ fontSize: "12px", fontWeight: "600", color: C.text, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                        <span style={{ fontSize: "10px", background: badge.bg, color: badge.color, padding: "1px 7px", borderRadius: "999px", border: `1px solid ${badge.border}`, fontWeight: "600" }}>
                          {badge.dot} {badge.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={handleGenerate} disabled={generating || selected.length === 0}
              style={{ width: "100%", background: generating || selected.length === 0 ? C.greenLight : C.green, color: generating || selected.length === 0 ? C.greenDark : "#fff", border: "none", padding: "11px", borderRadius: "12px", fontSize: "13px", fontWeight: "600", cursor: generating || selected.length === 0 ? "not-allowed" : "pointer", opacity: generating || selected.length === 0 ? 0.7 : 1, transition: "all 0.2s" }}>
              {generating ? "🤖 Analyse en cours..." : `✦ Générer (${selected.length} projet${selected.length > 1 ? "s" : ""})`}
            </button>

            {/* Historique */}
            {reports.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                <p style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>Historique</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                  {reports.map((r, i) => {
                    let parsed = {};
                    try { parsed = JSON.parse(r.content); } catch {}
                    const isActive = activeReport === parsed;
                    return (
                      <div key={i} onClick={() => setActiveReport(parsed)}
                        style={{ padding: "8px 10px", borderRadius: "10px", cursor: "pointer", border: `1px solid ${C.border}`, background: "#fafaf8", transition: "all 0.15s" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                          <span style={{ fontSize: "11px", fontWeight: "600", color: C.textMuted }}>Rapport #{reports.length - i}</span>
                          <span style={{ fontSize: "10px", color: C.textLight }}>{new Date(r.created_at || Date.now()).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                        </div>
                        {parsed.summary && <p style={{ fontSize: "10px", color: C.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{parsed.summary}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* PANNEAU DROIT — Rapport détaillé */}
          <div>
            {generating && (
              <div style={{ ...card({ background: C.greenLight, border: `1px solid ${C.greenMid}` }), textAlign: "center", padding: "48px" }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>🤖</div>
                <p style={{ fontSize: "14px", fontWeight: "600", color: C.greenDark, margin: "0 0 6px" }}>L'IA analyse vos projets...</p>
                <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>Cela peut prendre quelques secondes</p>
              </div>
            )}

            {!generating && !activeReport && (
              <div style={{ ...card(), textAlign: "center", padding: "60px" }}>
                <div style={{ fontSize: "40px", marginBottom: "16px" }}>📊</div>
                <p style={{ fontSize: "15px", fontWeight: "600", color: C.text, margin: "0 0 8px" }}>Aucun rapport sélectionné</p>
                <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>Sélectionnez vos projets et cliquez sur Générer, ou choisissez un rapport dans l'historique.</p>
              </div>
            )}

            {!generating && activeReport && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                {/* Résumé global */}
                {activeReport.summary && (
                  <div style={card({ background: C.greenLight, border: `1px solid ${C.greenMid}` })}>
                    <p style={{ fontSize: "11px", fontWeight: "700", color: C.greenDark, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>Résumé global</p>
                    <p style={{ fontSize: "14px", color: C.text, margin: 0, lineHeight: "1.6" }}>{activeReport.summary}</p>
                  </div>
                )}

                {/* Cartes par projet */}
                {Array.isArray(activeReport.projects) && activeReport.projects.map((proj, i) => {
                  const stats = Object.values(statsMap).find((_, idx) => projets[idx]?.name === proj.name);
                  const riskScore = proj.riskScore || 0;
                  const badge = proj.status === "danger"
                    ? { label: "En danger",     color: "#b23a3a", bg: "#fdecea", border: "#f5c6c6", dot: "🔴" }
                    : proj.status === "attention"
                    ? { label: "Attention",     color: "#c27a2a", bg: "#fff3e0", border: "#fdd9b5", dot: "🟠" }
                    : { label: "En bonne voie", color: "#5a6332", bg: C.greenLight, border: C.greenMid, dot: "🟢" };

                  const projectStats = Object.entries(statsMap).find(([id]) => projets.find(p => p.id === Number(id) && p.name === proj.name))?.[1];
                  const progress = projectStats?.kpis?.progressCount || 0;

                  return (
                    <div key={i} style={card()}>
                      {/* En-tête projet */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                        <div>
                          <h3 style={{ fontSize: "16px", fontWeight: "700", color: C.text, margin: "0 0 6px" }}>{proj.name}</h3>
                          <span style={{ fontSize: "11px", background: badge.bg, color: badge.color, padding: "3px 10px", borderRadius: "999px", border: `1px solid ${badge.border}`, fontWeight: "600" }}>
                            {badge.dot} {badge.label}
                          </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: "24px", fontWeight: "700", color: C.green, margin: "0 0 2px" }}>{progress}%</p>
                          <p style={{ fontSize: "11px", color: C.textLight, margin: 0 }}>avancement</p>
                        </div>
                      </div>

                      {/* Barre de progression */}
                      <div style={{ height: "8px", background: C.border, borderRadius: "999px", marginBottom: "16px" }}>
                        <div style={{ width: `${progress}%`, height: "8px", background: badge.color, borderRadius: "999px", transition: "width 0.5s" }} />
                      </div>

                      {/* Analyse IA */}
                      {proj.analysis && (
                        <div style={{ marginBottom: "16px" }}>
                          <p style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 6px" }}>Analyse</p>
                          <p style={{ fontSize: "13px", color: C.text, margin: 0, lineHeight: "1.6", background: "#fafaf8", padding: "12px", borderRadius: "10px", border: `1px solid ${C.border}` }}>{proj.analysis}</p>
                        </div>
                      )}

                      {/* Risques */}
                      {proj.risks?.length > 0 && (
                        <div style={{ marginBottom: "16px" }}>
                          <p style={{ fontSize: "11px", fontWeight: "700", color: "#b23a3a", textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>⚠ Risques identifiés</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {proj.risks.map((risk, j) => (
                              <div key={j} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "8px 12px", background: "#fdecea", borderRadius: "8px", border: "1px solid #f5c6c6" }}>
                                <span style={{ color: "#b23a3a", flexShrink: 0 }}>→</span>
                                <span style={{ fontSize: "12px", color: "#b23a3a", lineHeight: "1.5" }}>{risk}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Plan d'action */}
                      {proj.actionPlan?.length > 0 && (
                        <div>
                          <p style={{ fontSize: "11px", fontWeight: "700", color: C.blue, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>Plan d'action</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {proj.actionPlan.map((step, j) => {
                              const prioColor = step.priority === "haute" ? "#b23a3a" : step.priority === "moyenne" ? "#c27a2a" : C.greenDark;
                              const prioBg = step.priority === "haute" ? "#fdecea" : step.priority === "moyenne" ? "#fff3e0" : C.greenLight;
                              return (
                                <div key={j} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "10px 12px", background: C.blueLight, borderRadius: "10px", border: `1px solid #c5daf5` }}>
                                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: C.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>{step.step}</div>
                                  <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: "12px", color: C.text, margin: "0 0 4px", lineHeight: "1.5" }}>{step.action}</p>
                                    <span style={{ fontSize: "10px", background: prioBg, color: prioColor, padding: "1px 7px", borderRadius: "999px", fontWeight: "600" }}>
                                      Priorité {step.priority}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Recommandations globales */}
                {activeReport.globalRecommendations?.length > 0 && (
                  <div style={card({ border: `1px solid ${C.pinkMid}`, background: C.pinkLight })}>
                    <p style={{ fontSize: "11px", fontWeight: "700", color: C.pinkDark, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 10px" }}>Recommandations globales</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {activeReport.globalRecommendations.map((rec, i) => (
                        <div key={i} style={{ display: "flex", gap: "8px" }}>
                          <span style={{ color: C.pink, flexShrink: 0 }}>→</span>
                          <span style={{ fontSize: "13px", color: C.pinkDark, lineHeight: "1.5" }}>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}