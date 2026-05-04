import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getProjets, getStats, getAllMembers, getTaches, logout } from "../services/api";
import Sidebar from "./Sidebar";
import {
  getNotifications, getNotificationCount, markNotificationRead,
  markAllNotificationsRead, deleteNotification,
} from "../services/api";

const isDone       = t => ["clos","done","termin","closed","finished","resolved","fermé"].some(k => (t._links?.status?.title||"").toLowerCase().includes(k));
const isInProgress = t => ["progress","cours","en cours","in progress","started"].some(k => (t._links?.status?.title||"").toLowerCase().includes(k));
const isTodo       = t => !isDone(t) && !isInProgress(t);

const NOTIF_CONFIG = {
  assigned:     { icon:"👤", color:"#5a8ac4", label:"Assignée" },
  due_soon:     { icon:"🔔", color:"#d4874a", label:"Échéance proche" },
  overdue:      { icon:"⚠️", color:"#b23a3a", label:"En retard" },
  blocked:      { icon:"🔒", color:"#b23a3a", label:"Bloquée" },
  unblocked:    { icon:"✅", color:"#9FB878", label:"Débloquée" },
  danger:       { icon:"🚨", color:"#b23a3a", label:"Danger" },
  budget_alert: { icon:"💸", color:"#d4874a", label:"Budget" },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  if (h < 24) return `Il y a ${h}h`;
  if (d < 7) return `Il y a ${d}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"});
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"});
}

export default function Dashboard() {
  const [projets, setProjets]     = useState([]);
  const [statsMap, setStatsMap]   = useState({});
  const [tachesMap, setTachesMap] = useState({});
  const [membres, setMembres]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [kanbanFilter, setKanbanFilter] = useState("all");
  const navigate = useNavigate();
  const user = useMemo(() => JSON.parse(localStorage.getItem("user")||"{}"), []);
  const now  = useMemo(() => new Date(), []);

  useEffect(() => {
    Promise.all([getProjets(), getAllMembers()])
      .then(async ([pRes, mRes]) => {
        const list = pRes.data||[];
        setProjets(list); setMembres(mRes.data||[]);
        const sMap={}, tMap={};
        await Promise.all(list.map(async p => {
          try {
            const [sr,tr] = await Promise.all([getStats(p.id),getTaches(p.id)]);
            sMap[p.id]=sr.data; tMap[p.id]=tr.data||[];
          } catch { sMap[p.id]=null; tMap[p.id]=[]; }
        }));
        setStatsMap(sMap); setTachesMap(tMap); setLoading(false);
      }).catch(()=>setLoading(false));
  }, []);

  const handleLogout = async () => {
    try { await logout(); } catch {}
    localStorage.removeItem("jwt"); localStorage.removeItem("user"); navigate("/");
  };

  const allTaches = useMemo(() => Object.values(tachesMap).flat(), [tachesMap]);

  const isOverdue  = useCallback(t => !!t.dueDate && new Date(t.dueDate)<now && !isDone(t), [now]);
  const isUpcoming = useCallback(t => {
    if (!t.dueDate||isDone(t)) return false;
    const diff=(new Date(t.dueDate)-now)/86400000;
    return diff>=0&&diff<=7;
  }, [now]);

  const totalTaches     = allTaches.length;
  const totalDone       = useMemo(()=>allTaches.filter(isDone).length,[allTaches]);
  const totalInProgress = useMemo(()=>allTaches.filter(isInProgress).length,[allTaches]);
  const totalTodo       = useMemo(()=>allTaches.filter(isTodo).length,[allTaches]);
  const totalLate       = useMemo(()=>allTaches.filter(isOverdue).length,[allTaches,isOverdue]);
  const totalProgress   = totalTaches>0?Math.round((totalDone/totalTaches)*100):0;

  const overdueTasks  = useMemo(()=>allTaches.filter(isOverdue).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,5),[allTaches,isOverdue]);
  const upcomingTasks = useMemo(()=>allTaches.filter(isUpcoming).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,4),[allTaches,isUpcoming]);
  const recentTasks   = useMemo(()=>[...allTaches].sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0)).slice(0,6),[allTaches]);

  const globalProgress = useMemo(()=>{
    if (!projets.length) return 0;
    const sum=projets.reduce((acc,p)=>acc+Number(p.progress??statsMap[p.id]?.kpis?.progressCount??0),0);
    return Math.round(sum/projets.length);
  },[projets,statsMap]);

  // ── PRODUCTIVITY SCORE — calcul fiable basé sur vraies données ──
  // completionScore  (0-50)  : % tâches terminées × 50
  // punctualityScore (0-30)  : % tâches dans les délais × 30
  // activityScore    (0-20)  : nb projets × 5 + bonus si tâches en cours
  const productivityScore = useMemo(() => {
    if (totalTaches===0) return 75;
    const completionScore  = Math.round((totalDone/totalTaches)*50);
    const punctualityScore = Math.round(((totalTaches-totalLate)/totalTaches)*30);
    const activityScore    = Math.min(20, projets.length*5+(totalInProgress>0?10:0));
    return Math.min(100, completionScore+punctualityScore+activityScore);
  }, [totalTaches,totalDone,totalLate,totalInProgress,projets.length]);

  const scoreLabel = productivityScore>=80?"Excellent":productivityScore>=60?"Bien":productivityScore>=40?"Moyen":"À améliorer";
  const scoreColor = productivityScore>=60?"#5a6332":productivityScore>=40?"#c27a2a":"#b23a3a";
  const scoreBg    = productivityScore>=80?"#f0f2e0":productivityScore>=60?"#f5f6ec":productivityScore>=40?"#fff3e0":"#fdecea";

  const statusDist = useMemo(()=>allTaches.reduce((acc,t)=>{
    const s=t._links?.status?.title||"Inconnu"; acc[s]=(acc[s]||0)+1; return acc;
  },{}), [allTaches]);

  const filteredKanban = useMemo(()=>{
    if (kanbanFilter==="todo")     return allTaches.filter(isTodo);
    if (kanbanFilter==="progress") return allTaches.filter(isInProgress);
    if (kanbanFilter==="done")     return allTaches.filter(isDone);
    return allTaches;
  },[allTaches,kanbanFilter]);

  const C = {
    green:"#9FB878", greenLight:"#f5f6ec", greenMid:"#dfe0c0", greenDark:"#5a6332",
    pink:"#d4538a", pinkLight:"#fce7f3", pinkMid:"#f4b8d4", pinkDark:"#7d1f52",
    orange:"#d4874a", orangeLight:"#fef3e8",
    blue:"#5a8ac4", blueLight:"#eaf2fb",
    purple:"#9b8dc2", purpleLight:"#f3f0fa",
    red:"#b23a3a", redLight:"#fdecea", redMid:"#f5c6c6",
    bg:"#f6f6f2", card:"#ffffff",
    text:"#2d2d2a", textMuted:"#6e6e68", textLight:"#aaaaaa",
    border:"#e8e8e0", shadow:"0 2px 8px rgba(0,0,0,0.05)", shadowHover:"0 6px 20px rgba(0,0,0,0.09)",
  };

  const ACCENT = [
    {c:"#9FB878",bg:"#f5f6ec",dark:"#5a6332"},
    {c:"#d4538a",bg:"#fce7f3",dark:"#7d1f52"},
    {c:"#5a8ac4",bg:"#eaf2fb",dark:"#2a4f82"},
    {c:"#d4874a",bg:"#fef3e8",dark:"#7a4520"},
    {c:"#9b8dc2",bg:"#f3f0fa",dark:"#4a3a7a"},
  ];

  const mkCard = (extra={}) => ({background:C.card,borderRadius:"16px",padding:"14px",border:`1px solid ${C.border}`,boxShadow:C.shadow,...extra});

  const StatusBadge = ({title}) => {
    const s=(title||"").toLowerCase();
    const done=["clos","done","termin","closed"].some(k=>s.includes(k));
    const prog=["progress","cours"].some(k=>s.includes(k));
    return <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"999px",fontWeight:"600",whiteSpace:"nowrap",flexShrink:0,background:done?C.greenLight:prog?C.blueLight:"#fafaf8",color:done?C.greenDark:prog?C.blue:C.textMuted,border:`1px solid ${done?C.greenMid:prog?"#c5daf5":C.border}`}}>{title||"—"}</span>;
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,fontFamily:"'Segoe UI',Arial,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:"44px",height:"44px",borderRadius:"14px",background:C.green,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",margin:"0 auto 14px"}}>🐝</div>
        <p style={{color:C.textMuted,fontSize:"14px",margin:0}}>Chargement…</p>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",height:"100vh",background:C.bg,fontFamily:"'Segoe UI',Arial,sans-serif",overflow:"hidden"}}>
    <Sidebar activePath="/dashboard" onLogout={handleLogout} />
      {/* ── MAIN ── */}
      <main style={{flex:1,minWidth:0,height:"100%",overflowY:"auto",overflowX:"hidden",padding:"20px 24px"}}>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px",gap:"12px",flexWrap:"wrap"}}>
          <div>
            <h1 style={{fontSize:"20px",fontWeight:"700",color:C.text,margin:0}}>
              {(()=>{const h=new Date().getHours();const n=user.name?.split(" ")[0]||"Admin";return h<12?`Bonjour, ${n} 👋`:h<18?`Bon après-midi, ${n} 👋`:`Bonsoir, ${n} 👋`;})()}
            </h1>
            <p style={{fontSize:"12px",color:C.textMuted,margin:"3px 0 0"}}>
              {new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})} · Tableau de bord
            </p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
            <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:"999px",padding:"6px 14px",fontSize:"12px",color:C.text,boxShadow:C.shadow}}><b>{projets.length}</b> Projets</div>
            <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:"999px",padding:"6px 14px",fontSize:"12px",color:C.text,boxShadow:C.shadow}}><b>{totalTaches}</b> Tâches</div>
            {user.isAdmin && (
              <button onClick={()=>navigate("/projets/nouveau")} style={{background:C.pink,color:"#fff",border:"none",padding:"8px 16px",borderRadius:"999px",fontSize:"12px",fontWeight:"600",cursor:"pointer"}}>
                + Nouveau projet
              </button>
            )}
            <div style={{width:"34px",height:"34px",borderRadius:"50%",background:C.green,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:"700",color:"#fff"}}>
              {user.name?.charAt(0)?.toUpperCase()||"A"}
            </div>
          </div>
        </div>

        {/* ── SECTION HAUTE : 2 KPI ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
          <div style={{...mkCard({padding:"18px"}),background:C.green}}>
            <p style={{fontSize:"10px",color:"rgba(255,255,255,0.8)",textTransform:"uppercase",letterSpacing:"0.6px",margin:"0 0 6px"}}>Projets actifs</p>
            <div style={{display:"flex",alignItems:"baseline",gap:"10px",marginBottom:"6px"}}>
              <p style={{fontSize:"32px",fontWeight:"700",color:"#fff",margin:0}}>{projets.length}</p>
              <span style={{fontSize:"12px",color:"rgba(255,255,255,0.75)"}}>{projets.length>0?`${globalProgress}% progression moy.`:""}</span>
            </div>
            <div style={{height:"4px",background:"rgba(255,255,255,0.3)",borderRadius:"999px",overflow:"hidden"}}>
              <div style={{width:`${globalProgress}%`,height:"4px",background:"rgba(255,255,255,0.9)",borderRadius:"999px"}}/>
            </div>
          </div>
          <div style={{...mkCard({padding:"18px"}),background:totalLate>0?C.redLight:C.card,border:`1px solid ${totalLate>0?C.redMid:C.border}`}}>
            <p style={{fontSize:"10px",color:totalLate>0?C.red:C.textMuted,textTransform:"uppercase",letterSpacing:"0.6px",margin:"0 0 6px",opacity:0.85}}>Tâches en retard</p>
            <div style={{display:"flex",alignItems:"baseline",gap:"10px",marginBottom:"6px"}}>
              <p style={{fontSize:"32px",fontWeight:"700",color:totalLate>0?C.red:C.text,margin:0}}>{totalLate}</p>
              <span style={{fontSize:"12px",color:totalLate>0?C.red:C.textMuted,opacity:0.75}}>{totalLate===0?"Tout est à jour 🎉":`sur ${totalTaches} tâches`}</span>
            </div>
            <div style={{height:"4px",background:totalLate>0?"rgba(178,58,58,0.15)":C.border,borderRadius:"999px",overflow:"hidden"}}>
              <div style={{width:`${totalTaches>0?Math.min(Math.round((totalLate/totalTaches)*100),100):0}%`,height:"4px",background:totalLate>0?C.red:C.green,borderRadius:"999px"}}/>
            </div>
          </div>
        </div>

        {/* ── SECTION MILIEU : 3 colonnes ── */}
        <div style={{display:"grid",gridTemplateColumns:"1.05fr 1fr 0.95fr",gap:"12px",marginBottom:"12px",alignItems:"start"}}>

          {/* COL 1 — Productivity Score */}
          <div style={{...mkCard(),background:`linear-gradient(135deg,${scoreBg},#fff)`,border:`1px solid ${C.greenMid}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div>
                <p style={{fontSize:"14px",fontWeight:"700",color:C.text,margin:"0 0 2px"}}>Productivity Score</p>
                <p style={{fontSize:"11px",color:C.textMuted,margin:0}}>Basé sur tes projets et tâches</p>
              </div>
              <span style={{fontSize:"10px",fontWeight:"700",background:"#fff",color:scoreColor,padding:"4px 10px",borderRadius:"999px",border:`1px solid ${scoreColor}40`}}>{scoreLabel}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
              {/* Cercle SVG */}
              <div style={{flexShrink:0}}>
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" stroke={C.border} strokeWidth="10"/>
                  <circle cx="40" cy="40" r="32" fill="none" stroke={scoreColor} strokeWidth="10"
                    strokeDasharray={`${(productivityScore/100)*201} 201`}
                    strokeDashoffset="50" strokeLinecap="round"
                    style={{transition:"stroke-dasharray 0.8s ease"}}/>
                  <text x="40" y="36" textAnchor="middle" fontSize="18" fontWeight="700" fill={scoreColor}>{productivityScore}</text>
                  <text x="40" y="50" textAnchor="middle" fontSize="9" fill={C.textMuted}>/100</text>
                </svg>
              </div>
              {/* Barres de détail */}
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:"8px"}}>
                {[
                  {label:"Complétion",  val:totalTaches>0?Math.round((totalDone/totalTaches)*100):0,    col:C.green},
                  {label:"Ponctualité", val:totalTaches>0?Math.round(((totalTaches-totalLate)/totalTaches)*100):100, col:C.blue},
                  {label:"Activité",    val:Math.min(100,projets.length*20+(totalInProgress>0?40:0)),   col:C.pink},
                ].map((item,i)=>(
                  <div key={i}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"2px"}}>
                      <span style={{fontSize:"10px",color:C.textMuted}}>{item.label}</span>
                      <span style={{fontSize:"10px",fontWeight:"600",color:item.col}}>{Math.min(item.val,100)}%</span>
                    </div>
                    <div style={{height:"4px",background:C.border,borderRadius:"999px",overflow:"hidden"}}>
                      <div style={{width:`${Math.min(item.val,100)}%`,height:"4px",background:item.col,borderRadius:"999px",transition:"width 0.6s"}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* COL 2 — Focus du jour */}
          <div style={mkCard()}>
            <p style={{fontSize:"14px",fontWeight:"700",color:C.text,margin:"0 0 10px"}}>Focus du jour</p>
            {overdueTasks.length===0&&upcomingTasks.length===0 ? (
              <div style={{background:C.greenLight,borderRadius:"10px",padding:"14px",textAlign:"center",border:`1px solid ${C.greenMid}`}}>
                <p style={{fontSize:"20px",margin:"0 0 4px"}}>🎉</p>
                <p style={{fontSize:"13px",fontWeight:"700",color:C.greenDark,margin:"0 0 2px"}}>Tout est à jour !</p>
                <p style={{fontSize:"11px",color:C.textMuted,margin:0}}>Aucune tâche urgente.</p>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                {overdueTasks.map((t,i)=>{
                  const days=Math.ceil((now-new Date(t.dueDate))/86400000);
                  return (
                    <div key={t.id||i} style={{display:"flex",alignItems:"flex-start",gap:"7px",padding:"8px 10px",background:C.redLight,borderRadius:"9px",border:`1px solid ${C.redMid}`}}>
                      <span style={{fontSize:"12px",flexShrink:0}}>⚠️</span>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:"12px",fontWeight:"600",color:C.text,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</p>
                        <p style={{fontSize:"10px",color:C.red,margin:"1px 0 0"}}>{days}j de retard · {fmtDate(t.dueDate)}</p>
                      </div>
                    </div>
                  );
                })}
                {upcomingTasks.map((t,i)=>{
                  const diff=Math.ceil((new Date(t.dueDate)-now)/86400000);
                  return (
                    <div key={t.id||i} style={{display:"flex",alignItems:"flex-start",gap:"7px",padding:"8px 10px",background:C.greenLight,borderRadius:"9px",border:`1px solid ${C.greenMid}`}}>
                      <span style={{fontSize:"12px",flexShrink:0}}>📅</span>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:"12px",fontWeight:"600",color:C.text,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</p>
                        <p style={{fontSize:"10px",color:C.greenDark,margin:"1px 0 0"}}>{diff===0?"Aujourd'hui !":diff===1?"Demain":`Dans ${diff}j`} · {fmtDate(t.dueDate)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* COL 3 — Équipe */}
          <div style={mkCard()}>
            <p style={{fontSize:"14px",fontWeight:"700",color:C.text,margin:"0 0 10px"}}>Équipe ({membres.length})</p>
            {membres.length===0 ? (
              <p style={{fontSize:"12px",color:C.textMuted}}>Aucun membre.</p>
            ) : (
              <>
                <div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginBottom:"10px"}}>
                  {membres.slice(0,12).map((m,i)=>(
                    <div key={m.id||i} title={m.name} style={{width:"28px",height:"28px",borderRadius:"50%",background:ACCENT[i%5].bg,border:`2px solid ${ACCENT[i%5].c}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:"700",color:ACCENT[i%5].dark}}>
                      {m.name?.charAt(0)?.toUpperCase()||"?"}
                    </div>
                  ))}
                  {membres.length>12&&<div style={{width:"28px",height:"28px",borderRadius:"50%",background:C.greenLight,border:`1px solid ${C.greenMid}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",color:C.textMuted}}>+{membres.length-12}</div>}
                </div>
                <div style={{display:"flex",flexDirection:"column"}}>
                  {membres.slice(0,5).map((m,i)=>(
                    <div key={m.id||i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 0",borderBottom:i<Math.min(membres.length,5)-1?`1px solid ${C.border}`:"none"}}>
                      <div style={{width:"24px",height:"24px",borderRadius:"50%",background:ACCENT[i%5].bg,border:`2px solid ${ACCENT[i%5].c}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"10px",fontWeight:"700",color:ACCENT[i%5].dark,flexShrink:0}}>
                        {m.name?.charAt(0)?.toUpperCase()||"?"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontSize:"11px",fontWeight:"600",color:C.text,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</p>
                        <p style={{fontSize:"10px",color:C.textLight,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.email||"membre"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── SECTION BAS : Mes projets + Activité récente ── */}
        <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr",gap:"12px",marginBottom:"12px",alignItems:"start"}}>

          {/* Mes projets */}
          <div style={mkCard()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
              <span style={{fontSize:"14px",fontWeight:"700",color:C.text}}>Mes projets ({projets.length})</span>
              <button onClick={()=>navigate("/projets")} style={{background:"transparent",border:"none",fontSize:"11px",color:C.textMuted,cursor:"pointer",padding:0}}>Voir tous →</button>
            </div>
            {projets.length===0 ? (
              <div style={{background:C.greenLight,borderRadius:"10px",padding:"16px",textAlign:"center",border:`1px dashed ${C.greenMid}`}}>
                <p style={{fontSize:"12px",color:C.textMuted,margin:0}}>Aucun projet.</p>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
                {projets.map((p,i)=>{
                  const kpis=statsMap[p.id]?.kpis;
                  const prog=Number(p.progress??kpis?.progressCount??0);
                  const late=Number(p.lateTasks??kpis?.late??0);
                  const done=kpis?.done??0, total=kpis?.total??0;
                  const acc=ACCENT[i%ACCENT.length];
                  return (
                    <div key={p.id} onClick={()=>navigate(`/projets/${p.id}`)}
                      style={{background:acc.bg,borderRadius:"10px",padding:"10px 12px",cursor:"pointer",border:`1px solid ${C.border}`,transition:"all 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.boxShadow=C.shadowHover}
                      onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"5px",gap:"6px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"7px",minWidth:0,flex:1}}>
                          <div style={{width:"7px",height:"7px",borderRadius:"50%",background:acc.c,flexShrink:0}}/>
                          <span style={{fontSize:"12px",fontWeight:"600",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                        </div>
                        <div style={{display:"flex",gap:"5px",alignItems:"center",flexShrink:0}}>
                          {late>0&&<span style={{fontSize:"9px",background:C.redLight,color:C.red,padding:"1px 6px",borderRadius:"999px",fontWeight:"600",border:`1px solid ${C.redMid}`}}>{late} retard</span>}
                          <span style={{fontSize:"11px",fontWeight:"700",color:acc.c}}>{prog}%</span>
                        </div>
                      </div>
                      <div style={{height:"3px",background:"rgba(255,255,255,0.7)",borderRadius:"999px",overflow:"hidden",marginBottom:"3px"}}>
                        <div style={{width:`${Math.min(prog,100)}%`,height:"3px",background:acc.c,borderRadius:"999px"}}/>
                      </div>
                      {total>0&&<p style={{fontSize:"10px",color:C.textMuted,margin:0}}>{done}/{total} terminées</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activité récente */}
          <div style={mkCard()}>
            <p style={{fontSize:"14px",fontWeight:"700",color:C.text,margin:"0 0 10px"}}>Activité récente</p>
            {recentTasks.length===0 ? (
              <div style={{background:C.greenLight,borderRadius:"10px",padding:"16px",textAlign:"center",border:`1px dashed ${C.greenMid}`}}>
                <p style={{fontSize:"12px",color:C.textMuted,margin:0}}>Aucune activité récente.</p>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:"5px"}}>
                {recentTasks.map((t,i)=>(
                  <div key={t.id||i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 10px",background:"#fafaf8",borderRadius:"9px",border:`1px solid ${C.border}`}}>
                    <div style={{width:"6px",height:"6px",borderRadius:"50%",flexShrink:0,background:isDone(t)?C.green:isInProgress(t)?C.blue:C.pink}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:"12px",fontWeight:"600",color:C.text,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</p>
                      {t.dueDate&&<p style={{fontSize:"10px",color:C.textLight,margin:"1px 0 0"}}>Échéance : {fmtDate(t.dueDate)}</p>}
                    </div>
                    <StatusBadge title={t._links?.status?.title}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION BASSE : Aperçu par statut ── */}
        <div style={mkCard()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px",flexWrap:"wrap",gap:"6px"}}>
            <span style={{fontSize:"14px",fontWeight:"700",color:C.text}}>Aperçu par statut</span>
            <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
              {[
                ["all",      "Tout"],
                ["todo",     `À faire (${allTaches.filter(isTodo).length})`],
                ["progress", `En cours (${allTaches.filter(isInProgress).length})`],
                ["done",     `Terminé (${allTaches.filter(isDone).length})`],
              ].map(([tab,label])=>(
                <button key={tab} onClick={()=>setKanbanFilter(tab)} style={{background:kanbanFilter===tab?C.greenLight:"transparent",border:kanbanFilter===tab?`1px solid ${C.greenMid}`:`1px solid ${C.border}`,borderRadius:"999px",padding:"3px 10px",fontSize:"10px",color:kanbanFilter===tab?C.greenDark:C.textMuted,cursor:"pointer",fontWeight:kanbanFilter===tab?"600":"400"}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {kanbanFilter==="all" ? (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px"}}>
              {[
                {label:"À faire",  tasks:allTaches.filter(isTodo),       col:C.pink,     bg:C.pinkLight,  border:C.pinkMid},
                {label:"En cours", tasks:allTaches.filter(isInProgress), col:C.blue,     bg:C.blueLight,  border:"#c5daf5"},
                {label:"Terminé",  tasks:allTaches.filter(isDone),       col:C.greenDark,bg:C.greenLight, border:C.greenMid},
              ].map(col=>(
                <div key={col.label} style={{minWidth:0}}>
                  <div style={{background:col.bg,borderRadius:"9px",padding:"5px 10px",marginBottom:"5px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${col.border}`}}>
                    <span style={{fontSize:"10px",fontWeight:"700",color:col.col}}>{col.label}</span>
                    <span style={{fontSize:"10px",fontWeight:"700",color:"#fff",background:col.col,borderRadius:"999px",padding:"0 6px",minWidth:"18px",textAlign:"center"}}>{col.tasks.length}</span>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"4px",maxHeight:"160px",overflowY:"auto"}}>
                    {col.tasks.length===0 ? (
                      <div style={{padding:"12px",textAlign:"center",fontSize:"11px",color:C.textLight,border:`1.5px dashed ${C.border}`,borderRadius:"9px",background:"#fafaf8"}}>Vide</div>
                    ) : col.tasks.slice(0,10).map((t,i)=>(
                      <div key={t.id||i} title={t.subject} style={{background:"#fff",borderRadius:"8px",padding:"6px 8px",border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:"5px"}}>
                        <div style={{width:"4px",height:"4px",borderRadius:"50%",background:col.col,flexShrink:0}}/>
                        <span style={{flex:1,minWidth:0,fontSize:"11px",color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</span>
                      </div>
                    ))}
                    {col.tasks.length>10&&<div style={{fontSize:"10px",color:C.textLight,textAlign:"center",padding:"3px"}}>+{col.tasks.length-10} autres</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:"5px",maxHeight:"240px",overflowY:"auto"}}>
              {filteredKanban.length===0 ? (
                <div style={{padding:"20px",textAlign:"center",background:C.greenLight,borderRadius:"10px",border:`1.5px dashed ${C.greenMid}`}}>
                  <p style={{fontSize:"13px",color:C.greenDark,margin:0,fontWeight:"500"}}>Aucune tâche dans cette catégorie.</p>
                </div>
              ) : filteredKanban.slice(0,15).map((t,i)=>(
                <div key={t.id||i} style={{display:"flex",alignItems:"center",gap:"8px",padding:"7px 10px",background:"#fafaf8",borderRadius:"9px",border:`1px solid ${C.border}`}}>
                  <div style={{width:"6px",height:"6px",borderRadius:"50%",flexShrink:0,background:isDone(t)?C.green:isInProgress(t)?C.blue:C.pink}}/>
                  <span style={{fontSize:"12px",color:C.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</span>
                  <div style={{display:"flex",gap:"5px",alignItems:"center",flexShrink:0}}>
                    {t.dueDate&&<span style={{fontSize:"10px",color:new Date(t.dueDate)<now&&!isDone(t)?C.red:C.textLight}}>{fmtDate(t.dueDate)}</span>}
                    <StatusBadge title={t._links?.status?.title}/>
                  </div>
                </div>
              ))}
              {filteredKanban.length>15&&<p style={{fontSize:"11px",color:C.textLight,textAlign:"center",margin:"4px 0 0"}}>+{filteredKanban.length-15} tâches supplémentaires</p>}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}