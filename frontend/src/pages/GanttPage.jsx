import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { fetchProjects, fetchStats } from "../services/api";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  green: "#9FB878", greenLight: "#f5f6ec", greenMid: "#dfe0c0", greenDark: "#5a6332",
  pink: "#d4538a", pinkLight: "#fce7f3", pinkMid: "#f4b8d4", pinkDark: "#7d1f52",
  orange: "#d4874a", orangeLight: "#fef3e8",
  blue: "#5a8ac4", blueLight: "#eaf2fb",
  purple: "#9b8dc2", purpleLight: "#f3f0fa",
  red: "#b23a3a", redLight: "#fdecea", redMid: "#f5c6c6",
  bg: "#f6f6f2", card: "#ffffff",
  text: "#2d2d2a", textMuted: "#6e6e68", textLight: "#aaaaaa",
  border: "#e8e8e0",
  shadow: "0 2px 8px rgba(0,0,0,0.05)",
  shadowMd: "0 4px 16px rgba(0,0,0,0.08)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function taskStatus(t) {
  if (t.done) return "done";
  const s = (t.status || "").toLowerCase();
  if (s.includes("progress") || s.includes("cours")) return "progress";
  if (t.late) return "late";
  return "todo";
}

function diffDays(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateShort(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function getRange(tasks) {
  const dates = tasks.flatMap(t => [t.startDate, t.dueDate]).filter(Boolean).map(d => new Date(d));
  if (!dates.length) {
    const n = new Date();
    return { min: n, max: new Date(n.getTime() + 90 * 86400000) };
  }
  const mn = new Date(Math.min(...dates));
  const mx = new Date(Math.max(...dates));
  mn.setDate(mn.getDate() - 5);
  mx.setDate(mx.getDate() + 14);
  return { min: mn, max: mx };
}

function getMonthLabels(min, max, px) {
  const labels = [];
  let cur = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cur <= max) {
    const offset = diffDays(min, cur);
    labels.push({
      label: cur.toLocaleDateString("fr-FR", { month: "long", year: "2-digit" }),
      left: Math.max(0, offset * px),
      days: new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate(),
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return labels;
}

function getDayLabels(min, max, px) {
  const labels = [];
  const d = new Date(min);
  while (d <= max) {
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isToday = d.toDateString() === new Date().toDateString();
    labels.push({
      label: d.getDate(),
      left: diffDays(min, d) * px,
      isWeekend,
      isToday,
    });
    d.setDate(d.getDate() + 1);
  }
  return labels;
}

const STATUS = {
  done:     { color: "#9FB878", bg: "#f5f6ec", dark: "#5a6332", border: "#dfe0c0", label: "Terminée",  icon: "✓" },
  late:     { color: "#b23a3a", bg: "#fdecea", dark: "#7a1a1a", border: "#f5c6c6", label: "En retard", icon: "!" },
  progress: { color: "#5a8ac4", bg: "#eaf2fb", dark: "#2a4f82", border: "#c5daf5", label: "En cours",  icon: "▶" },
  todo:     { color: "#9b8dc2", bg: "#f3f0fa", dark: "#4a3a7a", border: "#d5cff0", label: "À faire",   icon: "○" },
};

const DAY_PX = { week: 32, month: 16, quarter: 7 };

const LABEL_W = 260;
const ROW_H   = 44;
const HEAD_H  = 56;

// ─── Composant principal ───────────────────────────────────────────────────────
export default function GanttPage() {
  const navigate    = useNavigate();
  const user        = JSON.parse(localStorage.getItem("user") || "{}");
  const scrollRef   = useRef(null);

  const [projects,   setProjects]   = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [allTasks,   setAllTasks]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [loadingProj,setLoadingProj]= useState(true);
  const [error,      setError]      = useState(null);
  const [zoom,       setZoom]       = useState("month");
  const [filter,     setFilter]     = useState("all");
  const [search,     setSearch]     = useState("");
  const [tooltip,    setTooltip]    = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [exporting,  setExporting]  = useState(false);
  const [groupBy,    setGroupBy]    = useState("none"); // none | status | assignee

  // ── Charger les projets ────────────────────────────────────────────────────
  useEffect(() => {
    fetchProjects()
      .then(list => {
        setProjects(list || []);
        if (list?.length) setSelectedId(list[0].id);
      })
      .catch(() => setError("Impossible de charger les projets."))
      .finally(() => setLoadingProj(false));
  }, []);

  // ── Charger le Gantt quand projet change ───────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setAllTasks([]);
    fetchStats(selectedId)
      .then(data => setAllTasks(data?.ganttTasks || []))
      .catch(() => setError("Erreur de chargement des tâches."))
      .finally(() => setLoading(false));
  }, [selectedId]);

  // ── Scroller vers aujourd'hui ─────────────────────────────────────────────
  useEffect(() => {
    if (!scrollRef.current || !allTasks.length) return;
    const { min } = getRange(allTasks.filter(t => t.startDate || t.dueDate));
    const px = DAY_PX[zoom] || 16;
    const off = diffDays(min, new Date()) * px - 200;
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, off);
    }, 100);
  }, [allTasks, zoom]);

  // ── Filtrage ───────────────────────────────────────────────────────────────
  const filteredTasks = useCallback(() => {
    let tasks = allTasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      tasks = tasks.filter(t =>
        (t.subject || "").toLowerCase().includes(q) ||
        (t.assignee || "").toLowerCase().includes(q)
      );
    }
    if (filter !== "all") tasks = tasks.filter(t => taskStatus(t) === filter);
    return tasks;
  }, [allTasks, filter, search]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total    = allTasks.length;
  const done     = allTasks.filter(t => t.done).length;
  const late     = allTasks.filter(t => t.late && !t.done).length;
  const progress = allTasks.filter(t => taskStatus(t) === "progress").length;
  const todo     = allTasks.filter(t => taskStatus(t) === "todo").length;
  const pct      = total ? Math.round((done / total) * 100) : 0;

  // ── Export PDF avec vrai Gantt SVG ────────────────────────────────────────
  async function exportPDF() {
    const tasks = filteredTasks().filter(t => t.startDate || t.dueDate);
    const proj  = projects.find(p => String(p.id) === String(selectedId));
    const projName = proj?.name || "Projet";
    const today = new Date().toLocaleDateString("fr-FR");

    if (!tasks.length) {
      alert("Aucune tâche avec des dates à exporter.");
      return;
    }

    setExporting(true);

    const px_pdf = 10;
    const labelW_pdf = 220;
    const rowH_pdf = 28;
    const headH_pdf = 48;
    const { min, max } = getRange(tasks);
    const totalDays = diffDays(min, max) + 1;
    const chartW = totalDays * px_pdf;
    const svgW = labelW_pdf + chartW;
    const svgH = headH_pdf + tasks.length * rowH_pdf + 20;
    const todayOff = diffDays(min, new Date()) * px_pdf;
    const months = getMonthLabels(min, max, px_pdf);

    // Bandes weekend
    const weekendBands = [];
    const d = new Date(min);
    while (d <= max) {
      if (d.getDay() === 6) {
        weekendBands.push(diffDays(min, d) * px_pdf);
      }
      d.setDate(d.getDate() + 1);
    }

    // Génération des barres SVG
    const bars = tasks.map((t, i) => {
      const st = taskStatus(t);
      const col = STATUS[st].color;
      const s = new Date(t.startDate || t.dueDate);
      const e = new Date(t.dueDate || t.startDate);
      const left = diffDays(min, s) * px_pdf;
      const dur = Math.max(1, diffDays(s, e) + 1);
      const width = dur * px_pdf;
      const pct_t = t.done ? 100 : (t.percentageDone || 0);
      const y = headH_pdf + i * rowH_pdf;
      const barY = y + (rowH_pdf - 16) / 2;

      const name = (t.subject || "—").substring(0, 30);
      const truncated = (t.subject || "").length > 30 ? name + "…" : name;

      return `
        <!-- Row ${i} -->
        <rect x="0" y="${y}" width="${svgW}" height="${rowH_pdf}" fill="${i % 2 === 0 ? '#ffffff' : '#fafaf8'}" />
        <line x1="0" y1="${y + rowH_pdf}" x2="${svgW}" y2="${y + rowH_pdf}" stroke="#e8e8e0" stroke-width="0.5"/>
        
        <!-- Label -->
        <rect x="0" y="${y}" width="${labelW_pdf}" height="${rowH_pdf}" fill="${i % 2 === 0 ? '#ffffff' : '#fafaf8'}"/>
        <line x1="${labelW_pdf}" y1="${y}" x2="${labelW_pdf}" y2="${y + rowH_pdf}" stroke="#e8e8e0" stroke-width="1"/>
        <circle cx="14" cy="${y + rowH_pdf / 2}" r="4" fill="${col}"/>
        <text x="24" y="${y + rowH_pdf / 2 + 4}" font-family="Arial,sans-serif" font-size="11" fill="#2d2d2a" font-weight="500">${truncated}</text>
        ${t.assignee ? `<text x="24" y="${y + rowH_pdf / 2 + 16}" font-family="Arial,sans-serif" font-size="9" fill="#aaaaaa">${(t.assignee || "").substring(0, 28)}</text>` : ""}
        
        <!-- Gantt bar -->
        <rect x="${labelW_pdf + left}" y="${barY}" width="${Math.max(width, 6)}" height="16" rx="4" fill="${col}" opacity="0.9"/>
        ${pct_t > 0 && pct_t < 100 ? `<rect x="${labelW_pdf + left}" y="${barY}" width="${Math.max(1, (width * pct_t) / 100)}" height="16" rx="4" fill="${STATUS[st].dark}" opacity="0.6"/>` : ""}
        ${width > 50 ? `<text x="${labelW_pdf + left + 6}" y="${barY + 11}" font-family="Arial,sans-serif" font-size="9" fill="${st === 'todo' ? '#4a3a7a' : '#fff'}" font-weight="600">${formatDateShort(t.dueDate)}</text>` : ""}
      `;
    });

    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="font-family:Arial,sans-serif">
        <defs>
          <style>text { font-family: Arial, sans-serif; }</style>
        </defs>
        
        <!-- Background -->
        <rect width="${svgW}" height="${svgH}" fill="#ffffff"/>
        
        <!-- Weekend bandes -->
        ${weekendBands.map(x => `<rect x="${labelW_pdf + x}" y="${headH_pdf}" width="${px_pdf * 2}" height="${svgH - headH_pdf}" fill="#f0f0e8" opacity="0.6"/>`).join("")}
        
        <!-- Month columns header -->
        <rect x="0" y="0" width="${svgW}" height="${headH_pdf}" fill="#f6f6f2"/>
        <line x1="0" y1="${headH_pdf}" x2="${svgW}" y2="${headH_pdf}" stroke="#e8e8e0" stroke-width="1.5"/>
        
        <!-- Label header -->
        <rect x="0" y="0" width="${labelW_pdf}" height="${headH_pdf}" fill="#f0f1e8"/>
        <line x1="${labelW_pdf}" y1="0" x2="${labelW_pdf}" y2="${svgH}" stroke="#dfe0c0" stroke-width="1.5"/>
        <text x="14" y="${headH_pdf / 2 + 4}" font-size="11" font-weight="700" fill="#5a6332">Tâche</text>
        
        <!-- Month labels -->
        ${months.map((m, i) => `
          <text x="${labelW_pdf + m.left + 6}" y="20" font-size="10" font-weight="700" fill="#5a6332">${m.label.toUpperCase()}</text>
          ${i > 0 ? `<line x1="${labelW_pdf + m.left}" y1="0" x2="${labelW_pdf + m.left}" y2="${svgH}" stroke="#e8e8e0" stroke-width="0.8" stroke-dasharray="4,2"/>` : ""}
        `).join("")}
        
        <!-- Today line -->
        ${todayOff >= 0 && todayOff <= chartW ? `
          <line x1="${labelW_pdf + todayOff}" y1="0" x2="${labelW_pdf + todayOff}" y2="${svgH}" stroke="#d4874a" stroke-width="2" stroke-dasharray="6,3"/>
          <rect x="${labelW_pdf + todayOff - 18}" y="26" width="36" height="14" rx="4" fill="#d4874a"/>
          <text x="${labelW_pdf + todayOff}" y="37" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">AUJOURD'HUI</text>
        ` : ""}
        
        <!-- Rows -->
        ${bars.join("")}
        
        <!-- Bottom border -->
        <line x1="0" y1="${svgH - 1}" x2="${svgW}" y2="${svgH - 1}" stroke="#e8e8e0" stroke-width="1"/>
      </svg>
    `;

    const legendItems = Object.entries(STATUS).map(([key, val]) => `
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#6e6e68">
        <div style="width:14px;height:10px;border-radius:3px;background:${val.color}"></div>
        ${val.label}
      </div>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Gantt — ${projName}</title>
  <style>
    @page { margin: 10mm 8mm; size: A3 landscape; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #2d2d2a; margin: 0; padding: 0; background: #fff; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 0 12px; margin-bottom: 14px; border-bottom: 2.5px solid #9FB878; }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-icon { width: 28px; height: 28px; background: #9FB878; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff; font-weight: 700; }
    h1 { font-size: 18px; font-weight: 700; color: #2d2d2a; margin: 0 0 2px; }
    .subtitle { font-size: 10px; color: #aaaaaa; margin: 0; }
    .kpis { display: flex; gap: 10px; margin-bottom: 14px; }
    .kpi { flex: 1; background: #f6f6f2; border-radius: 8px; padding: 10px 14px; border: 1px solid #e8e8e0; }
    .kpi-v { font-size: 24px; font-weight: 700; }
    .kpi-l { font-size: 9px; color: #888780; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .gantt-wrap { overflow: hidden; border: 1px solid #e8e8e0; border-radius: 12px; margin-bottom: 14px; }
    .legend { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; margin-bottom: 8px; }
    .footer { margin-top: 14px; font-size: 9px; color: #aaaaaa; text-align: center; border-top: 1px solid #e8e8e0; padding-top: 10px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <div class="logo">
      <div class="logo-icon">🐝</div>
      <div>
        <h1>Diagramme de Gantt — ${projName}</h1>
        <p class="subtitle">Exporté le ${today} · LightProject · ${tasks.length} tâche(s) affichée(s)</p>
      </div>
    </div>
    <div style="text-align:right;font-size:11px;color:#6e6e68">
      <div style="font-weight:700;color:#5a6332;font-size:16px">${pct}%</div>
      <div>d'avancement</div>
    </div>
  </div>
  
  <div class="kpis">
    <div class="kpi"><div class="kpi-v">${total}</div><div class="kpi-l">Tâches totales</div></div>
    <div class="kpi"><div class="kpi-v" style="color:#5a6332">${done}</div><div class="kpi-l">Terminées</div></div>
    <div class="kpi"><div class="kpi-v" style="color:#5a8ac4">${progress}</div><div class="kpi-l">En cours</div></div>
    <div class="kpi"><div class="kpi-v" style="color:#b23a3a">${late}</div><div class="kpi-l">En retard</div></div>
    <div class="kpi"><div class="kpi-v" style="color:#9b8dc2">${todo}</div><div class="kpi-l">À faire</div></div>
  </div>

  <div class="legend">${legendItems}
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#6e6e68">
      <div style="width:14px;height:10px;border-radius:3px;background:#d4874a"></div>
      Aujourd'hui
    </div>
  </div>

  <div class="gantt-wrap">
    ${svgContent}
  </div>
  
  <div class="footer">LightProject · Rapport Gantt généré automatiquement · ${today}</div>
  
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("Autorise les popups pour exporter en PDF."); setExporting(false); return; }
    w.document.write(html);
    w.document.close();
    setExporting(false);
  }

  // ── Sidebar nav ────────────────────────────────────────────────────────────
  const navItems = [
    { label: "Dashboard",   path: "/dashboard" },
    { label: "Mes projets", path: "/projets" },
    { label: "Mes tâches",  path: "/taches" },
    { label: "Rapports IA", path: "/rapports" },
    { label: "Analyse IA",  path: "/ai" },
    { label: "Gantt",       path: "/gantt", active: true },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  const tasks  = filteredTasks();
  const px     = DAY_PX[zoom] || 16;
  const hasDates = tasks.filter(t => t.startDate || t.dueDate);
  const { min, max } = hasDates.length ? getRange(hasDates) : getRange([]);
  const totalDays  = diffDays(min, max) + 1;
  const totalWidth = totalDays * px;
  const todayOff   = diffDays(min, new Date()) * px;
  const months     = getMonthLabels(min, max, px);
  const dayLabels  = zoom === "week" ? getDayLabels(min, max, px) : [];

  const mkCard = (extra = {}) => ({
    background: C.card, borderRadius: "16px", padding: "16px",
    border: `1px solid ${C.border}`, boxShadow: C.shadow, ...extra,
  });

  return (
    <div style={{
      display: "flex", height: "100vh", background: C.bg,
      fontFamily: "'Segoe UI', Arial, sans-serif", overflow: "hidden",
    }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        flexShrink: 0, width: "220px", height: "100%",
        background: "#fff", borderRight: `1px solid ${C.border}`,
        padding: "24px 0", display: "flex", flexDirection: "column",
        justifyContent: "space-between", overflowY: "auto",
        boxShadow: "2px 0 8px rgba(0,0,0,0.03)",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 20px 28px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>🐝</div>
            <span style={{ fontSize: "16px", fontWeight: "700", color: C.text }}>lightproject</span>
          </div>
          <nav style={{ padding: "0 12px" }}>
            {navItems.map(item => (
              <div key={item.path} onClick={() => navigate(item.path)} style={{
                padding: "10px 14px", borderRadius: "12px", fontSize: "13px",
                cursor: "pointer", marginBottom: "3px",
                color:      item.active ? C.greenDark  : C.textMuted,
                background: item.active ? C.greenLight : "transparent",
                fontWeight: item.active ? "600"        : "400",
                borderLeft: item.active ? `3px solid ${C.green}` : "3px solid transparent",
                transition: "all 0.15s",
              }}>
                {item.label}
              </div>
            ))}
          </nav>
          <div style={{ height: "1px", background: C.border, margin: "16px" }} />
          <div style={{ padding: "0 12px" }}>
            <p style={{ fontSize: "10px", color: C.textLight, textTransform: "uppercase", letterSpacing: "1px", padding: "0 14px", margin: "0 0 6px" }}>Compte</p>
            <div style={{ padding: "10px 14px", borderRadius: "12px", fontSize: "13px", color: C.textMuted, cursor: "pointer" }}
              onClick={() => navigate("/profil")}>Mon profil</div>
            <div style={{ padding: "10px 14px", borderRadius: "12px", fontSize: "13px", color: C.pink, cursor: "pointer", fontWeight: "500" }}
              onClick={() => { localStorage.removeItem("jwt"); localStorage.removeItem("user"); navigate("/"); }}>
              Déconnexion
            </div>
          </div>
        </div>
        <div style={{ margin: "0 16px" }}>
          <div style={{ background: C.greenLight, borderRadius: "14px", padding: "12px", display: "flex", alignItems: "center", gap: "10px", border: `1px solid ${C.greenMid}` }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: "700", color: "#fff", flexShrink: 0 }}>
              {user.name?.charAt(0)?.toUpperCase() || "A"}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "13px", fontWeight: "600", color: C.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || "Admin"}</p>
              <p style={{ fontSize: "11px", color: C.textMuted, margin: 0 }}>{user.isAdmin ? "Administrateur" : "Membre"}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", overflowX: "hidden", padding: "20px 24px" }}>

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: "700", color: C.text, margin: 0 }}>
              Diagramme de Gantt 📊
            </h1>
            <p style={{ fontSize: "12px", color: C.textMuted, margin: "3px 0 0" }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} · Vue planning
            </p>
          </div>
          <button
            onClick={exportPDF}
            disabled={!allTasks.length || exporting}
            style={{
              background: allTasks.length ? C.green : C.border,
              color: "#fff", border: "none", padding: "9px 20px",
              borderRadius: "999px", fontSize: "13px", fontWeight: "600",
              cursor: allTasks.length ? "pointer" : "not-allowed",
              opacity: exporting ? 0.7 : 1,
              transition: "all 0.2s",
              display: "flex", alignItems: "center", gap: "6px",
            }}>
            {exporting ? "⏳ Génération…" : "⬇ Exporter Gantt PDF"}
          </button>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "14px" }}>
          {[
            { label: "Total",    val: total,    color: C.text,     bg: C.card },
            { label: `Avancement`, val: `${pct}%`, color: C.greenDark, bg: C.greenLight },
            { label: "Terminées",  val: done,    color: C.greenDark, bg: C.greenLight },
            { label: "En cours",   val: progress, color: C.blue,   bg: C.blueLight },
            { label: "En retard",  val: late,    color: C.red,     bg: C.redLight },
          ].map((k, i) => (
            <div key={i} style={{ ...mkCard({ padding: "14px", background: k.bg }) }}>
              <p style={{ fontSize: "10px", color: k.color, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 6px" }}>{k.label}</p>
              <p style={{ fontSize: "24px", fontWeight: "700", color: k.color, margin: 0 }}>{k.val}</p>
            </div>
          ))}
        </div>

        {/* Progress bar globale */}
        {total > 0 && (
          <div style={{ ...mkCard({ padding: "12px 16px", marginBottom: "12px" }) }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: C.text }}>Progression globale du projet</span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: C.greenDark }}>{pct}%</span>
            </div>
            <div style={{ height: "8px", background: C.border, borderRadius: "999px", overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${Math.round((done / total) * 100)}%`, height: "8px", background: C.green, transition: "width 0.6s" }} />
              <div style={{ width: `${Math.round((progress / total) * 100)}%`, height: "8px", background: C.blue, transition: "width 0.6s" }} />
              <div style={{ width: `${Math.round((late / total) * 100)}%`, height: "8px", background: C.red, transition: "width 0.6s" }} />
            </div>
            <div style={{ display: "flex", gap: "14px", marginTop: "6px" }}>
              {[
                { label: "Terminées", val: done,     col: C.green },
                { label: "En cours",  val: progress, col: C.blue  },
                { label: "En retard", val: late,     col: C.red   },
                { label: "À faire",   val: todo,     col: C.purple },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: item.col, flexShrink: 0 }} />
                  <span style={{ fontSize: "10px", color: C.textMuted }}>{item.label} ({item.val})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOOLBAR */}
        <div style={{ ...mkCard({ padding: "12px 16px", marginBottom: "12px" }) }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>

            {/* Sélecteur projet */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", minWidth: "200px" }}>
              <span style={{ fontSize: "11px", color: C.textMuted, whiteSpace: "nowrap", fontWeight: "500" }}>Projet :</span>
              <select
                value={selectedId || ""}
                onChange={e => setSelectedId(Number(e.target.value))}
                disabled={loadingProj}
                style={{
                  flex: 1, fontSize: "13px", padding: "7px 12px", borderRadius: "10px",
                  border: `1px solid ${C.border}`, background: "#fff", color: C.text,
                  cursor: "pointer", fontWeight: "500", outline: "none",
                }}>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name || `Projet #${p.id}`}</option>
                ))}
              </select>
            </div>

            <div style={{ width: "1px", height: "28px", background: C.border }} />

            {/* Zoom */}
            <div style={{ display: "flex", gap: "4px" }}>
              {[["week", "Semaine"], ["month", "Mois"], ["quarter", "Trimestre"]].map(([z, label]) => (
                <button key={z} onClick={() => setZoom(z)} style={{
                  padding: "6px 12px", borderRadius: "8px", fontSize: "11px", cursor: "pointer",
                  border: `1px solid ${zoom === z ? C.greenMid : C.border}`,
                  background: zoom === z ? C.greenLight : "transparent",
                  color: zoom === z ? C.greenDark : C.textMuted,
                  fontWeight: zoom === z ? "600" : "400", transition: "all 0.15s",
                }}>{label}</button>
              ))}
            </div>

            <div style={{ width: "1px", height: "28px", background: C.border }} />

            {/* Filtres statut */}
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {[
                ["all", "Toutes"],
                ["done", "Terminées"],
                ["progress", "En cours"],
                ["late", "En retard"],
                ["todo", "À faire"],
              ].map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "4px 10px", borderRadius: "8px", fontSize: "11px", cursor: "pointer",
                  border: `1px solid ${filter === f ? C.greenMid : C.border}`,
                  background: filter === f ? C.greenLight : "transparent",
                  color: filter === f ? C.greenDark : C.textMuted,
                  fontWeight: filter === f ? "600" : "400", transition: "all 0.15s",
                }}>{label}</button>
              ))}
            </div>

            {/* Recherche */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Rechercher…"
              style={{
                fontSize: "12px", padding: "7px 14px", borderRadius: "10px",
                border: `1px solid ${C.border}`, background: "#fff", color: C.text,
                outline: "none", minWidth: "160px", flex: 1,
              }}
            />
          </div>
        </div>

        {/* GANTT CHART */}
        <div style={{ ...mkCard({ padding: 0, overflow: "hidden" }) }}>
          {loading && (
            <div style={{ padding: "60px", textAlign: "center" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", margin: "0 auto 12px" }}>🐝</div>
              <p style={{ color: C.textMuted, fontSize: "13px", margin: 0 }}>Chargement du diagramme…</p>
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: "60px", textAlign: "center" }}>
              <p style={{ fontSize: "30px", margin: "0 0 10px" }}>⚠️</p>
              <p style={{ color: C.red, fontSize: "13px", margin: 0 }}>{error}</p>
            </div>
          )}

          {!loading && !error && tasks.length === 0 && (
            <div style={{ padding: "60px", textAlign: "center" }}>
              <p style={{ fontSize: "36px", margin: "0 0 12px" }}>📭</p>
              <p style={{ fontSize: "14px", color: C.textMuted, margin: "0 0 6px", fontWeight: "600" }}>Aucune tâche trouvée</p>
              <p style={{ fontSize: "12px", color: C.textLight, margin: 0 }}>
                {filter !== "all" ? "Changez le filtre de statut." : "Les tâches sans date de début ni de fin ne s'affichent pas dans le Gantt."}
              </p>
            </div>
          )}

          {!loading && !error && tasks.length > 0 && (
            <div style={{ display: "flex", height: "auto", maxHeight: "calc(100vh - 380px)", minHeight: "300px" }}>

              {/* Colonne labels fixe */}
              <div style={{
                flexShrink: 0, width: `${LABEL_W}px`,
                borderRight: `2px solid ${C.greenMid}`,
                overflowY: "hidden",
              }}>
                {/* Header label */}
                <div style={{
                  height: `${HEAD_H}px`,
                  background: C.greenLight,
                  borderBottom: `1px solid ${C.greenMid}`,
                  display: "flex", alignItems: "center",
                  padding: "0 16px",
                }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: C.greenDark, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                    Tâche / Assigné
                  </span>
                </div>

                {/* Labels des tâches */}
                <div style={{ overflowY: "auto", maxHeight: `calc(100% - ${HEAD_H}px)` }}>
                  {tasks.map((t, i) => {
                    const st = taskStatus(t);
                    const info = STATUS[st];
                    const pct_t = t.done ? 100 : (t.percentageDone || 0);
                    return (
                      <div key={t.id || i} style={{
                        height: `${ROW_H}px`,
                        display: "flex", alignItems: "center",
                        padding: "0 12px 0 14px",
                        borderBottom: `1px solid ${C.border}`,
                        background: i % 2 === 0 ? "#fff" : "#fafaf8",
                        gap: "8px",
                        transition: "background 0.1s",
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = C.greenLight}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafaf8"}
                      >
                        {/* Status dot */}
                        <div style={{
                          width: "8px", height: "8px", borderRadius: "50%",
                          background: info.color, flexShrink: 0,
                          boxShadow: `0 0 0 2px ${info.border}`,
                        }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: "12px", fontWeight: "600", color: C.text,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }} title={t.subject}>
                            {t.subject || "(Sans titre)"}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                            {t.assignee && (
                              <span style={{ fontSize: "10px", color: C.textLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
                                👤 {t.assignee}
                              </span>
                            )}
                            {pct_t > 0 && pct_t < 100 && (
                              <span style={{ fontSize: "9px", color: C.blue, fontWeight: "600" }}>{pct_t}%</span>
                            )}
                          </div>
                        </div>

                        {/* Badge statut */}
                        <span style={{
                          fontSize: "9px", padding: "2px 7px", borderRadius: "999px",
                          fontWeight: "700", flexShrink: 0,
                          background: info.bg, color: info.dark,
                          border: `1px solid ${info.border}`,
                        }}>
                          {info.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Zone Gantt scrollable */}
              <div
                ref={scrollRef}
                style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}
              >
                <div style={{ width: `${totalWidth}px`, minWidth: "100%" }}>

                  {/* Header mois */}
                  <div style={{
                    height: `${HEAD_H}px`,
                    background: C.greenLight,
                    borderBottom: `1px solid ${C.greenMid}`,
                    position: "sticky", top: 0, zIndex: 10,
                    display: "flex", alignItems: "flex-end",
                    position: "relative", overflow: "hidden",
                  }}>
                    {/* Lignes mois */}
                    {months.map((m, i) => (
                      <div key={i} style={{
                        position: "absolute",
                        left: `${m.left}px`,
                        top: 0, bottom: 0,
                        borderLeft: i > 0 ? `1px dashed ${C.greenMid}` : "none",
                        paddingLeft: "8px",
                        display: "flex", alignItems: "center",
                      }}>
                        <span style={{
                          fontSize: "11px", fontWeight: "700",
                          color: C.greenDark, textTransform: "uppercase",
                          letterSpacing: "0.6px", whiteSpace: "nowrap",
                        }}>
                          {m.label}
                        </span>
                      </div>
                    ))}

                    {/* Ligne aujourd'hui dans le header */}
                    {todayOff >= 0 && todayOff <= totalWidth && (
                      <div style={{
                        position: "absolute", left: `${todayOff}px`,
                        top: 0, bottom: 0, width: "2px",
                        background: C.orange, zIndex: 5,
                      }}>
                        <div style={{
                          position: "absolute", top: "4px", left: "3px",
                          background: C.orange, color: "#fff",
                          fontSize: "8px", fontWeight: "700",
                          padding: "1px 5px", borderRadius: "4px",
                          whiteSpace: "nowrap",
                        }}>
                          Aujourd'hui
                        </div>
                      </div>
                    )}

                    {/* Labels jours (zoom semaine) */}
                    {zoom === "week" && dayLabels.map((dl, i) => (
                      <div key={i} style={{
                        position: "absolute", left: `${dl.left}px`,
                        bottom: "4px", width: `${px}px`,
                        display: "flex", justifyContent: "center",
                      }}>
                        <span style={{
                          fontSize: "9px", fontWeight: dl.isToday ? "700" : "400",
                          color: dl.isToday ? C.orange : dl.isWeekend ? C.textLight : C.textMuted,
                        }}>
                          {dl.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Rows Gantt */}
                  {tasks.map((t, i) => {
                    const st = taskStatus(t);
                    const info = STATUS[st];
                    const s = new Date(t.startDate || t.dueDate);
                    const e = new Date(t.dueDate || t.startDate);
                    const left = diffDays(min, s) * px;
                    const dur = Math.max(1, diffDays(s, e) + 1);
                    const width = dur * px;
                    const pct_t = t.done ? 100 : (t.percentageDone || 0);
                    const isLate = st === "late";

                    return (
                      <div key={t.id || i} style={{
                        height: `${ROW_H}px`,
                        position: "relative",
                        borderBottom: `1px solid ${C.border}`,
                        background: i % 2 === 0 ? "#fff" : "#fafaf8",
                      }}>

                        {/* Bandes weekend */}
                        {dayLabels.filter(d => d.isWeekend).map((dl, wi) => (
                          <div key={wi} style={{
                            position: "absolute", left: `${dl.left}px`,
                            top: 0, bottom: 0, width: `${px}px`,
                            background: "#f0f0e8", opacity: 0.5, pointerEvents: "none",
                          }} />
                        ))}

                        {/* Ligne aujourd'hui */}
                        {todayOff >= 0 && todayOff <= totalWidth && (
                          <div style={{
                            position: "absolute", left: `${todayOff}px`,
                            top: 0, bottom: 0, width: "2px",
                            background: C.orange, opacity: 0.6, zIndex: 2, pointerEvents: "none",
                          }} />
                        )}

                        {/* Barre Gantt */}
                        {(t.startDate || t.dueDate) && (
                          <div
                            style={{
                              position: "absolute",
                              left: `${left}px`,
                              width: `${Math.max(width, px)}px`,
                              top: "50%", transform: "translateY(-50%)",
                              height: "22px",
                              borderRadius: "6px",
                              background: info.color,
                              cursor: "pointer",
                              zIndex: 3,
                              display: "flex", alignItems: "center",
                              overflow: "hidden",
                              border: isLate ? `2px solid ${info.dark}` : "none",
                              boxShadow: `0 2px 6px ${info.color}40`,
                              transition: "transform 0.15s, box-shadow 0.15s",
                            }}
                            onMouseEnter={ev => {
                              ev.currentTarget.style.transform = "translateY(-50%) scaleY(1.08)";
                              ev.currentTarget.style.boxShadow = `0 4px 12px ${info.color}60`;
                              setTooltip(t);
                              setTooltipPos({ x: ev.clientX, y: ev.clientY });
                            }}
                            onMouseMove={ev => setTooltipPos({ x: ev.clientX, y: ev.clientY })}
                            onMouseLeave={ev => {
                              ev.currentTarget.style.transform = "translateY(-50%) scaleY(1)";
                              ev.currentTarget.style.boxShadow = `0 2px 6px ${info.color}40`;
                              setTooltip(null);
                            }}
                          >
                            {/* Barre de progression interne */}
                            {pct_t > 0 && (
                              <div style={{
                                position: "absolute", left: 0, top: 0, bottom: 0,
                                width: `${pct_t}%`,
                                background: "rgba(255,255,255,0.25)",
                                borderRight: "1px solid rgba(255,255,255,0.4)",
                              }} />
                            )}

                            {/* Texte dans la barre */}
                            {width > 50 && (
                              <span style={{
                                fontSize: "10px", fontWeight: "700",
                                color: st === "todo" ? info.dark : "#fff",
                                paddingLeft: "8px",
                                whiteSpace: "nowrap", overflow: "hidden",
                                textOverflow: "ellipsis",
                                position: "relative", zIndex: 1,
                                textShadow: st !== "todo" ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
                              }}>
                                {t.subject}
                                {pct_t > 0 && pct_t < 100 && ` · ${pct_t}%`}
                              </span>
                            )}
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

        {/* LÉGENDE */}
        {!loading && tasks.length > 0 && (
          <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {Object.entries(STATUS).map(([key, val]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: C.textMuted }}>
                <div style={{ width: "14px", height: "8px", borderRadius: "3px", background: val.color }} />
                {val.label}
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: C.textMuted }}>
              <div style={{ width: "2px", height: "14px", background: C.orange }} />
              Aujourd'hui
            </div>
            <span style={{ marginLeft: "auto", fontSize: "11px", color: C.textLight }}>
              {tasks.length} tâche(s) affichée(s) · Survolez une barre pour les détails
            </span>
          </div>
        )}
      </main>

      {/* TOOLTIP */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: Math.min(tooltipPos.x + 16, window.innerWidth - 260),
          top: Math.max(tooltipPos.y - 80, 10),
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: "14px",
          padding: "14px 16px",
          fontSize: "12px",
          zIndex: 9999,
          pointerEvents: "none",
          width: "240px",
          boxShadow: C.shadowMd,
        }}>
          {/* Header tooltip */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: STATUS[taskStatus(tooltip)].color, flexShrink: 0 }} />
            <p style={{ fontWeight: "700", fontSize: "13px", color: C.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {tooltip.subject}
            </p>
          </div>

          {/* Infos */}
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {[
              ["👤 Assigné", tooltip.assignee || "Non assigné"],
              ["📅 Début",   formatDate(tooltip.startDate)],
              ["🏁 Fin",     formatDate(tooltip.dueDate)],
              ["⏱ Estimation", tooltip.hours ? `${tooltip.hours}h` : "—"],
              ["📊 Avancement", `${tooltip.percentageDone || (tooltip.done ? 100 : 0)}%`],
              ...(tooltip.late && !tooltip.done
                ? [["⚠️ Retard", `${Math.ceil((new Date() - new Date(tooltip.dueDate)) / 86400000)} jour(s)`]]
                : []),
            ].map(([k, v], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ color: C.textMuted, fontSize: "11px" }}>{k}</span>
                <span style={{ fontWeight: "600", color: k.includes("Retard") ? C.red : C.text, fontSize: "11px" }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Badge statut */}
          <div style={{ marginTop: "10px", borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>
            {(() => {
              const st = taskStatus(tooltip);
              const info = STATUS[st];
              return (
                <span style={{
                  background: info.bg, color: info.dark,
                  fontSize: "10px", padding: "3px 10px", borderRadius: "999px",
                  fontWeight: "700", border: `1px solid ${info.border}`,
                }}>
                  {info.icon} {info.label}
                </span>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}