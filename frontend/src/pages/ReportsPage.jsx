import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getReports, generateReport, fetchProjects, fetchStats } from "../services/api";
import Sidebar from "./Sidebar";

export default function ReportsPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);

  const [reports, setReports]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [generating, setGenerating]       = useState(false);
  const [error, setError]                 = useState(null);
  const [projets, setProjets]             = useState([]);
  const [statsMap, setStatsMap]           = useState({});
  const [selected, setSelected]           = useState([]);
  const [activeReport, setActiveReport]   = useState(null);
  const [searchProject, setSearchProject] = useState("");
  const [showDropdown, setShowDropdown]   = useState(false);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);

  const C = {
    green: "#9FB878", greenLight: "#f5f6ec", greenMid: "#dfe0c0", greenDark: "#5a6332",
    pink: "#d4538a", pinkLight: "#fce7f3", pinkMid: "#f4b8d4", pinkDark: "#7d1f52",
    orange: "#d4874a", orangeLight: "#fef3e8",
    blue: "#5a8ac4", blueLight: "#eaf2fb",
    bg: "#f6f6f2", card: "#ffffff",
    text: "#2d2d2a", textMuted: "#6e6e68", textLight: "#aaaaaa",
    border: "#e8e8e0", shadow: "0 2px 8px rgba(0,0,0,0.05)",
    redLight: "#fdecea", red: "#b23a3a",
    purpleLight: "#f3f0fa",
  };

  const card = (extra = {}) => ({
    background: C.card, borderRadius: "18px", padding: "24px",
    border: `1px solid ${C.border}`, boxShadow: C.shadow, ...extra,
  });

  const getBadge = (riskScore, lateTasks, totalTasks) => {
    const r = totalTasks > 0 ? lateTasks / totalTasks : 0;
    if (riskScore > 50 || r > 0.4) return { label: "En danger",     color: "#b23a3a", bg: "#fdecea", border: "#f5c6c6", dot: "🔴" };
    if (riskScore > 20 || r > 0.15) return { label: "Attention",    color: "#c27a2a", bg: "#fff3e0", border: "#fdd9b5", dot: "🟠" };
    return                                  { label: "En bonne voie",color: "#5a6332", bg: C.greenLight, border: C.greenMid, dot: "🟢" };
  };

  // Fermer le dropdown si on clique ailleurs
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    Promise.all([getReports(), fetchProjects()])
      .then(([reps, list]) => {
        setReports(reps || []);
        setProjets(list || []);
        setSelected([]);
        if (reps?.length > 0) {
          try { setActiveReport(JSON.parse(reps[0].content)); setActiveHistoryIdx(0); } catch {}
        }
      })
      .catch(() => setError("Impossible de charger les données."))
      .finally(() => setLoading(false));
  }, []);

  const filteredProjets = projets.filter(p =>
    p.name.toLowerCase().includes(searchProject.toLowerCase())
  );

  const toggleProject = (name) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const selectAll = () => { setSelected(projets.map(p => p.name)); setShowDropdown(false); };
  const clearAll  = () => setSelected([]);

  const handleGenerate = async () => {
    if (selected.length === 0) { setError("Sélectionnez au moins un projet."); return; }
    setGenerating(true); setError(null);
    try {
      const sMap = {};
      await Promise.all(
        projets.filter(p => selected.includes(p.name)).map(async (p) => {
          try { sMap[p.id] = await fetchStats(p.id); } catch { sMap[p.id] = null; }
        })
      );
      setStatsMap(sMap);

      const projectsData = projets.filter(p => selected.includes(p.name)).map(p => ({
        name: p.name,
        progress: sMap[p.id]?.kpis?.progressCount || 0,
        riskScore: sMap[p.id]?.riskScore || 0,
        lateTasks: sMap[p.id]?.kpis?.late || 0,
        blockedTasks: sMap[p.id]?.kpis?.blocked || 0,
        totalTasks: sMap[p.id]?.kpis?.total || 0,
        doneTasks: sMap[p.id]?.kpis?.done || 0,
        inProgress: sMap[p.id]?.kpis?.inProgress || 0,
        totalHours: sMap[p.id]?.kpis?.totalHours || 0,
        doneHours: sMap[p.id]?.kpis?.doneHours || 0,
        startDate: sMap[p.id]?.kpis?.startDate || null,
        endDate: sMap[p.id]?.kpis?.endDate || null,
        statusDist: sMap[p.id]?.statusDist || {},
        workload: sMap[p.id]?.workloadByMember || {},
        tasks: (sMap[p.id]?.ganttTasks || []).map(t => ({
          title: t.subject, status: t.status, hours: t.hours,
          late: t.late, done: t.done, assignee: t.assignee || "Non assigné",
          startDate: t.startDate, dueDate: t.dueDate,
        })),
        lateTasks: (sMap[p.id]?.lateTasks || []).map(t => ({
          title: t.subject, dueDate: t.dueDate, assignee: t.assignee || "Non assigné",
        })),
      }));

      const result = await generateReport(projectsData, selected);
      const updated = await getReports();
      setReports(updated);
      setActiveReport(result);
      setActiveHistoryIdx(0);
    } catch {
      setError("Erreur lors de la génération du rapport.");
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
  ];

  const prioColor = { haute: "#b23a3a", moyenne: "#c27a2a", faible: C.greenDark };
  const prioBg    = { haute: "#fdecea",  moyenne: "#fff3e0",  faible: C.greenLight };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: "100vh", background: C.bg, fontFamily: "'Segoe UI',Arial,sans-serif" }}>

    <Sidebar activePath="/rapports" onLogout={handleLogout} />

      {/* ══ MAIN ══ */}
      <main style={{ padding: "28px", overflowY: "auto" }}>

        {/* HEADER */}
        <div style={{ marginBottom: "20px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: "700", color: C.text, margin: "0 0 4px" }}>Rapports IA 📊</h1>
          <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
            Générez des rapports détaillés basés sur l'analyse de vos projets par l'IA
          </p>
        </div>

        {error && (
          <div style={{ background: "#fdecea", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#b23a3a", border: "1px solid #f5c6c6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#b23a3a", cursor: "pointer", fontSize: "16px" }}>✕</button>
          </div>
        )}

        {/* ══ BARRE DE GÉNÉRATION ══ */}
        <div style={{ ...card({ padding: "18px 20px", marginBottom: "20px" }) }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>

            {/* Titre */}
            <span style={{ fontSize: "13px", fontWeight: "700", color: C.text, whiteSpace: "nowrap" }}>
              Sélectionner les projets
            </span>

            {/* Dropdown de recherche + sélection */}
            <div ref={dropdownRef} style={{ position: "relative", flex: 1, minWidth: "220px", maxWidth: "400px" }}>
              {/* Input recherche */}
              <div
                onClick={() => { setShowDropdown(true); searchRef.current?.focus(); }}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "#fafaf8", border: `1.5px solid ${showDropdown ? C.green : C.border}`, borderRadius: showDropdown ? "12px 12px 0 0" : "12px", padding: "8px 14px", cursor: "text", transition: "border-color 0.15s" }}>
                <span style={{ fontSize: "14px" }}>🔍</span>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder={selected.length > 0 ? `${selected.length} projet(s) sélectionné(s) — rechercher...` : "Rechercher et sélectionner des projets..."}
                  value={searchProject}
                  onChange={e => { setSearchProject(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  style={{ border: "none", outline: "none", background: "transparent", fontSize: "12px", color: C.text, width: "100%" }}
                />
                {searchProject && (
                  <button onClick={(e) => { e.stopPropagation(); setSearchProject(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.textLight, fontSize: "14px", padding: 0 }}>✕</button>
                )}
                <span style={{ color: C.textLight, fontSize: "12px" }}>{showDropdown ? "▲" : "▼"}</span>
              </div>

              {/* Dropdown liste */}
              {showDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1.5px solid ${C.green}`, borderTop: "none", borderRadius: "0 0 12px 12px", zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", maxHeight: "280px", overflowY: "auto" }}>
                  {/* Actions rapides */}
                  <div style={{ display: "flex", gap: "8px", padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: C.greenLight }}>
                    <button onClick={selectAll}
                      style={{ background: C.green, color: "#fff", border: "none", borderRadius: "999px", padding: "4px 12px", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}>
                      ✓ Tout sélectionner ({projets.length})
                    </button>
                    {selected.length > 0 && (
                      <button onClick={clearAll}
                        style={{ background: "#fff", color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: "999px", padding: "4px 12px", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}>
                        ✕ Tout désélectionner
                      </button>
                    )}
                  </div>

                  {/* Liste des projets filtrés */}
                  {loading ? (
                    <div style={{ padding: "16px", textAlign: "center", color: C.textLight, fontSize: "12px" }}>Chargement...</div>
                  ) : filteredProjets.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center", color: C.textLight, fontSize: "12px" }}>Aucun projet trouvé pour "{searchProject}"</div>
                  ) : (
                    filteredProjets.map(p => {
                      const stats = statsMap[p.id];
                      const badge = getBadge(stats?.riskScore || 0, stats?.kpis?.late || 0, stats?.kpis?.total || 0);
                      const isSelected = selected.includes(p.name);
                      return (
                        <div key={p.id}
                          onClick={() => toggleProject(p.name)}
                          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", cursor: "pointer", background: isSelected ? C.greenLight : "#fff", borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#fafaf8"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isSelected ? C.greenLight : "#fff"; }}>
                          {/* Checkbox */}
                          <div style={{ width: "16px", height: "16px", borderRadius: "4px", border: `2px solid ${isSelected ? C.green : C.border}`, background: isSelected ? C.green : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                            {isSelected && <span style={{ color: "#fff", fontSize: "10px", fontWeight: "700" }}>✓</span>}
                          </div>
                          {/* Nom */}
                          <span style={{ fontSize: "13px", fontWeight: isSelected ? "600" : "400", color: isSelected ? C.greenDark : C.text, flex: 1 }}>{p.name}</span>
                          {/* Badge */}
                          <span style={{ fontSize: "10px", background: badge.bg, color: badge.color, padding: "2px 8px", borderRadius: "999px", border: `1px solid ${badge.border}`, fontWeight: "600", whiteSpace: "nowrap" }}>
                            {badge.dot} {badge.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Tags des projets sélectionnés */}
            {selected.length > 0 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", flex: 1 }}>
                {selected.map(name => (
                  <span key={name} style={{ display: "flex", alignItems: "center", gap: "5px", background: C.greenLight, border: `1px solid ${C.greenMid}`, color: C.greenDark, borderRadius: "999px", padding: "4px 10px", fontSize: "11px", fontWeight: "600" }}>
                    {name}
                    <button onClick={() => toggleProject(name)} style={{ background: "none", border: "none", cursor: "pointer", color: C.greenDark, fontSize: "12px", padding: 0, lineHeight: 1 }}>✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* Bouton générer */}
            <button onClick={handleGenerate} disabled={generating || selected.length === 0}
              style={{ background: generating || selected.length === 0 ? C.greenLight : C.green, color: generating || selected.length === 0 ? C.greenDark : "#fff", border: "none", padding: "10px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: "700", cursor: generating || selected.length === 0 ? "not-allowed" : "pointer", opacity: generating || selected.length === 0 ? 0.7 : 1, transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0 }}>
              {generating ? "🤖 Analyse en cours..." : `✦ Générer${selected.length > 0 ? ` (${selected.length})` : ""}`}
            </button>
          </div>
        </div>

        {/* ══ CONTENU PRINCIPAL : 2 colonnes si historique ══ */}
        <div style={{ display: "grid", gridTemplateColumns: reports.length > 0 ? "1fr 260px" : "1fr", gap: "20px", alignItems: "start" }}>

          {/* ── COLONNE GAUCHE : Rapport ── */}
          <div>
            {generating && (
              <div style={{ ...card({ background: C.greenLight, border: `1px solid ${C.greenMid}` }), textAlign: "center", padding: "60px" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🤖</div>
                <p style={{ fontSize: "16px", fontWeight: "600", color: C.greenDark, margin: "0 0 8px" }}>L'IA analyse vos projets en profondeur...</p>
                <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>Génération d'un rapport complet, cela peut prendre 20-30 secondes</p>
              </div>
            )}

            {!generating && !activeReport && (
              <div style={{ ...card(), textAlign: "center", padding: "60px" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
                <p style={{ fontSize: "16px", fontWeight: "600", color: C.text, margin: "0 0 8px" }}>Aucun rapport disponible</p>
                <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>Sélectionnez des projets ci-dessus et cliquez sur <b>Générer</b> pour créer votre premier rapport.</p>
              </div>
            )}

            {!generating && activeReport && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                {/* Stats portefeuille */}
                {activeReport.portfolioStats && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                    {[
                      { label: "Projets analysés",  val: activeReport.portfolioStats.totalProjects,    bg: C.green,      tc: "#fff" },
                      { label: "En bonne voie",      val: activeReport.portfolioStats.projectsOnTrack,  bg: C.greenLight, tc: C.greenDark },
                      { label: "À risque",           val: activeReport.portfolioStats.projectsAtRisk,   bg: "#fff3e0",    tc: "#c27a2a" },
                      { label: "En danger",          val: activeReport.portfolioStats.projectsInDanger, bg: C.redLight,   tc: C.red },
                    ].map((k, i) => (
                      <div key={i} style={{ ...card({ padding: "14px 16px", background: k.bg }) }}>
                        <p style={{ fontSize: "10px", color: k.tc, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 5px" }}>{k.label}</p>
                        <p style={{ fontSize: "26px", fontWeight: "700", color: k.tc, margin: 0 }}>{k.val ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Résumé exécutif */}
                {activeReport.summary && (
                  <div style={card({ background: C.greenLight, border: `1px solid ${C.greenMid}` })}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <p style={{ fontSize: "12px", fontWeight: "700", color: C.greenDark, textTransform: "uppercase", letterSpacing: "0.6px", margin: 0 }}>
                        📄 Résumé exécutif du portefeuille
                      </p>
                      {activeReport.nextReviewDate && (
                        <span style={{ fontSize: "10px", background: "#fff", color: C.greenDark, padding: "3px 10px", borderRadius: "999px", border: `1px solid ${C.greenMid}`, fontWeight: "600", whiteSpace: "nowrap", flexShrink: 0 }}>
                          Prochaine revue : {activeReport.nextReviewDate}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "14px", color: C.text, margin: 0, lineHeight: "1.8" }}>{activeReport.summary}</p>
                  </div>
                )}

                {/* Cartes par projet */}
                {Array.isArray(activeReport.projects) && activeReport.projects.map((proj, i) => {
                  const badge = proj.status === "danger"
                    ? { label: "En danger",     color: "#b23a3a", bg: "#fdecea", border: "#f5c6c6", dot: "🔴" }
                    : proj.status === "attention"
                    ? { label: "Attention",     color: "#c27a2a", bg: "#fff3e0", border: "#fdd9b5", dot: "🟠" }
                    : { label: "En bonne voie", color: "#5a6332", bg: C.greenLight, border: C.greenMid, dot: "🟢" };

                  const projectStats = Object.entries(statsMap).find(([id]) =>
                    projets.find(p => p.id === Number(id) && p.name === proj.name)
                  )?.[1];
                  const progress = proj.progress ?? projectStats?.kpis?.progressCount ?? 0;
                  const kpis = proj.kpis || {};

                  return (
                    <div key={i} style={card()}>
                      {/* En-tête */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                        <div>
                          <h3 style={{ fontSize: "17px", fontWeight: "700", color: C.text, margin: "0 0 8px" }}>{proj.name}</h3>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11px", background: badge.bg, color: badge.color, padding: "3px 10px", borderRadius: "999px", border: `1px solid ${badge.border}`, fontWeight: "600" }}>
                              {badge.dot} {badge.label}
                            </span>
                            {proj.riskScore > 0 && (
                              <span style={{ fontSize: "11px", background: proj.riskScore >= 50 ? "#fdecea" : proj.riskScore >= 20 ? "#fff3e0" : C.greenLight, color: proj.riskScore >= 50 ? C.red : proj.riskScore >= 20 ? "#c27a2a" : C.greenDark, padding: "3px 10px", borderRadius: "999px", border: `1px solid ${C.border}`, fontWeight: "600" }}>
                                Score de risque : {proj.riskScore}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontSize: "30px", fontWeight: "700", color: badge.color, margin: "0 0 2px" }}>{progress}%</p>
                          <p style={{ fontSize: "11px", color: C.textLight, margin: 0 }}>avancement</p>
                        </div>
                      </div>

                      {/* Barre progression */}
                      <div style={{ height: "8px", background: C.border, borderRadius: "999px", marginBottom: "16px" }}>
                        <div style={{ width: `${progress}%`, height: "8px", background: badge.color, borderRadius: "999px", transition: "width 0.5s" }} />
                      </div>

                      {/* KPIs */}
                      {kpis.totalTasks >= 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "7px", marginBottom: "16px" }}>
                          {[
                            { label: "Total",     val: kpis.totalTasks,   alert: false },
                            { label: "Terminées", val: kpis.doneTasks,    alert: false },
                            { label: "En cours",  val: kpis.inProgress,   alert: false },
                            { label: "À faire",   val: kpis.todoTasks,    alert: false },
                            { label: "En retard", val: kpis.lateTasks,    alert: kpis.lateTasks > 0 },
                            { label: "Bloquées",  val: kpis.blockedTasks, alert: kpis.blockedTasks > 0 },
                          ].map((k, j) => (
                            <div key={j} style={{ background: k.alert ? "#fdecea" : "#fafaf8", border: `1px solid ${k.alert ? "#f5c6c6" : C.border}`, borderRadius: "10px", padding: "8px 4px", textAlign: "center" }}>
                              <p style={{ fontSize: "16px", fontWeight: "700", margin: 0, color: k.alert ? C.red : C.text }}>{k.val ?? "—"}</p>
                              <p style={{ fontSize: "9px", color: k.alert ? C.red : C.textLight, margin: "2px 0 0" }}>{k.label}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Heures + vélocité */}
                      {(kpis.totalHours > 0 || kpis.velocityComment) && (
                        <div style={{ background: C.blueLight, borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center" }}>
                          {kpis.totalHours > 0 && (
                            <>
                              <div>
                                <p style={{ fontSize: "10px", color: C.blue, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 2px", fontWeight: "700" }}>Heures estimées</p>
                                <p style={{ fontSize: "18px", fontWeight: "700", color: C.blue, margin: 0 }}>{kpis.totalHours}h</p>
                              </div>
                              <div>
                                <p style={{ fontSize: "10px", color: C.blue, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 2px", fontWeight: "700" }}>Heures réalisées</p>
                                <p style={{ fontSize: "18px", fontWeight: "700", color: C.blue, margin: 0 }}>{kpis.doneHours}h</p>
                              </div>
                            </>
                          )}
                          {kpis.velocityComment && (
                            <p style={{ fontSize: "12px", color: C.blue, margin: 0, flex: 1, fontStyle: "italic" }}>💡 {kpis.velocityComment}</p>
                          )}
                        </div>
                      )}

                      {/* Prévision progression */}
                      {proj.progressionForecast && (
                        <div style={{ background: "#fafaf8", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "16px" }}>
                          <p style={{ fontSize: "10px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px" }}>📈 Prévision</p>
                          <p style={{ fontSize: "12px", color: C.text, margin: 0, lineHeight: "1.5" }}>{proj.progressionForecast}</p>
                        </div>
                      )}

                      {/* Analyse + Points forts côte à côte */}
                      <div style={{ display: "grid", gridTemplateColumns: proj.strengths?.length > 0 ? "3fr 2fr" : "1fr", gap: "14px", marginBottom: "16px" }}>
                        {proj.analysis && (
                          <div>
                            <p style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>📋 Analyse détaillée</p>
                            <p style={{ fontSize: "13px", color: C.text, margin: 0, lineHeight: "1.8", background: "#fafaf8", padding: "14px", borderRadius: "10px", border: `1px solid ${C.border}` }}>{proj.analysis}</p>
                          </div>
                        )}
                        {proj.strengths?.length > 0 && (
                          <div>
                            <p style={{ fontSize: "11px", fontWeight: "700", color: C.greenDark, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>✅ Points forts</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {proj.strengths.map((s, j) => (
                                <div key={j} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "8px 12px", background: C.greenLight, borderRadius: "8px", border: `1px solid ${C.greenMid}` }}>
                                  <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>→</span>
                                  <span style={{ fontSize: "12px", color: C.greenDark, lineHeight: "1.5" }}>{s}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Risques */}
                      {proj.risks?.length > 0 && (
                        <div style={{ marginBottom: "16px" }}>
                          <p style={{ fontSize: "11px", fontWeight: "700", color: "#b23a3a", textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>⚠️ Risques identifiés</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {proj.risks.map((risk, j) => (
                              <div key={j} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "10px 14px", background: "#fdecea", borderRadius: "8px", border: "1px solid #f5c6c6" }}>
                                <span style={{ color: "#b23a3a", flexShrink: 0, fontWeight: "700" }}>→</span>
                                <span style={{ fontSize: "12px", color: "#b23a3a", lineHeight: "1.6" }}>{risk}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Plan d'action */}
                      {proj.actionPlan?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <p style={{ fontSize: "11px", fontWeight: "700", color: C.blue, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 8px" }}>🎯 Plan d'action</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {proj.actionPlan.map((step, j) => (
                              <div key={j} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "12px 14px", background: C.blueLight, borderRadius: "10px", border: "1px solid #c5daf5" }}>
                                <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: C.blue, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>{step.step}</div>
                                <div style={{ flex: 1 }}>
                                  <p style={{ fontSize: "13px", color: C.text, margin: "0 0 6px", lineHeight: "1.5", fontWeight: "500" }}>{step.action}</p>
                                  {step.expectedResult && (
                                    <p style={{ fontSize: "11px", color: C.blue, margin: "0 0 6px", fontStyle: "italic" }}>✓ {step.expectedResult}</p>
                                  )}
                                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    <span style={{ fontSize: "10px", background: prioBg[step.priority] || C.greenLight, color: prioColor[step.priority] || C.greenDark, padding: "2px 8px", borderRadius: "999px", fontWeight: "600" }}>
                                      {step.priority}
                                    </span>
                                    {step.deadline && (
                                      <span style={{ fontSize: "10px", background: "#fff", color: C.textMuted, padding: "2px 8px", borderRadius: "999px", border: `1px solid ${C.border}` }}>
                                        📅 {step.deadline}
                                      </span>
                                    )}
                                    {step.owner && (
                                      <span style={{ fontSize: "10px", background: "#fff", color: C.blue, padding: "2px 8px", borderRadius: "999px", border: "1px solid #c5daf5" }}>
                                        👤 {step.owner}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Workload + Timeline */}
                      {(proj.workloadSummary || proj.timeline) && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          {proj.workloadSummary && (
                            <div style={{ background: C.purpleLight, borderRadius: "12px", padding: "12px 14px", border: "1px solid #d8d0f0" }}>
                              <p style={{ fontSize: "11px", fontWeight: "700", color: "#4a3a7a", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>👥 Charge de travail</p>
                              <p style={{ fontSize: "12px", color: "#4a3a7a", margin: 0, lineHeight: "1.6" }}>{proj.workloadSummary}</p>
                            </div>
                          )}
                          {proj.timeline && (
                            <div style={{ background: C.orangeLight, borderRadius: "12px", padding: "12px 14px", border: "1px solid #fdd9b5" }}>
                              <p style={{ fontSize: "11px", fontWeight: "700", color: "#7a4520", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>📅 Planning</p>
                              <p style={{ fontSize: "12px", color: "#7a4520", margin: "0 0 4px", fontWeight: "600" }}>
                                {proj.timeline.isOnSchedule ? "✅ Dans les délais" : "⚠️ Hors délais"}
                              </p>
                              <p style={{ fontSize: "11px", color: "#7a4520", margin: 0, lineHeight: "1.4" }}>{proj.timeline.scheduleComment}</p>
                              {proj.timeline.projectedCompletion && (
                                <p style={{ fontSize: "11px", color: "#7a4520", margin: "4px 0 0", fontWeight: "600" }}>
                                  🎯 {proj.timeline.projectedCompletion}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Recommandations globales */}
                {activeReport.globalRecommendations?.length > 0 && (
                  <div style={card({ border: `1px solid ${C.pinkMid}`, background: C.pinkLight })}>
                    <p style={{ fontSize: "12px", fontWeight: "700", color: C.pinkDark, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 12px" }}>
                      🌐 Recommandations globales du portefeuille
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {activeReport.globalRecommendations.map((rec, i) => (
                        <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", background: "#fff", borderRadius: "10px", padding: "10px 14px", border: `1px solid ${C.pinkMid}` }}>
                          <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: C.pink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", flexShrink: 0 }}>{i + 1}</div>
                          <span style={{ fontSize: "13px", color: C.pinkDark, lineHeight: "1.7" }}>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── COLONNE DROITE : Historique ── */}
          {reports.length > 0 && (
            <div style={{ position: "sticky", top: "28px" }}>
              <div style={card({ padding: "16px" })}>
                <p style={{ fontSize: "12px", fontWeight: "700", color: C.text, margin: "0 0 4px" }}>🕐 Historique</p>
                <p style={{ fontSize: "10px", color: C.textMuted, margin: "0 0 12px", lineHeight: "1.4" }}>
                  Vos rapports précédents. Cliquez pour revoir un ancien rapport sans le régénérer.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "500px", overflowY: "auto" }}>
                  {reports.map((r, i) => {
                    let parsed = {};
                    try { parsed = JSON.parse(r.content); } catch {}
                    const isActive = i === activeHistoryIdx;
                    return (
                      <div key={i}
                        onClick={() => { setActiveReport(parsed); setActiveHistoryIdx(i); }}
                        style={{ padding: "10px 12px", borderRadius: "10px", cursor: "pointer", border: `1.5px solid ${isActive ? C.green : C.border}`, background: isActive ? C.greenLight : "#fafaf8", transition: "all 0.15s" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: isActive ? C.greenDark : C.textMuted }}>
                            Rapport #{reports.length - i}
                          </span>
                          <span style={{ fontSize: "10px", color: C.textLight }}>
                            {new Date(r.created_at || Date.now()).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        {parsed.summary && (
                          <p style={{ fontSize: "10px", color: isActive ? C.greenDark : C.text, margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {parsed.summary}
                          </p>
                        )}
                        {parsed.portfolioStats && (
                          <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                            <span style={{ fontSize: "9px", background: C.greenLight, color: C.greenDark, padding: "1px 6px", borderRadius: "999px", fontWeight: "600" }}>
                              {parsed.portfolioStats.totalProjects} projets
                            </span>
                            <span style={{ fontSize: "9px", background: "#fafaf8", color: C.textMuted, padding: "1px 6px", borderRadius: "999px", border: `1px solid ${C.border}` }}>
                              {parsed.portfolioStats.averageProgress}% moy.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}