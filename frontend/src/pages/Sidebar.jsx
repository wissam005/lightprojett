import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getNotifications,
  getNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "../services/api";

// ── Palette ───────────────────────────────────────────────────
const C = {
  green: "#9FB878", greenLight: "#f5f6ec", greenMid: "#dfe0c0", greenDark: "#5a6332",
  pink: "#d4538a", pinkLight: "#fce7f3",
  blue: "#5a8ac4", blueLight: "#eaf2fb",
  orange: "#d4874a",
  red: "#b23a3a", redLight: "#fdecea",
  text: "#2d2d2a", textMuted: "#6e6e68", textLight: "#aaaaaa",
  border: "#e8e8e0", shadow: "0 2px 8px rgba(0,0,0,0.05)",
};

// ── Config types de notifications ─────────────────────────────
const NOTIF_CONFIG = {
  assigned:     { icon: "👤", color: "#5a8ac4", label: "Assignée" },
  due_soon:     { icon: "🔔", color: "#d4874a", label: "Échéance proche" },
  overdue:      { icon: "⚠️", color: "#b23a3a", label: "En retard" },
  blocked:      { icon: "🔒", color: "#b23a3a", label: "Bloquée" },
  unblocked:    { icon: "✅", color: "#9FB878", label: "Débloquée" },
  danger:       { icon: "🚨", color: "#b23a3a", label: "Danger" },
  budget_alert: { icon: "💸", color: "#d4874a", label: "Budget" },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  const h   = Math.floor(diff / 3600000);
  const d   = Math.floor(diff / 86400000);
  if (min < 1)  return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  if (h < 24)   return `Il y a ${h}h`;
  if (d < 7)    return `Il y a ${d}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// ── Composant cloche notifications ────────────────────────────
function NotificationBell() {
  const navigate = useNavigate();
  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState([]);
  const [count,   setCount]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("all");
  const ref = useRef(null);

  // Ferme le panneau si clic en dehors
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // Polling du compteur toutes les 30s
  const loadCount = useCallback(async () => {
    try {
      const r = await getNotificationCount();
      setCount(r.data?.count ?? r ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, 30000);
    return () => clearInterval(id);
  }, [loadCount]);

  // Charge les notifs à l'ouverture du panneau
  const loadNotifs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getNotifications({ unreadOnly: filter === "unread" });
      setNotifs(r.data?.notifications ?? r.data ?? []);
    } catch {}
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { if (open) loadNotifs(); }, [open, loadNotifs]);

  const handleMarkRead = async id => {
    await markNotificationRead(id);
    setNotifs(p => p.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setCount(c => Math.max(0, c - 1));
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setNotifs(p => p.map(n => ({ ...n, is_read: 1 })));
    setCount(0);
  };

  const handleDelete = async (id, wasUnread) => {
    await deleteNotification(id);
    setNotifs(p => p.filter(n => n.id !== id));
    if (wasUnread) setCount(c => Math.max(0, c - 1));
  };

  const displayed = filter === "unread" ? notifs.filter(n => n.is_read === 0) : notifs;

  return (
    <div ref={ref} style={{ position: "relative", padding: "0 12px", marginBottom: "3px" }}>

      {/* Bouton cloche */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 14px", borderRadius: "12px", cursor: "pointer",
          background: open ? C.greenLight : "transparent",
          color: open ? C.greenDark : C.textMuted,
          fontWeight: open ? "600" : "400",
          borderLeft: open ? `3px solid ${C.green}` : "3px solid transparent",
          fontSize: "13px", transition: "all 0.15s",
          position: "relative",
        }}
      >
        <span style={{ fontSize: "14px" }}>🔔</span>
        <span>Notifications</span>
        {count > 0 && (
          <span style={{
            marginLeft: "auto",
            background: C.red, color: "#fff",
            fontSize: "9px", fontWeight: "700",
            borderRadius: "10px", minWidth: "16px", height: "16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </div>

      {/* Panneau déroulant */}
      {open && (
        <div style={{
          position: "fixed",
          top: "80px",
          left: "230px",
          width: "360px",
          maxHeight: "500px",
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: "18px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 9999,
          fontFamily: "'Segoe UI', Arial, sans-serif",
        }}>

          {/* Header panneau */}
          <div style={{
            padding: "14px 16px 10px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>
              Notifications
              {count > 0 && (
                <span style={{
                  background: C.red, color: "#fff", fontSize: 10,
                  borderRadius: "10px", padding: "1px 6px", marginLeft: 6,
                }}>
                  {count}
                </span>
              )}
            </span>
            {count > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  background: "transparent", border: `1px solid ${C.blue}44`,
                  borderRadius: "7px", color: C.blue, fontSize: 10,
                  fontWeight: 600, padding: "2px 8px", cursor: "pointer",
                }}
              >
                Tout lire
              </button>
            )}
          </div>

          {/* Filtres */}
          <div style={{
            display: "flex", gap: 4, padding: "8px 12px",
            borderBottom: `1px solid ${C.border}`, flexShrink: 0,
          }}>
            {["all", "unread"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? C.greenLight : "transparent",
                  border: `1px solid ${filter === f ? C.greenMid : "transparent"}`,
                  borderRadius: "7px", color: filter === f ? C.greenDark : C.textMuted,
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", cursor: "pointer",
                }}
              >
                {f === "all" ? "Toutes" : "Non lues"}
              </button>
            ))}
          </div>

          {/* Liste */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: C.textLight, fontSize: 13 }}>
                Chargement…
              </div>
            ) : displayed.length === 0 ? (
              <div style={{ padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                <div style={{ color: C.textMuted, fontSize: 13 }}>
                  {filter === "unread" ? "Aucune notification non lue." : "Aucune notification."}
                </div>
              </div>
            ) : displayed.map(n => {
              const cfg = NOTIF_CONFIG[n.type] || { icon: "📌", color: C.blue, label: "Info" };
              return (
                <div
                  key={n.id}
                  onClick={() => n.is_read === 0 && handleMarkRead(n.id)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "11px 14px", borderBottom: `1px solid ${C.border}`,
                    background: n.is_read === 0 ? C.greenLight : "transparent",
                    cursor: n.is_read === 0 ? "pointer" : "default",
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: "8px",
                    background: cfg.color + "18", border: `1px solid ${cfg.color}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0,
                  }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: cfg.color,
                      marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>
                      {cfg.label}
                      {n.is_read === 0 && (
                        <span style={{
                          display: "inline-block", width: 5, height: 5,
                          borderRadius: "50%", background: C.red,
                          marginLeft: 5, verticalAlign: "middle",
                        }} />
                      )}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: n.is_read === 0 ? C.text : C.textMuted,
                      lineHeight: 1.5, wordBreak: "break-word",
                    }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: 10, color: C.textLight, marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(n.id, n.is_read === 0); }}
                    style={{
                      background: "none", border: "none", color: C.textLight,
                      cursor: "pointer", fontSize: 13, padding: "1px 3px",
                      borderRadius: 4, flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer → paramètres */}
          <div style={{
            padding: "10px 16px", borderTop: `1px solid ${C.border}`,
            textAlign: "center", flexShrink: 0,
          }}>
            <button
              onClick={() => { setOpen(false); navigate("/notifications"); }}
              style={{
                background: "none", border: "none",
                color: C.textMuted, fontSize: 11, cursor: "pointer",
              }}
              onMouseEnter={e => e.currentTarget.style.color = C.greenDark}
              onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
            >
              ⚙️ Paramètres de notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  SIDEBAR — composant principal
// ══════════════════════════════════════════════════════════════

/**
 * Props :
 *   activePath  {string}  — ex. "/dashboard"
 *   onLogout    {fn}      — callback déconnexion
 */
export default function Sidebar({ activePath = "", onLogout }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const navItems = [
    { label: "Dashboard",   path: "/dashboard" },
    { label: "Mes projets", path: "/projets"   },
    { label: "Mes tâches",  path: "/taches"    },
    { label: "Rapports IA", path: "/rapports"  },
    { label: "Gantt",       path: "/gantt"     },
  ];

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem("jwt");
      localStorage.removeItem("user");
      navigate("/");
    }
  };

  return (
    <aside style={{
      background: "#fff",
      borderRight: `1px solid ${C.border}`,
      padding: "24px 0",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      height: "100vh",
      overflowY: "auto",
      boxShadow: "2px 0 8px rgba(0,0,0,0.03)",
    }}>
      <div>
        {/* ── Logo ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 20px 28px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "10px",
            background: C.green, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "16px",
          }}>🐝</div>
          <span style={{ fontSize: "16px", fontWeight: "700", color: C.text }}>lightproject</span>
        </div>

        {/* ── Navigation principale ── */}
        <nav style={{ padding: "0 12px" }}>
          {navItems.map(item => {
            const isActive = activePath === item.path;
            return (
              <div
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  fontSize: "13px",
                  cursor: "pointer",
                  marginBottom: "3px",
                  color:      isActive ? C.greenDark  : C.textMuted,
                  background: isActive ? C.greenLight : "transparent",
                  fontWeight: isActive ? "600"        : "400",
                  borderLeft: isActive ? `3px solid ${C.green}` : "3px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {item.label}
              </div>
            );
          })}
        </nav>

        {/* ── Séparateur ── */}
        <div style={{ height: "1px", background: C.border, margin: "16px" }} />

        {/* ── Notifications intégrées ── */}
        <NotificationBell />

        {/* ── Séparateur ── */}
        <div style={{ height: "1px", background: C.border, margin: "16px" }} />

        {/* ── Compte ── */}
        <div style={{ padding: "0 12px" }}>
          <p style={{
            fontSize: "10px", color: C.textLight,
            textTransform: "uppercase", letterSpacing: "1px",
            padding: "0 14px", margin: "0 0 6px",
          }}>Compte</p>
          <div
            onClick={() => navigate("/profil")}
            style={{
              padding: "10px 14px", borderRadius: "12px",
              fontSize: "13px", color: C.textMuted, cursor: "pointer",
            }}
          >
            Mon profil
          </div>
          <div
            onClick={handleLogout}
            style={{
              padding: "10px 14px", borderRadius: "12px",
              fontSize: "13px", color: C.pink, cursor: "pointer", fontWeight: "500",
            }}
          >
            Déconnexion
          </div>
        </div>
      </div>

      {/* ── Avatar utilisateur ── */}
      <div style={{ margin: "0 16px" }}>
        <div style={{
          background: C.greenLight, borderRadius: "14px", padding: "12px",
          display: "flex", alignItems: "center", gap: "10px",
          border: `1px solid ${C.greenMid}`,
        }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: C.green, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "15px", fontWeight: "700",
            color: "#fff", flexShrink: 0,
          }}>
            {user.name?.charAt(0)?.toUpperCase() || "A"}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontSize: "13px", fontWeight: "600", color: C.text, margin: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {user.name || "Admin"}
            </p>
            <p style={{ fontSize: "11px", color: C.textMuted, margin: 0 }}>
              {user.isAdmin ? "Administrateur" : "Membre"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}