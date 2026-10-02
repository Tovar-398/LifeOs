import { useState, useEffect, useRef } from "react";

const dg = async k => { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } };
let LAST_SAVE_ERR = "";
let LAST_META_T = 0;
let LAST_CLOUD_OK = null; // null = este entorno no tiene nube
const errStr = e => { try { return (e&&e.message)||JSON.stringify(e)||String(e); } catch { return String(e); } };

/* ── Capa LOCAL (siempre disponible): IndexedDB, o localStorage-shim en el HTML ── */
const idb = () => new Promise((res,rej)=>{ const rq=indexedDB.open("lifeos-db",1); rq.onupgradeneeded=()=>rq.result.createObjectStore("kv"); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error); });
const idbGet = async k => { const db=await idb(); return new Promise((res)=>{ const tx=db.transaction("kv","readonly").objectStore("kv").get(k); tx.onsuccess=()=>res(tx.result==null?null:String(tx.result)); tx.onerror=()=>res(null); }); };
const idbSet = async (k,v) => { const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction("kv","readwrite").objectStore("kv").put(v,k); tx.onsuccess=()=>res(); tx.onerror=()=>rej(tx.error||new Error("idb write")); }); };
const isLocalShim = () => typeof window!=="undefined" && window.storage && window.storage.__local;
const localGet = async k => { if(isLocalShim()){ try{const r=await window.storage.get(k);return r&&r.value!=null?String(r.value):null}catch{return null} } return idbGet(k); };
const localSet = async (k,v) => { if(isLocalShim()){ await window.storage.set(k,v); return; } return idbSet(k,v); };

/* ── Capa NUBE (Claude Storage, cuando el puente funciona) ── */
const cloudAvail = () => typeof window!=="undefined" && window.storage && !window.storage.__local;
const cloudGet = async k => { try { const r=await window.storage.get(k); return r&&r.value!=null?String(r.value):null; } catch { return null; } };
const cloudSet = async (k,v) => {
  for(let i=0;i<2;i++){
    try { await window.storage.set(k,v); } catch {}
    const c = await cloudGet(k);
    if(c===v) return;
    await new Promise(r=>setTimeout(r,300));
  }
  throw new Error("nube: verificación falló");
};

/* ── Trozos + meta, parametrizado por backend ── */
const CHUNK = 1800;
const saveTo = async (set, payload) => {
  const n = Math.ceil(payload.length/CHUNK)||1;
  for(let i=0;i<n;i++) await set("lifeoschunk"+i, payload.slice(i*CHUNK,(i+1)*CHUNK));
  const t = Date.now();
  await set("lifeosmeta", JSON.stringify({n, len:payload.length, t}));
  return t;
};
const loadFrom = async (get) => {
  try{
    const mR = await get("lifeosmeta"); if(!mR) return null;
    const meta = JSON.parse(mR);
    let p = "";
    for(let i=0;i<meta.n;i++){ const part = await get("lifeoschunk"+i); if(part==null) return null; p += part; }
    if(p.length !== meta.len) return null;
    return { data: JSON.parse(p), t: meta.t||0 };
  }catch{ return null; }
};

/* ── API principal: local SIEMPRE + nube oportunista ── */
const saveMain = async (obj) => {
  const payload = typeof obj==="string"?obj:JSON.stringify(obj);
  let t = false;
  try { t = await saveTo(localSet, payload); LAST_SAVE_ERR=""; }
  catch(e){ LAST_SAVE_ERR = "[local] "+errStr(e); }
  if(cloudAvail()){
    try { const ct = await saveTo(cloudSet, payload); LAST_CLOUD_OK = true; if(!t) t = ct; }
    catch(e){ LAST_CLOUD_OK = false; if(!t) LAST_SAVE_ERR = "[nube] "+errStr(e); }
  }
  return t;
};
const loadMain = async () => {
  const loc = await loadFrom(localGet);
  let cld = null;
  if(cloudAvail()){ cld = await loadFrom(cloudGet); if(cld) LAST_CLOUD_OK = true; }
  const best = (cld && (!loc || cld.t >= loc.t)) ? cld : loc;
  if(best){ LAST_META_T = best.t; return best.data; }
  const legacy = (await dg("lifeos:main")) || (await dg("lifeosmain"));
  return legacy || null;
};
const cloudMetaT = async () => { if(!cloudAvail()) return 0; try { const m = await cloudGet("lifeosmeta"); return m ? (JSON.parse(m).t||0) : 0; } catch { return 0; } };
const storageLabel = () => cloudAvail() ? (LAST_CLOUD_OK===false ? "Local ✓ · Nube Claude falla en este dispositivo" : "Local + Nube Claude ☁️") : "Este navegador (local)";

const SK = {
  exp:"v3:exp",sal:"v3:sal",prod:"v3:prod",stx:"v3:stx",sav:"v3:sav",stk:"v3:stk",cry:"v3:cry",fix:"v3:fix",crd:"v3:crd",trd:"v3:trd",pl:"v3:pl",
  habits:"los:habits",comp:"los:comp",tasks:"los:tasks",
  journal:"mind:journal",medSess:"mind:sess",routines:"body:routines",wkLogs:"body:logs",plans:"body:plans",activePlan:"body:activeplan",ak:"v3:ak"
};
const M  = v => new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:0}).format(v||0);
const M2 = v => new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(v||0);
const U  = v => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(v||0);
const pc = v => `${(v||0)>=0?"+":""}${(v||0).toFixed(2)}%`;
const td = () => new Date().toISOString().split("T")[0];
const ds = d => d.toISOString().split("T")[0];
const fd = d => { try { return new Date(d+"T12:00:00").toLocaleDateString("es-MX",{day:"numeric",month:"short"}); } catch { return d; } };
const mk = d => d ? d.slice(0,7) : td().slice(0,7);
const nm = () => td().slice(0,7);

const QUOTES=["La disciplina es el puente entre las metas y los logros.","No cuentes los días, haz que los días cuenten.","El éxito es la suma de pequeños esfuerzos repetidos día a día.","Tu vida no mejora por casualidad, mejora por el cambio.","La motivación te pone en marcha, el hábito te mantiene en movimiento.","No se trata de ser el mejor. Se trata de ser mejor que ayer.","La consistencia supera al talento cuando el talento no es consistente.","Empieza donde estás. Usa lo que tienes. Haz lo que puedes.","Un año desde hoy, desearías haber empezado hoy.","Tu única competencia eres tú de ayer.","El dolor de la disciplina es menor que el dolor del arrepentimiento.","Pequeñas acciones consistentes crean resultados extraordinarios.","Sé la persona que tu yo de 10 años admiraría.","Haz hoy lo que otros no harán para tener mañana lo que otros no tendrán.","Cuida tu cuerpo. Es el único lugar donde tienes que vivir.","La mente es todo. En lo que piensas, en eso te conviertes.","Cambia tus hábitos, cambia tu vida.","Los ganadores hacen lo que los perdedores no quieren hacer.","El secreto para salir adelante es comenzar.","Sé constante. La magia del éxito está en la rutina."];
const QUOTE = () => QUOTES[Math.floor(Date.now()/86400000)%QUOTES.length];
const CATS=[{id:"food",icon:"🍔",label:"Comida",color:"#f97316"},{id:"transport",icon:"🚗",label:"Transporte",color:"#3b82f6"},{id:"entertain",icon:"🎮",label:"Entret.",color:"#8b5cf6"},{id:"clothes",icon:"👕",label:"Ropa",color:"#ec4899"},{id:"services",icon:"📶",label:"Servicios",color:"#14b8a6"},{id:"health",icon:"💊",label:"Salud",color:"#22c55e"},{id:"home",icon:"🏠",label:"Hogar",color:"#f59e0b"},{id:"snack",icon:"🍬",label:"Antojo",color:"#e11d48"},{id:"beauty",icon:"✨",label:"Belleza",color:"#a855f7"},{id:"education",icon:"📚",label:"Educación",color:"#0ea5e9"},{id:"other",icon:"⋯",label:"Otro",color:"#6b7280"}];
const GC = id => CATS.find(c=>c.id===id)||CATS[CATS.length-1];
const CRYPTOS=[{id:"bitcoin",symbol:"BTC",name:"Bitcoin"},{id:"ethereum",symbol:"ETH",name:"Ethereum"},{id:"solana",symbol:"SOL",name:"Solana"},{id:"ripple",symbol:"XRP",name:"XRP"},{id:"dogecoin",symbol:"DOGE",name:"Dogecoin"},{id:"cardano",symbol:"ADA",name:"Cardano"},{id:"avalanche-2",symbol:"AVAX",name:"Avalanche"},{id:"chainlink",symbol:"LINK",name:"Chainlink"}];
const EMOJIS=["💧","💪","📚","🧘","🏃","🥗","😴","✍️","🎯","💊","🚶","🧠","❤️","🎵","🌿","☀️","🏋️","🍎","🎨","🧹","💰","📝","🥤","🏊","🚴","🌅","🥦","🚭","🧴","🫁"];
const HCOLORS=["#00FF87","#7ED8F6","#c084fc","#f97316","#ec4899","#FFB800","#22c55e","#3b82f6","#e11d48","#14b8a6","#a855f7","#FF4545"];
const PCOLOR={alta:"#FF4545",media:"#FFB800",baja:"#7ED8F6"};
const MOODS=[{e:"🤩",l:"Increíble"},{e:"😊",l:"Bien"},{e:"😌",l:"Tranquilo"},{e:"😐",l:"Normal"},{e:"😔",l:"Bajo"},{e:"😤",l:"Frustrado"},{e:"😰",l:"Ansioso"},{e:"😴",l:"Cansado"}];
const MUSCLES=["Pecho","Espalda","Hombros","Bíceps","Tríceps","Core","Piernas","Glúteos","Full Body","Cardio"];
const DEF_EX=[{id:1,name:"Sentadilla",muscle:"Piernas",emoji:"🦵"},{id:2,name:"Press banca",muscle:"Pecho",emoji:"💪"},{id:3,name:"Peso muerto",muscle:"Espalda",emoji:"🏋️"},{id:4,name:"Dominadas",muscle:"Espalda",emoji:"💪"},{id:5,name:"Militar press",muscle:"Hombros",emoji:"💪"},{id:6,name:"Curl bíceps",muscle:"Bíceps",emoji:"💪"},{id:7,name:"Fondos",muscle:"Tríceps",emoji:"💪"},{id:8,name:"Abdominales",muscle:"Core",emoji:"🔥"},{id:9,name:"Zancadas",muscle:"Piernas",emoji:"🦵"},{id:10,name:"Remo con barra",muscle:"Espalda",emoji:"💪"},{id:11,name:"Elevaciones laterales",muscle:"Hombros",emoji:"💪"},{id:12,name:"Hip thrust",muscle:"Glúteos",emoji:"🍑"},{id:13,name:"Plancha",muscle:"Core",emoji:"🔥"},{id:14,name:"Correr",muscle:"Cardio",emoji:"🏃"},{id:15,name:"Saltar cuerda",muscle:"Cardio",emoji:"🪢"}];
const getStreak=(comp,id)=>{const c=comp[id]||{};let s=0;const d=new Date();d.setHours(0,0,0,0);if(!c[ds(d)])d.setDate(d.getDate()-1);while(true){const k=ds(d);if(c[k]){s++;d.setDate(d.getDate()-1)}else break}return s};
const getLast28=()=>{const days=[];for(let i=27;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(ds(d))}return days};

/* ── Score de Vida: 0-100 por día combinando los 4 pilares ── */
const calcDayScore=(dStr,{habits,comp,wkLogs,medSess,journal,expenses,dailyBudget,plan})=>{
  const pillars=[];
  // 🔥 Hábitos (peso 30)
  if(habits.length>0){
    const done=habits.filter(h=>(comp[h.id]||{})[dStr]).length;
    pillars.push({id:"hab",e:"🔥",l:"Hábitos",w:30,v:Math.round(done/habits.length*100)});
  }
  // 💪 Cuerpo (peso 25): ritmo semanal — entrenos en los 7 días que terminan en dStr vs objetivo del plan
  const dEnd=new Date(dStr+"T23:59:59");const dStart=new Date(dEnd);dStart.setDate(dStart.getDate()-6);
  const wkCount=wkLogs.filter(w=>{const wd=new Date(w.date+"T12:00:00");return wd>=dStart&&wd<=dEnd}).length;
  const target=plan?plan.daysPerWeek:3;
  if(plan||wkLogs.length>0)pillars.push({id:"bod",e:"💪",l:"Cuerpo",w:25,v:Math.min(100,Math.round(wkCount/target*100))});
  // 💰 Finanzas (peso 25): gasto del día vs presupuesto diario (ingreso mensual/30)
  if(dailyBudget>0){
    const spent=expenses.filter(e=>e.date===dStr).reduce((a,e)=>a+e.amount,0);
    const v=spent<=dailyBudget?100:Math.max(0,Math.round(100-((spent-dailyBudget)/dailyBudget)*100));
    pillars.push({id:"fin",e:"💰",l:"Finanzas",w:25,v});
  }
  if(pillars.length===0)return{score:null,pillars:[]};
  const totW=pillars.reduce((a,p)=>a+p.w,0);
  const score=Math.round(pillars.reduce((a,p)=>a+p.v*p.w,0)/totW);
  return{score,pillars};
};
const scoreColor=s=>s==null?"#444":s>=80?"#00FF87":s>=60?"#7ED8F6":s>=40?"#FFB800":"#FF4545";
const scoreLabel=s=>s==null?"Sin datos":s>=80?"¡Imparable! 🚀":s>=60?"Buen ritmo 💪":s>=40?"Puedes más ⚡":"Día de reinicio 🔄";

/* ── Semanas (lunes como inicio) ── */
const weekKey=(d=new Date())=>{const x=new Date(d);x.setHours(0,0,0,0);const dow=(x.getDay()+6)%7;x.setDate(x.getDate()-dow);return ds(x)};
const nextWeekKey=(d=new Date())=>{const x=new Date(d);x.setDate(x.getDate()+7);return weekKey(x)};
const prevWeekKey=(d=new Date())=>{const x=new Date(d);x.setDate(x.getDate()-7);return weekKey(x)};
const reviewStreak=(reviews)=>{
  const keys=new Set(reviews.map(r=>r.weekKey));
  let k=weekKey();let s=0;
  if(!keys.has(k))k=prevWeekKey(); // gracia: la semana en curso aún puede hacerse
  while(keys.has(k)){s++;const d=new Date(k+"T12:00:00");d.setDate(d.getDate()-7);k=ds(d)}
  return s;
};
const SEED_PLANS=[
 {id:900001,seedV:4,name:"⚔️ 5 Días · Upper/Lower/Push/Pull/Legs",daysPerWeek:5,days:[
  {label:"Día 1",name:"UPPER · Torso Completo (Lunes)",exercises:[
   {id:5131,name:"Press inclinado con mancuernas a 30°",muscle:"Pecho",emoji:"💪",tSets:4,tReps:"8-10",rest:"2.5 min"},
   {id:5132,name:"Jalón al pecho agarre neutro/cerrado",muscle:"Espalda",emoji:"💪",tSets:4,tReps:"8-10",rest:"2 min"},
   {id:5133,name:"Press plano máquina Hammer o Multipower",muscle:"Pecho",emoji:"💪",tSets:3,tReps:"10-12",rest:"2 min"},
   {id:5134,name:"Remo T-Bar o remo en polea",muscle:"Espalda",emoji:"💪",tSets:3,tReps:"10-12",rest:"2 min"},
   {id:5135,name:"Elevaciones laterales en polea",muscle:"Hombros",emoji:"💪",tSets:4,tReps:"12-15",rest:"90 seg"},
   {id:5136,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]},
  {label:"Día 2",name:"LOWER · Pierna Cuádriceps (Martes)",exercises:[
   {id:5231,name:"Prensa de piernas",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"8-10",rest:"2.5 min"},
   {id:5232,name:"Peso muerto rumano",muscle:"Piernas",emoji:"🦵",tSets:3,tReps:"10-12",rest:"2 min"},
   {id:5233,name:"Extensión de cuádriceps",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"12-15",rest:"90 seg"},
   {id:5234,name:"Elevación de talones de pie",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"12-15",rest:"60 seg"},
   {id:5235,name:"Vacíos abdominales (Vacuum) o crunch en polea",muscle:"Core",emoji:"🔥",tSets:3,tReps:"15",rest:"60 seg"},
   {id:5236,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]},
  {label:"Día 3",name:"PUSH · Pecho / Hombro Lateral / Tríceps (Miércoles)",exercises:[
   {id:5331,name:"Press inclinado en Multipower o Hammer",muscle:"Pecho",emoji:"💪",tSets:4,tReps:"8-10",rest:"2.5 min"},
   {id:5332,name:"Aperturas inclinadas en polea (cruce bajo)",muscle:"Pecho",emoji:"💪",tSets:3,tReps:"12-15",rest:"90 seg"},
   {id:5333,name:"Elevaciones laterales con mancuernas",muscle:"Hombros",emoji:"💪",tSets:4,tReps:"12-15",rest:"90 seg"},
   {id:5334,name:"Extensión tríceps polea (cuerda)",muscle:"Tríceps",emoji:"💪",tSets:4,tReps:"10-12",rest:"90 seg"},
   {id:5335,name:"Fondos en paralelas (o Press francés)",muscle:"Tríceps",emoji:"💪",tSets:3,tReps:"10-12",rest:"90 seg"},
   {id:5336,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]},
  {label:"Día 4",name:"PULL · Espalda / Deltoide Post. / Bíceps (Jueves)",exercises:[
   {id:5431,name:"Jalón al pecho agarre neutro/cerrado",muscle:"Espalda",emoji:"💪",tSets:4,tReps:"8-10",rest:"2 min"},
   {id:5432,name:"Remo unilateral en polea o mancuerna",muscle:"Espalda",emoji:"💪",tSets:3,tReps:"10-12",rest:"2 min"},
   {id:5433,name:"Pull-over polea alta (cuerda)",muscle:"Espalda",emoji:"💪",tSets:3,tReps:"12-15",rest:"90 seg"},
   {id:5434,name:"Pájaros en Pec Deck invertido",muscle:"Hombros",emoji:"💪",tSets:4,tReps:"12-15",rest:"90 seg"},
   {id:5435,name:"Curl inclinado con mancuernas",muscle:"Bíceps",emoji:"💪",tSets:4,tReps:"10-12",rest:"90 seg"},
   {id:5436,name:"Curl martillo con mancuernas",muscle:"Bíceps",emoji:"💪",tSets:3,tReps:"10-12",rest:"90 seg"},
   {id:5437,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]},
  {label:"Día 5",name:"LEGS · Isquios y Glúteo (Viernes)",exercises:[
   {id:5531,name:"Hip Thrust o peso muerto rumano pesado",muscle:"Glúteos",emoji:"🍑",tSets:4,tReps:"8-10",rest:"2.5 min"},
   {id:5532,name:"Sentadilla búlgara",muscle:"Piernas",emoji:"🦵",tSets:3,tReps:"10-12 x pierna",rest:"2 min"},
   {id:5533,name:"Curl de pierna sentado",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"10-12",rest:"90 seg"},
   {id:5534,name:"Elevación de talones sentado",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"15",rest:"60 seg"},
   {id:5535,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]}
 ]},
 {id:900002,seedV:4,name:"⚔️ 4 Días · Torso/Pierna (Mar-Vie)",daysPerWeek:4,days:[
  {label:"Día 1",name:"TORSO A · Pecho Superior y Espalda (Martes)",exercises:[
   {id:4141,name:"Press inclinado con mancuernas a 30°",muscle:"Pecho",emoji:"💪",tSets:4,tReps:"8-10",rest:"2.5 min · RIR 1-2, pausa 1s"},
   {id:4142,name:"Jalón al pecho agarre neutro/cerrado",muscle:"Espalda",emoji:"💪",tSets:4,tReps:"8-10",rest:"2 min"},
   {id:4143,name:"Press plano máquina Hammer o Multipower",muscle:"Pecho",emoji:"💪",tSets:3,tReps:"10-12",rest:"2 min"},
   {id:4144,name:"Remo apoyado en banco/máquina (codos 45°)",muscle:"Espalda",emoji:"💪",tSets:3,tReps:"10-12",rest:"2 min"},
   {id:4145,name:"Elevaciones laterales en polea",muscle:"Hombros",emoji:"💪",tSets:4,tReps:"12-15",rest:"90 seg"},
   {id:4146,name:"Curl inclinado con mancuernas",muscle:"Bíceps",emoji:"💪",tSets:3,tReps:"10",rest:"superserie ↓"},
   {id:4147,name:"Extensión tríceps polea (cuerda)",muscle:"Tríceps",emoji:"💪",tSets:3,tReps:"12",rest:"90 seg"},
   {id:4148,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]},
  {label:"Día 2",name:"PIERNA A · Dominante Cuádriceps (Miércoles)",exercises:[
   {id:4241,name:"Prensa de piernas",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"8-10",rest:"2.5 min"},
   {id:4242,name:"Peso muerto rumano",muscle:"Piernas",emoji:"🦵",tSets:3,tReps:"10-12",rest:"2 min"},
   {id:4243,name:"Extensión de cuádriceps",muscle:"Piernas",emoji:"🦵",tSets:3,tReps:"12-15",rest:"90 seg · dropset final"},
   {id:4244,name:"Curl de pierna acostado",muscle:"Piernas",emoji:"🦵",tSets:3,tReps:"10-12",rest:"90 seg"},
   {id:4245,name:"Elevación de talones de pie",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"12-15",rest:"60 seg · pausa 2s"},
   {id:4246,name:"Vacíos abdominales (Vacuum) o crunch en polea",muscle:"Core",emoji:"🔥",tSets:3,tReps:"15",rest:"60 seg"},
   {id:4247,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]},
  {label:"Día 3",name:"TORSO B · Hombro Lateral/Posterior (Jueves)",exercises:[
   {id:4341,name:"Press inclinado en Multipower o Hammer",muscle:"Pecho",emoji:"💪",tSets:4,tReps:"8-10",rest:"2.5 min"},
   {id:4342,name:"Remo con barra o mancuerna a una mano",muscle:"Espalda",emoji:"💪",tSets:4,tReps:"8-10",rest:"2 min"},
   {id:4343,name:"Aperturas inclinadas en polea (cruce bajo)",muscle:"Pecho",emoji:"💪",tSets:3,tReps:"12-15",rest:"90 seg"},
   {id:4344,name:"Jalón unilateral en polea",muscle:"Espalda",emoji:"💪",tSets:3,tReps:"10-12",rest:"90 seg"},
   {id:4345,name:"Elevaciones laterales con mancuernas",muscle:"Hombros",emoji:"💪",tSets:4,tReps:"12-15",rest:"90 seg"},
   {id:4346,name:"Pájaros en Pec Deck invertido",muscle:"Hombros",emoji:"💪",tSets:3,tReps:"12-15",rest:"90 seg"},
   {id:4347,name:"Curl martillo con mancuernas",muscle:"Bíceps",emoji:"💪",tSets:3,tReps:"10",rest:"superserie ↓"},
   {id:4348,name:"Fondos en paralelas (o Press francés)",muscle:"Tríceps",emoji:"💪",tSets:3,tReps:"10",rest:"90 seg"},
   {id:4349,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]},
  {label:"Día 4",name:"PIERNA B · Isquios, Glúteo y Pantorrilla (Viernes)",exercises:[
   {id:4441,name:"Hip Thrust o sentadilla búlgara",muscle:"Glúteos",emoji:"🍑",tSets:4,tReps:"8-10",rest:"2.5 min"},
   {id:4442,name:"Prensa de piernas (pies altos y abiertos)",muscle:"Piernas",emoji:"🦵",tSets:3,tReps:"10-12",rest:"2 min"},
   {id:4443,name:"Curl de pierna sentado",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"10-12",rest:"90 seg"},
   {id:4444,name:"Zancadas caminando",muscle:"Piernas",emoji:"🦵",tSets:3,tReps:"12 pasos x pierna",rest:"90 seg"},
   {id:4445,name:"Elevación de talones sentado",muscle:"Piernas",emoji:"🦵",tSets:4,tReps:"15",rest:"60 seg"},
   {id:4446,name:"Cardio LISS caminadora inclinada",muscle:"Cardio",emoji:"🏃",tSets:1,tReps:"15 min",rest:"116-135 bpm"}]}
 ]}
];
const NUTRI_TARGET={kcal:2030,protein:150,carbs:200,fat:65};
const NUTRI_MEALS=[
 {id:"n1",time:"07:00 AM",title:"Desayuno Post-Entreno",kcal:520,p:35,c:55,f:18,items:["3 huevos enteros + 2 claras (revueltos o estrellados)","Bowl: 150 g de fruta (sandía, melón o mango) + 100 g de yogur griego natural sin azúcar + 30 g de granola","2 tortillas de maíz o 2 rebanadas de pan integral"]},
 {id:"n2",time:"12:00 PM",title:"Almuerzo",kcal:550,p:42,c:50,f:16,items:["180 g de pechuga de pollo, bistec de res magro o filete de pescado","1 taza de arroz cocido o 200 g de papa/camote al horno","Ensalada o verduras al gusto + 40 g de aguacate (1/3 de pieza)"]},
 {id:"n3",time:"04:30 PM",title:"Batido Denso Proteico",kcal:710,p:46,c:72,f:20,items:["1.5 scoops de proteína Whey + 250 ml de leche entera o deslactosada","50 g de avena en hojuelas","1 plátano mediano","20 g de crema de cacahuate natural sin azúcar"]},
 {id:"n4",time:"08:30 PM",title:"Cena",kcal:250,p:28,c:18,f:7,items:["1 lata de atún en agua (o 130 g de pechuga de pollo)","Ensalada verde libre (espinaca, pepino, jitomate) + 1 cdta de aceite de oliva","2 tostadas horneadas de maíz"]},
];
/* ── Finanzas: fechas de tarjeta y tips ── */
const cardDates=(card,t=new Date())=>{
  if(card.kind==="prestamo"){
    const day=Math.min(Math.max(+card.payDay||1,1),28);
    let pay=new Date(t.getFullYear(),t.getMonth(),day);if(pay<t)pay=new Date(t.getFullYear(),t.getMonth()+1,day);
    const lastCut=new Date(pay);lastCut.setMonth(lastCut.getMonth()-1);
    const dPay=Math.ceil((pay-t)/86400000);
    const interest=card.apr>0?(card.balance||0)*(card.apr/100)/12:0;
    return{cut:pay,lastCut,pay,dPay,dCut:dPay,util:card.limit>0?Math.round((card.balance||0)/card.limit*100):0,interest};
  }
  const cd=card.cutDay||1,pd=card.payDays||20;
  let cut=new Date(t.getFullYear(),t.getMonth(),cd);if(cut<=t)cut=new Date(t.getFullYear(),t.getMonth()+1,cd);
  const lastCut=new Date(cut);lastCut.setMonth(lastCut.getMonth()-1);
  const pay=new Date(lastCut);pay.setDate(pay.getDate()+pd); // límite de pago del último corte
  const dPay=Math.ceil((pay-t)/86400000);
  const dCut=Math.ceil((cut-t)/86400000);
  const util=card.limit>0?Math.round((card.balance||0)/card.limit*100):0;
  const interest=card.apr>0?Math.max(0,(card.balance||0)-(card.minPayment||0))*(card.apr/100)/12:0;
  return{cut,lastCut,pay,dPay,dCut,util,interest};
};
const finTips=({cards,expenses,budgets,recurring,savings,totSav,mInc,mExp,savGoals,payLog})=>{
  const tips=[];const m=nm();const inc=mInc(),exp=mExp();const bal=inc-exp;
  const now=new Date();
  cards.forEach(c=>{
    if(!(c.balance>0))return;const d=cardDates(c,now);
    const paidSince=payLog.some(p=>p.cardId===c.id&&new Date(p.date+"T12:00:00")>=d.lastCut);
    if(!paidSince&&d.dPay>=0&&d.dPay<=7)tips.push({t:"⏰",c:"#FF4545",x:"Pago de "+c.name+" vence en "+d.dPay+" día"+(d.dPay!==1?"s":"")+(c.statementBalance>0?" · saldo del mes "+M(c.statementBalance):"")});
    if(!paidSince&&d.dPay<0)tips.push({t:"🚨",c:"#FF4545",x:c.name+" venció hace "+Math.abs(d.dPay)+" días — paga ya para evitar intereses y reporte a buró"});
    if(d.util>=50)tips.push({t:"💳",c:"#FF4545",x:c.name+" al "+d.util+"% de su límite — arriba de 30% daña tu score crediticio"});
    else if(d.util>=30)tips.push({t:"💳",c:"#FFB800",x:c.name+" al "+d.util+"% de utilización — ideal mantener bajo 30%"});
    if(d.interest>0)tips.push({t:"📉",c:"#FFB800",x:"Si solo pagas el mínimo de "+c.name+" generarás ~"+M(d.interest)+" de intereses este mes"});
  });
  recurring.forEach(r=>{
    const done=expenses.some(e=>mk(e.date)===m&&e.note===r.name);
    if(!done&&now.getDate()>=r.day)tips.push({t:"🔁",c:"#FFB800",x:r.name+" ("+M(r.amount)+") debió cargarse el día "+r.day+" y no está registrado"});
  });
  if(inc>0){const rate=bal/inc*100;
    if(rate<0)tips.push({t:"🔴",c:"#FF4545",x:"Este mes gastas más de lo que ingresas ("+M(Math.abs(bal))+" de déficit). Frena gastos variables."});
    else if(rate<10)tips.push({t:"🐷",c:"#FFB800",x:"Tasa de ahorro "+rate.toFixed(0)+"% — meta mínima 10%, ideal 20%. Págate primero al recibir ingresos."});
    else if(rate>=20)tips.push({t:"🏆",c:"#00FF87",x:"Tasa de ahorro "+rate.toFixed(0)+"% — nivel élite. Canaliza el excedente a metas o inversión."});
  }
  if(exp>0&&totSav<exp*3)tips.push({t:"🛡️",c:"#7ED8F6",x:"Fondo de emergencia cubre "+(totSav/exp).toFixed(1)+" meses — objetivo 3-6 meses ("+M(exp*3)+" a "+M(exp*6)+")"});
  const hormiga=expenses.filter(e=>mk(e.date)===m&&e.amount<150&&["antojos","food","entertainment","other"].includes(e.cat));
  if(hormiga.length>=8){const s=hormiga.reduce((a,e)=>a+e.amount,0);tips.push({t:"🐜",c:"#FFB800",x:hormiga.length+" gastos hormiga este mes suman "+M(s)+" — invisibles uno a uno, pesados juntos"});}
  CATS.filter(c=>+budgets[c.id]>0).forEach(c=>{const s=expenses.filter(e=>mk(e.date)===m&&e.cat===c.id).reduce((a,e)=>a+e.amount,0);if(s>+budgets[c.id])tips.push({t:c.icon,c:"#FF4545",x:"Presupuesto de "+c.label+" excedido en "+M(s-+budgets[c.id])})});
  savGoals.forEach(g=>{if(g.saved<g.target){const d=Math.ceil((new Date(g.deadline+"T12:00:00")-now)/86400000);if(d>0&&d<=30)tips.push({t:"🎯",c:"#7ED8F6",x:"Meta '"+g.name+"' vence en "+d+" días — faltan "+M(g.target-g.saved)})}});
  if(tips.length===0)tips.push({t:"✨",c:"#00FF87",x:"Todo en orden: sin vencimientos cercanos, sin excesos. Sigue así."});
  return tips.slice(0,8);
};
const MODS=[{id:"hoy",icon:"☀️",label:"Hoy",color:"#64b4f6"},{id:"cuerpo",icon:"💪",label:"Cuerpo",color:"#ff9f45"},{id:"comidas",icon:"🍽️",label:"Comidas",color:"#30d158"},{id:"dinero",icon:"💰",label:"Dinero",color:"#64b4f6"},{id:"mas",icon:"⋯",label:"Más",color:"#b388f5"}];

const CSS=`@keyframes fadeUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}@keyframes floatUp{0%{opacity:0;transform:translateY(6px)}25%{opacity:1}100%{opacity:0;transform:translateY(-26px)}}@keyframes confettiFall{0%{transform:translateY(-20px) rotate(0)}100%{transform:translateY(110vh) rotate(720deg)}}@keyframes levelPop{0%{transform:scale(.8);opacity:0}100%{transform:scale(1);opacity:1}}
.card{background:#121316;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:15px;animation:fadeUp .2s ease}
.sect{font-size:11px;font-weight:700;color:#8b8f96;letter-spacing:.6px;text-transform:uppercase;margin-bottom:9px;display:flex;align-items:center;gap:7px}
.row{display:flex;align-items:center;gap:12px;padding:11px 4px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);transition:opacity .15s}
.row:last-child{border-bottom:none}
.row:active{opacity:.6}
.chk{width:22px;height:22px;border-radius:50%;border:2px solid #3a3d44;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;transition:all .15s}
.chk.on{background:#30d158;border-color:#30d158;color:#08130c}
.pill{padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:#121316;color:#8b8f96;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;transition:all .15s}
.pill.on{background:var(--ac);color:#000;border-color:var(--ac);font-weight:700}
.bar{height:7px;background:#1c1d21;border-radius:999px;overflow:hidden}
.bar>i{display:block;height:100%;border-radius:999px;transition:width .5s ease}
.neo{background:#121316;border:1px solid var(--nc,rgba(255,255,255,.07));border-radius:16px;padding:15px;position:relative}
.neo-static{background:#121316;border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:15px}
.xpToast{position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:200;pointer-events:none;font-weight:700;font-size:16px;animation:floatUp 1.1s ease-out forwards;font-family:inherit}
.quest{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:12px;background:#121316;border:1px solid rgba(255,255,255,.06);cursor:pointer}
.quest.done{opacity:.5}
.lc{background:#121316;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px;animation:fadeUp .2s ease}
.lbp{background:var(--ac);color:#000;border:none;border-radius:11px;padding:10px 17px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;transition:filter .15s}
.lbp:active{filter:brightness(.9)}
.lbp:disabled{opacity:.35;cursor:not-allowed}
.lbs{background:transparent;color:#8b8f96;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:8px 13px;font-size:13px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px}
.lbd{background:rgba(255,69,69,.1);color:#ff6b6b;border:1px solid rgba(255,69,69,.25);border-radius:9px;padding:5px 9px;font-size:12px;cursor:pointer;font-family:inherit}
input.lfi,select.lfi,textarea.lfi{background:#0b0c0e;color:#f0f0f0;border:1px solid rgba(255,255,255,.09);border-radius:11px;padding:11px 12px;font-size:15px;outline:none;width:100%;font-family:inherit;-webkit-appearance:none}
input.lfi:focus,select.lfi:focus,textarea.lfi:focus{border-color:var(--ac)}
label.lfl{display:block;font-size:11px;color:#6e727a;margin-bottom:4px;font-weight:500}
.lr{display:flex;gap:9px;flex-wrap:wrap}.lr>*{flex:1;min-width:120px}
.lmn{font-variant-numeric:tabular-nums}
.ltg{display:inline-block;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600}
.ltgg{background:rgba(48,209,88,.12);color:#30d158}.ltgr{background:rgba(255,107,107,.12);color:#ff6b6b}.ltgb{background:rgba(100,180,246,.12);color:#64b4f6}.ltgw{background:rgba(255,183,0,.12);color:#FFB800}
.ltbl{width:100%;border-collapse:collapse;font-size:13px}
.ltbl th{font-size:11px;color:#6e727a;text-align:left;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.06);font-weight:600}
.ltbl td{padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.05)}
.ltbl tr:last-child td{border-bottom:none}
.navb{position:fixed;bottom:0;left:0;right:0;background:rgba(14,15,17,.97);backdrop-filter:blur(12px);border-top:1px solid rgba(255,255,255,.07);display:flex;z-index:60;padding-bottom:env(safe-area-inset-bottom,0px)}
.navb button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 2px 8px;border:none;background:none;cursor:pointer;font-family:inherit;transition:color .15s}
`;

export default function LifeOS() {
  const[mod,setMod]=useState("hoy");const[now,setNow]=useState(new Date());const[ready,setReady]=useState(false);
  const[expenses,setExpenses]=useState([]);const[salary,setSalary]=useState({amount:"",currency:"MXN",freq:"monthly",label:"Trabajo"});
  const[products,setProducts]=useState([]);const[saleTx,setSaleTx]=useState([]);const[savings,setSavings]=useState([]);
  const[stocks,setStocks]=useState([]);const[crypto,setCrypto]=useState([]);const[fixed,setFixed]=useState([]);
  const[cards,setCards]=useState([]);const[trading,setTrading]=useState({balance:45,currency:"USD"});const[payLog,setPayLog]=useState([]);
  const[habits,setHabits]=useState([]);const[comp,setComp]=useState({});const[tasks,setTasks]=useState([]);
  const[journal,setJournal]=useState([]);const[medSess,setMedSess]=useState([]);
  const[routines,setRoutines]=useState([]);const[wkLogs,setWkLogs]=useState([]);const[plans,setPlans]=useState([]);const[activePlanId,setActivePlanId]=useState(null);const[savGoals,setSavGoals]=useState([]);const[checkins,setCheckins]=useState([]);const[budgets,setBudgets]=useState({});const[nwLog,setNwLog]=useState([]);const[reviews,setReviews]=useState([]);const[introSeen,setIntroSeen]=useState(false);const[hideStart,setHideStart]=useState(false);const[nutriLog,setNutriLog]=useState({});const[gymDraft,setGymDraft]=useState(null);const[shopping,setShopping]=useState([]);const[playerName,setPlayerName]=useState("Jugador");const[soundOn,setSoundOn]=useState(true);const[incomes,setIncomes]=useState([]);const[recurring,setRecurring]=useState([]);
  const[apiKey,setApiKey]=useState("");const[rate,setRate]=useState(17.15);const[cPx,setCPx]=useState({});

  useEffect(()=>{
    (async()=>{
      setBackendName("detectando...");
      let map=await loadMain();
      if(!map){
        const vals=await Promise.all(Object.values(SK).map(k=>dg(k)));const keys=Object.keys(SK);
        map=Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));
      }
      if(map.exp)setExpenses(map.exp);if(map.sal)setSalary(map.sal);if(map.prod)setProducts(map.prod);if(map.stx)setSaleTx(map.stx);
      if(map.sav)setSavings(map.sav);if(map.stk)setStocks(map.stk);if(map.cry)setCrypto(map.cry);if(map.fix)setFixed(map.fix);
      if(map.crd)setCards(map.crd);if(map.trd)setTrading(map.trd);if(map.pl)setPayLog(map.pl);
      if(map.habits)setHabits(map.habits);if(map.comp)setComp(map.comp);if(map.tasks)setTasks(map.tasks);
      if(map.journal)setJournal(map.journal);if(map.medSess)setMedSess(map.medSess);
      if(map.routines)setRoutines(map.routines);if(map.wkLogs)setWkLogs(map.wkLogs);const loadedPlans=map.plans||[];
      const merged=[
        ...SEED_PLANS.map(sp=>{
          const ex=loadedPlans.find(p=>p.id===sp.id);
          // Actualiza al plan oficial si no existe o si su versión quedó vieja; conserva ediciones sobre versiones ya vigentes
          return(!ex||(ex.seedV||0)<sp.seedV)?sp:ex;
        }),
        ...loadedPlans.filter(p=>!SEED_PLANS.find(sp=>sp.id===p.id))
      ];
      setPlans(merged);
      setActivePlanId(map.activePlan||merged[0]?.id||null);
      if(map.goals)setSavGoals(map.goals);
      if(map.checkins)setCheckins(map.checkins);
      if(map.budgets)setBudgets(map.budgets);
      if(map.nwlog)setNwLog(map.nwlog);
      if(map.reviews)setReviews(map.reviews);
      if(map.intro)setIntroSeen(true);
      if(map.hstart)setHideStart(true);
      if(map.nutri)setNutriLog(map.nutri);
      if(map.gymd)setGymDraft(map.gymd);
      if(map.shop)setShopping(map.shop);
      if(map.pname)setPlayerName(map.pname);
      if(map.snd===false)setSoundOn(false);
      if(map.inc)setIncomes(map.inc);
      if(map.rec)setRecurring(map.rec);if(map.ak)setApiKey(map.ak);
      loadedT.current=LAST_META_T||Date.now();
      setBackendName(storageLabel());
      setReady(true);
    })();
    loadMarket();const ti=setInterval(()=>setNow(new Date()),30000);const tm=setInterval(loadMarket,120000);
    return()=>{clearInterval(ti);clearInterval(tm)};
  },[]);

  const loadMarket=async()=>{
    try{const r=await fetch("https://open.er-api.com/v6/latest/USD");const d=await r.json();if(d?.rates?.MXN)setRate(+d.rates.MXN.toFixed(4))}catch{}
    try{const ids=CRYPTOS.map(c=>c.id).join(",");const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids="+ids+"&vs_currencies=usd&include_24hr_change=true");const d=await r.json();setCPx(d)}catch{}
  };

  const[saveState,setSaveState]=useState("ok"); // ok | saving | error
  const[forceSave,setForceSave]=useState(0);
  const[saveErr,setSaveErr]=useState("");
  const[backendName,setBackendName]=useState("");
  const[showData,setShowData]=useState(false);
  const[syncMsg,setSyncMsg]=useState("");
  const loadedT=useRef(0);const importRef=useRef(null);
  useEffect(()=>{
    if(!ready)return;
    setSaveState("saving");
    const t=setTimeout(async()=>{
      const data={exp:expenses,sal:salary,prod:products,stx:saleTx,sav:savings,stk:stocks,cry:crypto,fix:fixed,crd:cards,trd:trading,pl:payLog,habits,comp,tasks,journal,medSess,routines,wkLogs,plans,activePlan:activePlanId,goals:savGoals,checkins,budgets,nwlog:nwLog,reviews,intro:introSeen,hstart:hideStart,nutri:nutriLog,gymd:gymDraft,shop:shopping,pname:playerName,snd:soundOn,inc:incomes,rec:recurring,ak:apiKey};
      const kb=(JSON.stringify(data).length/1024).toFixed(1);
      const ok=await saveMain(data);
      if(ok)loadedT.current=ok;
      setBackendName(storageLabel());
      setSaveState(ok?"ok":"error");
      setSaveErr(ok?"":(LAST_SAVE_ERR||"sin detalle")+" · payload "+kb+"KB");
    },400);
    return()=>clearTimeout(t);
  },[expenses,salary,products,saleTx,savings,stocks,crypto,fixed,cards,trading,payLog,habits,comp,tasks,journal,medSess,routines,wkLogs,plans,activePlanId,savGoals,checkins,budgets,nwLog,reviews,introSeen,hideStart,nutriLog,gymDraft,shopping,playerName,soundOn,incomes,recurring,apiKey,ready,forceSave]);

  // Red de seguridad: si Android oculta/mata la app, no esperamos los 400ms del debounce —
  // guardamos de inmediato en cuanto la pestaña deja de estar visible.
  const flushRef=useRef(null);
  flushRef.current={exp:expenses,sal:salary,prod:products,stx:saleTx,sav:savings,stk:stocks,cry:crypto,fix:fixed,crd:cards,trd:trading,pl:payLog,habits,comp,tasks,journal,medSess,routines,wkLogs,plans,activePlan:activePlanId,goals:savGoals,checkins,budgets,nwlog:nwLog,reviews,intro:introSeen,hstart:hideStart,nutri:nutriLog,gymd:gymDraft,shop:shopping,pname:playerName,snd:soundOn,inc:incomes,rec:recurring,ak:apiKey};
  useEffect(()=>{
    if(!ready)return;
    const flush=()=>{ if(document.visibilityState==="hidden"&&flushRef.current) saveMain(flushRef.current); };
    document.addEventListener("visibilitychange",flush);
    window.addEventListener("pagehide",flush);
    return()=>{document.removeEventListener("visibilitychange",flush);window.removeEventListener("pagehide",flush)};
  },[ready]);


  const cy=f=>{if(!f.startDate||!f.rate)return 0;const d=Math.max(0,Math.floor((Date.now()-new Date(f.startDate))/86400000));return f.principal*(f.rate/100)*(d/365)};
  const sV=s=>s.shares*(s.currentPrice||s.buyPrice)*(s.currency==="USD"?rate:1);
  const cV=c=>c.amount*(cPx[c.id]?.usd||c.buyPrice)*rate;
  const salMXN=()=>{if(!salary.amount)return 0;const a=salary.currency==="USD"?+salary.amount*rate:+salary.amount;return salary.freq==="weekly"?a*4:salary.freq==="biweekly"?a*2:a};
  const mExp=(m=nm())=>expenses.filter(e=>mk(e.date)===m).reduce((a,e)=>a+e.amount,0);
  const mInc=(m=nm())=>salMXN()+saleTx.filter(s=>mk(s.date)===m).reduce((a,s)=>a+s.total,0)+incomes.filter(i=>mk(i.date)===m).reduce((a,i)=>a+i.amount,0);
  const totSav=savings.reduce((a,s)=>a+(s.currency==="USD"?s.amount*rate:s.amount),0);
  const totPort=stocks.reduce((a,s)=>a+sV(s),0)+crypto.reduce((a,c)=>a+cV(c),0)+fixed.reduce((a,f)=>a+f.principal+cy(f),0)+totSav;
  const totDebt=cards.reduce((a,c)=>a+(c.balance||0),0);
  // Foto mensual automática del patrimonio neto (actualiza el mes en curso)
  useEffect(()=>{
    if(!ready)return;
    const m=nm();const v=Math.round(totPort-totDebt);const dbt=Math.round(totDebt);
    setNwLog(p=>{
      const ex=p.find(x=>x.month===m);
      if(ex&&ex.value===v&&ex.debt===dbt)return p;
      return[...p.filter(x=>x.month!==m),{month:m,value:v,debt:dbt}].sort((a,b)=>a.month.localeCompare(b.month));
    });
  },[ready,totPort,totDebt]);

  const tToggle=id=>{const t=td();setComp(p=>({...p,[id]:{...(p[id]||{}),[t]:!(p[id]||{})[t]}}))};
  const todDone=habits.filter(h=>(comp[h.id]||{})[td()]).length;
  const medThisWeek=medSess.filter(s=>(Date.now()-new Date(s.date))/86400000<=7).length;
  const lastWk=wkLogs.length>0?wkLogs[wkLogs.length-1]:null;
  const acColor=MODS.find(m=>m.id===mod)?.color||"#efefef";
  const exportData=()=>JSON.stringify({exp:expenses,sal:salary,prod:products,stx:saleTx,sav:savings,stk:stocks,cry:crypto,fix:fixed,crd:cards,trd:trading,pl:payLog,habits,comp,tasks,journal,medSess,routines,wkLogs,plans,activePlan:activePlanId,goals:savGoals,checkins,budgets,nwlog:nwLog,reviews,intro:introSeen,hstart:hideStart,nutri:nutriLog,gymd:gymDraft,shop:shopping,pname:playerName,snd:soundOn,inc:incomes,rec:recurring,ak:apiKey});
  const importData=(json)=>{
    try{
      const m=JSON.parse(json);
      if(m.exp)setExpenses(m.exp);if(m.sal)setSalary(m.sal);if(m.prod)setProducts(m.prod);if(m.stx)setSaleTx(m.stx);
      if(m.sav)setSavings(m.sav);if(m.stk)setStocks(m.stk);if(m.cry)setCrypto(m.cry);if(m.fix)setFixed(m.fix);
      if(m.crd)setCards(m.crd);if(m.trd)setTrading(m.trd);if(m.pl)setPayLog(m.pl);if(m.habits)setHabits(m.habits);
      if(m.comp)setComp(m.comp);if(m.tasks)setTasks(m.tasks);if(m.journal)setJournal(m.journal);if(m.medSess)setMedSess(m.medSess);
      if(m.routines)setRoutines(m.routines);if(m.wkLogs)setWkLogs(m.wkLogs);if(m.plans)setPlans(m.plans);
      if(m.activePlan)setActivePlanId(m.activePlan);if(m.goals)setSavGoals(m.goals);if(m.checkins)setCheckins(m.checkins);if(m.budgets)setBudgets(m.budgets);if(m.nwlog)setNwLog(m.nwlog);if(m.reviews)setReviews(m.reviews);if(m.inc)setIncomes(m.inc);if(m.rec)setRecurring(m.rec);if(m.nutri)setNutriLog(m.nutri);if(m.pname)setPlayerName(m.pname);if(m.gymd!==undefined)setGymDraft(m.gymd);if(m.shop)setShopping(m.shop);if(m.ak)setApiKey(m.ak);
      return true;
    }catch{return false}
  };
  importRef.current=importData;
  const gameXpInfo=calcXp({habits,comp,tasks,wkLogs,checkins,reviews,saleTx,savGoals});
  const gameLvl=lvlFromXp(gameXpInfo.xp);
  const prevLvl=useRef(null);
  const[levelUp,setLevelUp]=useState(null);
  useEffect(()=>{
    if(!ready)return;
    if(prevLvl.current===null){prevLvl.current=gameLvl;return}
    if(gameLvl>prevLvl.current){setLevelUp(gameLvl);if(soundOn)playFanfare();}
    prevLvl.current=gameLvl;
  },[gameLvl,ready]);
  const syncFromRemote=async(manual)=>{
    try{
      const ct=await cloudMetaT();
      if(ct>loadedT.current){
        const res=await loadFrom(cloudGet);
        if(res&&importRef.current(JSON.stringify(res.data))){
          loadedT.current=res.t;
          saveTo(localSet,JSON.stringify(res.data)).catch(()=>{});
          setBackendName(storageLabel());
          setSyncMsg("🔄 Datos actualizados desde otro dispositivo");
          setTimeout(()=>setSyncMsg(""),4000);
          return true;
        }
      }
    }catch{}
    setBackendName(storageLabel());
    if(manual){setSyncMsg(cloudAvail()?(LAST_CLOUD_OK===false?"📱 La nube no responde en este dispositivo — datos seguros en local":"✓ Ya tienes la versión más reciente"):"📱 Esta versión guarda solo en este navegador");setTimeout(()=>setSyncMsg(""),3500)}
    return false;
  };
  useEffect(()=>{
    if(!ready)return;
    const h=()=>{if(document.visibilityState==="visible")syncFromRemote(false)};
    document.addEventListener("visibilitychange",h);
    window.addEventListener("focus",h);
    const iv=setInterval(h,60000);
    return()=>{document.removeEventListener("visibilitychange",h);window.removeEventListener("focus",h);clearInterval(iv)};
  },[ready]);

  const ctx={expenses,setExpenses,salary,setSalary,products,setProducts,saleTx,setSaleTx,savings,setSavings,stocks,setStocks,crypto,setCrypto,fixed,setFixed,cards,setCards,trading,setTrading,payLog,setPayLog,habits,setHabits,comp,setComp,tasks,setTasks,journal,setJournal,medSess,setMedSess,routines,setRoutines,wkLogs,setWkLogs,plans,setPlans,activePlanId,setActivePlanId,savGoals,setSavGoals,checkins,setCheckins,budgets,setBudgets,nwLog,setNwLog,reviews,setReviews,hideStart,setHideStart,nutriLog,setNutriLog,gymDraft,setGymDraft,shopping,setShopping,playerName,setPlayerName,soundOn,setSoundOn,incomes,setIncomes,recurring,setRecurring,apiKey,setApiKey,rate,cPx,cy,sV,cV,salMXN,mExp,mInc,totSav,totPort,totDebt,tToggle,now,CRYPTOS,loadMarket,todDone,medThisWeek,lastWk,acColor,setMod,saveState};

  if(!ready)return(<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:12,background:"#0a0b0d",color:"#eceef1"}}><style>{CSS}</style><div style={{fontSize:34}}>🧬</div><div style={{color:"#6e727a",fontSize:13}}>Cargando...</div></div>);

  return(
    <div style={{background:"#0a0b0d",color:"#eceef1",minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif","--ac":acColor,paddingBottom:"calc(74px + env(safe-area-inset-bottom,0px))"}}>
      <style>{CSS}</style>
      <div style={{padding:"calc(12px + env(safe-area-inset-top,0px)) 16px 11px",background:"rgba(10,11,13,.97)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(255,255,255,.06)",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,letterSpacing:"-.3px"}}>{MODS.find(m=>m.id===mod)?.label}</div>
          <div style={{fontSize:11,color:"#6e727a",marginTop:1,textTransform:"capitalize"}}>{now.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})}</div>
        </div>
        <div onClick={()=>setShowData(v=>!v)} title="Datos y respaldo" style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 11px",borderRadius:999,background:"#121316",border:"1px solid rgba(255,255,255,.07)"}}>
          <span style={{fontSize:8,color:saveState==="ok"?"#30d158":saveState==="saving"?"#FFB800":"#ff6b6b"}}>●</span>
          <span style={{fontSize:11,color:"#8b8f96"}}>{saveState==="ok"?"Guardado":saveState==="saving"?"Guardando":"Error"}</span>
        </div>
      </div>
      {saveState==="error"&&<div style={{padding:"9px 16px",background:"rgba(255,107,107,.1)",fontSize:12,color:"#ff6b6b",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span>No se pudo guardar: <b>{saveErr}</b></span>
        <button onClick={()=>setForceSave(n=>n+1)} style={{marginLeft:"auto",padding:"4px 11px",border:"1px solid #ff6b6b",borderRadius:8,background:"transparent",color:"#ff6b6b",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Reintentar</button>
      </div>}
      {syncMsg&&<div style={{padding:"8px 16px",background:"rgba(48,209,88,.1)",fontSize:12,color:"#30d158",textAlign:"center"}}>{syncMsg}</div>}
      {ready&&!introSeen&&habits.length===0&&expenses.length===0&&wkLogs.length===0&&<IntroOverlay onStart={()=>setIntroSeen(true)}/>}
      {levelUp&&<LevelUpModal lvl={levelUp} name={playerName} onClose={()=>setLevelUp(null)}/>}
      {showData&&<DataPanel backendName={backendName} saveState={saveState} onRetry={()=>setForceSave(n=>n+1)} onSync={()=>syncFromRemote(true)} exportData={exportData} importData={importData} onClose={()=>setShowData(false)}/>}
      <div style={{padding:"14px 14px 20px",maxWidth:760,margin:"0 auto"}}>
        {mod==="hoy"     && <HoyModule     ctx={ctx}/>}
        {mod==="cuerpo"  && <CuerpoModule  ctx={ctx}/>}
        {mod==="comidas" && <ComidasModule ctx={ctx}/>}
        {mod==="dinero"  && <FinModule     ctx={ctx}/>}
        {mod==="mas"     && <MasModule     ctx={ctx}/>}
      </div>
      <div className="navb">
        {MODS.map(m=>(
          <button key={m.id} onClick={()=>setMod(m.id)} style={{color:mod===m.id?m.color:"#5b5f66"}}>
            <span style={{fontSize:20,lineHeight:1,opacity:mod===m.id?1:.65}}>{m.icon}</span>
            <span style={{fontSize:10,fontWeight:mod===m.id?700:500}}>{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════ HOY ══════════ */
function HoyModule({ctx}){
  const{habits,comp,setComp,tasks,setTasks,wkLogs,checkins,reviews,nutriLog,setNutriLog,setMod,plans,activePlanId,now,playerName}=ctx;
  const tod=td();const wk=weekKey();
  const[showCk,setShowCk]=useState(false);
  const[toast,setToast]=useState(null);
  const ping=(t)=>{setToast(t);setTimeout(()=>setToast(null),1100)};
  const hour=now.getHours();
  const saludo=hour<12?"Buenos días":hour<19?"Buenas tardes":"Buenas noches";
  const plan=plans.find(p=>p.id===activePlanId);
  const trainedToday=wkLogs.some(w=>w.date===tod);
  const ckToday=checkins.find(c=>c.date===tod);
  const activeRev=reviews.find(r=>r.targetWeek===wk);
  const mealsDone=NUTRI_MEALS.filter(m=>(nutriLog[tod]||{})[m.id]).length;
  const habDone=habits.filter(h=>(comp[h.id]||{})[tod]).length;
  const pend=tasks.filter(t=>!t.completed);
  // progreso del día
  const total=NUTRI_MEALS.length+habits.length+1+(plan?1:0);
  const done=mealsDone+habDone+(ckToday?1:0)+(plan&&trainedToday?1:0);
  const pct=total?Math.round(done/total*100):0;
  // próxima comida
  const toMin=t=>{const[hm,ap]=t.split(" ");let[h,m]=hm.split(":").map(Number);if(ap==="PM"&&h!==12)h+=12;if(ap==="AM"&&h===12)h=0;return h*60+m};
  const nowMin=now.getHours()*60+now.getMinutes();
  const nextMeal=NUTRI_MEALS.find(m=>toMin(m.time)>=nowMin&&!(nutriLog[tod]||{})[m.id])||NUTRI_MEALS.find(m=>!(nutriLog[tod]||{})[m.id]);
  const minsTo=nextMeal?toMin(nextMeal.time)-nowMin:0;
  const toggleMeal=(id)=>{const was=(nutriLog[tod]||{})[id];setNutriLog(p=>({...p,[tod]:{...(p[tod]||{}),[id]:!was}}));if(!was)ping("🍽️ Comida registrada")};
  const toggleHab=(h)=>{const was=(comp[h.id]||{})[tod];setComp(p=>({...p,[h.id]:{...(p[h.id]||{}),[tod]:!was}}));if(!was)ping("✓ "+h.name)};
  const toggleTask=(t)=>{setTasks(p=>p.map(x=>x.id===t.id?{...x,completed:!x.completed,completedAt:!x.completed?td():null}:x));if(!t.completed)ping("✓ Tarea lista")};
  const Chk=({on})=><div className={"chk"+(on?" on":"")}>{on?"✓":""}</div>;
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    {toast&&<div className="xpToast" style={{color:"#30d158"}}>{toast}</div>}

    {/* Resumen del día */}
    <div className="card">
      <div style={{fontSize:20,fontWeight:700,letterSpacing:"-.4px"}}>{saludo}{playerName&&playerName!=="Jugador"?", "+playerName:""}</div>
      <div style={{fontSize:13,color:"#8b8f96",marginTop:3}}>{done} de {total} cosas hechas hoy</div>
      <div className="bar" style={{marginTop:11}}><i style={{width:pct+"%",background:pct>=100?"#30d158":"#64b4f6"}}/></div>
      {pct>=100&&<div style={{marginTop:10,fontSize:13,color:"#30d158",fontWeight:600}}>🎉 Día completo. Bien hecho.</div>}
    </div>

    {/* Próxima comida */}
    {nextMeal&&<div className="card" style={{borderColor:minsTo>=0&&minsTo<=30?"rgba(255,183,0,.4)":"rgba(255,255,255,.07)"}}>
      <div className="sect">🍽️ Próxima comida</div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{textAlign:"center",minWidth:62}}>
          <div className="lmn" style={{fontSize:15,fontWeight:700,color:"#FFB800"}}>{nextMeal.time.replace(" AM","").replace(" PM","")}</div>
          <div style={{fontSize:10,color:"#6e727a"}}>{minsTo>0?"en "+(minsTo>=60?Math.floor(minsTo/60)+"h "+(minsTo%60)+"m":minsTo+" min"):"ahora"}</div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:600}}>{nextMeal.title}</div>
          <div style={{fontSize:11,color:"#8b8f96",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nextMeal.items[0]}</div>
        </div>
        <button className="lbs" style={{flexShrink:0}} onClick={()=>setMod("comidas")}>Ver</button>
      </div>
    </div>}

    {/* Entreno */}
    {plan&&<div className="card">
      <div className="sect">💪 Entrenamiento</div>
      {trainedToday?<div style={{display:"flex",alignItems:"center",gap:11}}><Chk on={true}/><div style={{flex:1,fontSize:14}}>Entreno de hoy completado</div></div>
      :<div style={{display:"flex",alignItems:"center",gap:11}}>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>Te toca entrenar</div><div style={{fontSize:11,color:"#8b8f96",marginTop:2}}>{plan.name}</div></div>
        <button className="lbp" style={{background:"#ff9f45"}} onClick={()=>setMod("cuerpo")}>Empezar</button>
      </div>}
    </div>}

    {/* Comidas */}
    <div className="card">
      <div className="sect" style={{justifyContent:"space-between"}}><span>🍽️ Comidas de hoy</span><span style={{color:"#6e727a",fontWeight:500}}>{mealsDone}/{NUTRI_MEALS.length}</span></div>
      {NUTRI_MEALS.map(m=>{const on=!!(nutriLog[tod]||{})[m.id];return(
        <div key={m.id} className="row" onClick={()=>toggleMeal(m.id)}>
          <Chk on={on}/>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,textDecoration:on?"line-through":"none",opacity:on?.55:1}}>{m.title}</div></div>
          <div className="lmn" style={{fontSize:12,color:"#6e727a",flexShrink:0}}>{m.time.replace(" AM","").replace(" PM","")}</div>
        </div>
      )})}
    </div>

    {/* Hábitos */}
    {habits.length>0&&<div className="card">
      <div className="sect" style={{justifyContent:"space-between"}}><span>🔥 Hábitos</span><span style={{color:"#6e727a",fontWeight:500}}>{habDone}/{habits.length}</span></div>
      {habits.map(h=>{const on=!!(comp[h.id]||{})[tod];const st=getStreak(comp,h.id);return(
        <div key={h.id} className="row" onClick={()=>toggleHab(h)}>
          <Chk on={on}/>
          <span style={{fontSize:17}}>{h.emoji||"🔥"}</span>
          <div style={{flex:1,minWidth:0,fontSize:14,textDecoration:on?"line-through":"none",opacity:on?.55:1}}>{h.name}</div>
          {st>0&&<div style={{fontSize:11,color:"#FFB800",flexShrink:0}}>🔥{st}</div>}
        </div>
      )})}
    </div>}

    {/* Check-in */}
    {!ckToday&&!showCk&&<div className="card" onClick={()=>setShowCk(true)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:22}}>🌅</span>
      <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>Check-in del día</div><div style={{fontSize:11,color:"#8b8f96",marginTop:2}}>Sueño, energía y peso · 1 minuto</div></div>
      <span style={{color:"#6e727a"}}>›</span>
    </div>}
    {(showCk||ckToday)&&<CheckinCard ctx={ctx}/>}

    {/* Tareas */}
    {pend.length>0&&<div className="card">
      <div className="sect" style={{justifyContent:"space-between"}}><span>✅ Tareas</span><span onClick={()=>setMod("mas")} style={{color:"#64b4f6",fontWeight:500,cursor:"pointer"}}>ver todas</span></div>
      {pend.slice(0,4).map(t=>(
        <div key={t.id} className="row" onClick={()=>toggleTask(t)}>
          <Chk on={false}/>
          <div style={{flex:1,minWidth:0,fontSize:14}}>{t.text}</div>
          {t.priority==="alta"&&<span className="ltg ltgr" style={{flexShrink:0}}>alta</span>}
        </div>
      ))}
    </div>}

    {/* Prioridades de la semana */}
    {activeRev&&activeRev.priorities.length>0&&<div className="card">
      <div className="sect">🎯 Prioridades de la semana</div>
      {activeRev.priorities.map((pr,i)=>(
        <div key={i} className="row" onClick={()=>ctx.setReviews(p=>p.map(r=>r.id===activeRev.id?{...r,priorities:r.priorities.map((x,j)=>j===i?{...x,done:!x.done}:x)}:r))}>
          <Chk on={pr.done}/>
          <div style={{flex:1,fontSize:14,textDecoration:pr.done?"line-through":"none",opacity:pr.done?.55:1}}>{pr.text}</div>
        </div>
      ))}
    </div>}
  </div>);
}

/* ══════════ MÁS ══════════ */
function MasModule({ctx}){
  const[tab,setTab]=useState("habitos");
  const TABS=[["habitos","Hábitos y tareas"],["semana","Mi semana"],["perfil","Perfil"]];
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
      {TABS.map(([id,l])=><button key={id} className={"pill"+(tab===id?" on":"")} onClick={()=>setTab(id)}>{l}</button>)}
    </div>
    {tab==="habitos"&&<HabModule ctx={ctx}/>}
    {tab==="semana"&&<div style={{display:"flex",flexDirection:"column",gap:14}}><WeeklyReview ctx={ctx}/><ScoreVida ctx={ctx}/></div>}
    {tab==="perfil"&&<HomeModule ctx={ctx}/>}
  </div>);
}

function HomeModule({ctx}){
  const{habits,comp,tasks,wkLogs,checkins,reviews,saleTx,savGoals,playerName,setPlayerName,soundOn,setSoundOn,setMod,nutriLog,now}=ctx;
  const[editName,setEditName]=useState(false);const[nameTmp,setNameTmp]=useState(playerName);
  const xpi=calcXp({habits,comp,tasks,wkLogs,checkins,reviews,saleTx,savGoals});
  const lvl=lvlFromXp(xpi.xp);const title=LVL_TITLES[Math.min(lvl-1,LVL_TITLES.length-1)];
  const curBase=xpForLvl(lvl),nextAt=xpForLvl(lvl+1);const lvlPct=Math.round((xpi.xp-curBase)/(nextAt-curBase)*100);
  const ps=calcPlayerStats(ctx);
  const mult=fireMult(ps.bestStreak);
  const weakest=[...ps.stats].sort((a,b)=>a.v-b.v)[0];
  const strongest=[...ps.stats].sort((a,b)=>b.v-a.v)[0];
  const ach=calcAchievements(ctx);const unlocked=ach.filter(a=>a.ok).length;
  const tod=td();
  // Misiones de hoy (resumen)
  const wk=weekKey();const activeRev=reviews.find(r=>r.targetWeek===wk);
  const qDone=(checkins.some(c=>c.date===tod)?1:0)+(wkLogs.some(w=>w.date===tod)?1:0)+habits.filter(h=>(comp[h.id]||{})[tod]).length+Object.values(nutriLog[tod]||{}).filter(Boolean).length+(activeRev?activeRev.priorities.filter(p=>p.done).length:0);
  const qTotal=2+habits.length+NUTRI_MEALS.length+(activeRev?activeRev.priorities.length:0);
  const avatar=lvl>=10?"👑":lvl>=8?"🦁":lvl>=6?"🐉":lvl>=4?"⚔️":lvl>=2?"🛡️":"🌱";
  // Radar pentágono
  const R=62,cx=80,cy=76;
  const pt=(i,val)=>{const ang=-Math.PI/2+i*(2*Math.PI/5);const r=R*val/100;return[cx+r*Math.cos(ang),cy+r*Math.sin(ang)]};
  const poly=ps.stats.map((s,i)=>pt(i,s.v).join(",")).join(" ");
  const ring=v=>ps.stats.map((s,i)=>pt(i,v).join(",")).join(" ");
  return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
    {/* ═══ TARJETA DE JUGADOR ═══ */}
    <div className="neo" style={{"--nc":"rgba(168,85,247,.55)","--ncg":"rgba(168,85,247,.25)"}}>
      <div style={{display:"flex",gap:14,alignItems:"center"}}>
        <div style={{width:66,height:66,borderRadius:18,background:"radial-gradient(circle at 30% 30%,rgba(168,85,247,.5),rgba(168,85,247,.08))",border:"1px solid rgba(168,85,247,.6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,flexShrink:0,boxShadow:"0 0 18px rgba(168,85,247,.4)"}}>{avatar}</div>
        <div style={{flex:1,minWidth:0}}>
          {editName?<div style={{display:"flex",gap:5}}><input className="lfi" value={nameTmp} onChange={e=>setNameTmp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(setPlayerName(nameTmp.trim()||"Jugador"),setEditName(false))} maxLength={18} autoFocus style={{padding:"5px 8px",fontSize:13}}/><button className="lbp" style={{background:"#a855f7",padding:"5px 10px"}} onClick={()=>{setPlayerName(nameTmp.trim()||"Jugador");setEditName(false)}}>✓</button></div>
          :<div onClick={()=>{setNameTmp(playerName);setEditName(true)}} style={{fontSize:18,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>{playerName}<span style={{fontSize:10,color:"#555"}}>✏️</span></div>}
          <div style={{fontSize:12,fontWeight:800,marginTop:2,background:"linear-gradient(90deg,#a855f7,#7ED8F6,#00FF87,#a855f7)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 4s linear infinite",display:"inline-block"}}>{title}</div>
          <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap"}}>
            <span style={{fontSize:9,padding:"2px 7px",borderRadius:6,background:"rgba(255,183,0,.12)",color:"#FFB800",fontWeight:700}}>{fireLabel(ps.bestStreak)} ×{mult}</span>
            <span style={{fontSize:9,padding:"2px 7px",borderRadius:6,background:"rgba(255,255,255,.05)",color:"#999",fontWeight:700}}>🏅 {unlocked}/{ach.length}</span>
          </div>
        </div>
        <div style={{textAlign:"center",flexShrink:0}}>
          <div style={{fontSize:8,color:"#a855f7",fontWeight:800,letterSpacing:1}}>NIVEL</div>
          <div className="lmn" style={{fontSize:38,fontWeight:900,color:"#a855f7",lineHeight:1,textShadow:"0 0 18px rgba(168,85,247,.7)"}}>{lvl}</div>
        </div>
      </div>
      <div style={{marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#666",marginBottom:4}}><span className="lmn">{xpi.xp.toLocaleString()} XP</span><span>{(nextAt-xpi.xp).toLocaleString()} para nivel {lvl+1}</span></div>
        <div style={{height:9,background:"#0a0a0f",borderRadius:99,overflow:"hidden",border:"1px solid rgba(168,85,247,.25)"}}>
          <div style={{height:"100%",width:lvlPct+"%",background:"linear-gradient(90deg,#7c3aed,#a855f7,#c084fc)",borderRadius:99,transition:"width .6s",boxShadow:"0 0 12px rgba(168,85,247,.8)"}}/>
        </div>
      </div>
      <div style={{position:"absolute",top:10,right:12}}><button onClick={()=>setSoundOn(v=>!v)} title="Sonidos" style={{background:"none",border:"none",cursor:"pointer",fontSize:13,opacity:soundOn?1:.35}}>{soundOn?"🔊":"🔇"}</button></div>
    </div>

    {/* ═══ STATS RPG ═══ */}
    <div className="neo-static">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div style={{fontSize:11,fontWeight:800,color:"#999",letterSpacing:1}}>📊 STATS DEL JUGADOR</div>
        <div style={{fontSize:10,color:"#666"}}>Poder: <b className="lmn" style={{fontSize:14,color:scoreColor(ps.poder)}}>{ps.poder}</b></div>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <svg width="160" height="152" style={{flexShrink:0}}>
          {[25,50,75,100].map(v=><polygon key={v} points={ring(v)} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1"/>)}
          {ps.stats.map((s,i)=>{const[x,y]=pt(i,100);return<line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.06)"/>})}
          <polygon points={poly} fill="rgba(168,85,247,.25)" stroke="#a855f7" strokeWidth="2" style={{filter:"drop-shadow(0 0 6px rgba(168,85,247,.8))"}}/>
          {ps.stats.map((s,i)=>{const[x,y]=pt(i,s.v);return<circle key={i} cx={x} cy={y} r="3.5" fill={s.c}/>})}
          {ps.stats.map((s,i)=>{const[x,y]=pt(i,128);return<text key={i} x={x} y={y+4} textAnchor="middle" fontSize="13">{s.e}</text>})}
        </svg>
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
          {ps.stats.map(s=>(
            <div key={s.id}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}><span style={{color:"#c0c0c0"}}>{s.e} {s.l}</span><b className="lmn" style={{color:s.c}}>{s.v}</b></div>
              <div style={{height:4,background:"#0a0a0f",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:s.v+"%",background:s.c,borderRadius:99,boxShadow:"0 0 6px "+s.c}}/></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:140,fontSize:10,padding:"7px 10px",background:"rgba(255,69,69,.06)",border:"1px solid rgba(255,69,69,.25)",borderRadius:9,color:"#ff8080",lineHeight:1.5}}>🎯 <b>Stat más débil: {weakest.l}</b> — {weakest.tip}</div>
        <div style={{flex:1,minWidth:140,fontSize:10,padding:"7px 10px",background:"rgba(0,255,135,.05)",border:"1px solid rgba(0,255,135,.2)",borderRadius:9,color:"#00FF87",lineHeight:1.5}}>⭐ <b>Tu fuerte: {strongest.l}</b> — mantenlo</div>
      </div>
    </div>

    <GamePanel ctx={ctx}/>
  </div>);
}

/* ══════════ MISIONES DIARIAS ══════════ */
function MissionsModule({ctx}){
  const{habits,comp,setComp,wkLogs,checkins,reviews,setReviews,nutriLog,setNutriLog,setMod,soundOn,now,tasks,saleTx,savGoals,cards,payLog,recurring,expenses}=ctx;
  const[toasts,setToasts]=useState([]);
  const[showCk,setShowCk]=useState(false);
  const tod=td();const wk=weekKey();
  const ps=calcPlayerStats(ctx);const mult=fireMult(ps.bestStreak);
  const activeRev=reviews.find(r=>r.targetWeek===wk);
  const isWeekend=[5,6,0].includes(now.getDay());
  const bossDone=reviews.some(r=>r.weekKey===wk);
  const fire=(xp)=>{
    const id=Date.now()+Math.random();
    setToasts(t=>[...t,{id,xp:Math.round(xp*mult)}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),1200);
    if(soundOn)playXp();
  };
  const toggleHab=(h)=>{const was=(comp[h.id]||{})[tod];setComp(p=>({...p,[h.id]:{...(p[h.id]||{}),[tod]:!was}}));if(!was)fire(10)};
  const toggleMeal=(mid)=>{const was=(nutriLog[tod]||{})[mid];setNutriLog(p=>({...p,[tod]:{...(p[tod]||{}),[mid]:!was}}));if(!was)fire(5)};
  const togglePrio=(ri,pi)=>{const was=activeRev.priorities[pi].done;setReviews(p=>p.map(r=>r.id===ri?{...r,priorities:r.priorities.map((x,i)=>i===pi?{...x,done:!x.done}:x)}:r));if(!was)fire(30)};

  const quests=[
    {id:"ck",e:"🌅",t:"Check-in diario",sub:"Sueño · energía · peso",xp:10,done:checkins.some(c=>c.date===tod),act:()=>setShowCk(v=>!v)},
    {id:"gym",e:"💪",t:"Entreno de hoy",sub:"Registra tu sesión en Cuerpo",xp:50,done:wkLogs.some(w=>w.date===tod),act:()=>setMod("cuerpo")},
    ...cards.filter(c=>c.balance>0).map(c=>{const d=cardDates(c,now);const paid=payLog.some(p=>p.cardId===c.id&&new Date(p.date+"T12:00:00")>=d.lastCut);return(d.dPay<=7||paid)?{id:"tc"+c.id,e:"💳",t:"Pagar "+c.name,sub:paid?"Pagada este periodo":d.dPay<0?"¡VENCIDA hace "+Math.abs(d.dPay)+"d!":"Vence en "+d.dPay+" día"+(d.dPay!==1?"s":""),xp:40,done:paid,act:()=>setMod("dinero")}:null}).filter(Boolean),
    ...recurring.filter(r=>now.getDate()>=r.day).map(r=>{const done=expenses.some(e=>mk(e.date)===nm()&&e.note===r.name);return{id:"rc"+r.id,e:"🔁",t:"Registrar "+r.name,sub:M(r.amount)+" · día "+r.day,xp:15,done,act:()=>setMod("dinero")}}),
    ...habits.map(h=>({id:"h"+h.id,e:h.emoji||"🔥",t:h.name,sub:"Racha "+getStreak(comp,h.id)+"d",xp:10,done:!!(comp[h.id]||{})[tod],act:()=>toggleHab(h)})),
    ...NUTRI_MEALS.map(m=>({id:"m"+m.id,e:"🍽️",t:m.title,sub:m.time,xp:5,done:!!(nutriLog[tod]||{})[m.id],act:()=>toggleMeal(m.id)})),
    ...(activeRev?activeRev.priorities.map((p,i)=>({id:"p"+i,e:"🎯",t:p.text,sub:"Prioridad de la semana",xp:30,done:p.done,act:()=>togglePrio(activeRev.id,i)})):[]),
  ];
  const done=quests.filter(q=>q.done).length;
  const xpToday=Math.round(quests.filter(q=>q.done).reduce((a,q)=>a+q.xp,0)*mult);
  const xpPossible=Math.round(quests.reduce((a,q)=>a+q.xp,0)*mult);
  const perfect=quests.length>0&&done===quests.length;
  const groups=[["Diarias",quests.filter(q=>["ck","gym"].includes(q.id))],["Hábitos",quests.filter(q=>q.id.startsWith("h"))],["Finanzas",quests.filter(q=>q.id.startsWith("tc")||q.id.startsWith("rc"))],["Nutrición",quests.filter(q=>q.id.startsWith("m"))],["Prioridades",quests.filter(q=>q.id.startsWith("p"))]].filter(g=>g[1].length>0);

  return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
    {toasts.map((t,i)=><div key={t.id} className="xpToast" style={{color:"#FFB800",bottom:90+i*30}}>+{t.xp} XP</div>)}

    {/* Cabecera */}
    <div className="neo" style={{"--nc":perfect?"rgba(0,255,135,.6)":"rgba(255,183,0,.5)","--ncg":perfect?"rgba(0,255,135,.3)":"rgba(255,183,0,.2)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,color:"#FFB800",fontWeight:800,letterSpacing:2}}>⚔️ MISIONES DE HOY</div>
          <div style={{fontSize:11,color:"#666",marginTop:2}}>{now.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"short"})}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div className="lmn" style={{fontSize:26,fontWeight:900,color:perfect?"#00FF87":"#FFB800",lineHeight:1}}>{done}<span style={{fontSize:12,color:"#555"}}>/{quests.length}</span></div>
          <div style={{fontSize:9,color:"#666"}}>cumplidas</div>
        </div>
      </div>
      <div style={{height:8,background:"#0a0a0f",borderRadius:99,marginTop:10,overflow:"hidden",border:"1px solid rgba(255,183,0,.2)"}}><div style={{height:"100%",width:(quests.length?done/quests.length*100:0)+"%",background:perfect?"linear-gradient(90deg,#00FF87,#7ED8F6)":"linear-gradient(90deg,#f59e0b,#FFB800)",borderRadius:99,transition:"width .5s",boxShadow:"0 0 10px "+(perfect?"#00FF87":"#FFB800")}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:10}}>
        <span style={{color:"#999"}}>XP hoy: <b className="lmn" style={{color:"#FFB800"}}>{xpToday}</b> / {xpPossible}</span>
        <span style={{color:"#FFB800",fontWeight:700}}>{fireLabel(ps.bestStreak)} ×{mult}</span>
      </div>
      {perfect&&<div style={{marginTop:10,padding:"9px",background:"rgba(0,255,135,.1)",borderRadius:10,textAlign:"center",fontSize:12,fontWeight:900,color:"#00FF87",border:"1px solid rgba(0,255,135,.3)"}}>🏆 ¡DÍA PERFECTO! Todas las misiones cumplidas</div>}
    </div>

    {/* Jefe semanal */}
    {isWeekend&&!bossDone&&<div onClick={()=>setMod("mas")} className="neo" style={{"--nc":"rgba(255,69,69,.6)","--ncg":"rgba(255,69,69,.3)",cursor:"pointer",padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:28}}>👹</span>
      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:900,color:"#FF4545"}}>¡JEFE SEMANAL DISPONIBLE!</div><div style={{fontSize:10,color:"#999"}}>Cierra tu semana en tu Perfil para derrotarlo · +100 XP + cofre</div></div>
      <span style={{color:"#FF4545",fontSize:18}}>›</span>
    </div>}
    {bossDone&&<div style={{padding:"9px 14px",background:"rgba(0,255,135,.05)",border:"1px solid rgba(0,255,135,.2)",borderRadius:12,fontSize:11,color:"#00FF87"}}>👹✅ Jefe semanal derrotado esta semana · +100 XP</div>}

    {showCk&&<CheckinCard ctx={ctx}/>}

    {/* Grupos de misiones */}
    {groups.map(([gname,gq])=>(
      <div key={gname}>
        <div style={{fontSize:10,color:"#666",fontWeight:800,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>{gname} · {gq.filter(q=>q.done).length}/{gq.length}</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {gq.map(q=>(
            <div key={q.id} className={"quest"+(q.done?" done":"")} onClick={q.act}>
              <div style={{width:34,height:34,borderRadius:10,background:q.done?"rgba(0,255,135,.15)":"rgba(255,255,255,.04)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{q.done?"✓":q.e}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:700,textDecoration:q.done?"line-through":"none"}}>{q.t}</div><div style={{fontSize:9,color:"#666"}}>{q.sub}</div></div>
              <div className="lmn" style={{fontSize:11,fontWeight:800,color:q.done?"#00FF87":"#FFB800",flexShrink:0}}>+{Math.round(q.xp*mult)}</div>
            </div>
          ))}
        </div>
      </div>
    ))}
    {habits.length===0&&<div onClick={()=>setMod("mas")} style={{padding:"11px 14px",background:"rgba(0,255,135,.04)",border:"1px dashed rgba(0,255,135,.3)",borderRadius:12,fontSize:11,color:"#00FF87",cursor:"pointer",textAlign:"center"}}>➕ Crea hábitos en Hábitos para tener más misiones diarias</div>}
  </div>);
}

/* ── Contexto financiero para IA ── */
const finContext=(ctx)=>{
  const{expenses,saleTx,incomes,salMXN,mInc,mExp,cards,recurring,savings,savGoals,budgets,totPort,totDebt,totSav,payLog}=ctx;
  const m=nm();const now=new Date();
  const byCat=CATS.map(c=>({l:c.label,v:expenses.filter(e=>mk(e.date)===m&&e.cat===c.id).reduce((a,e)=>a+e.amount,0)})).filter(c=>c.v>0).sort((a,b)=>b.v-a.v);
  const prevM=(()=>{const d=new Date();d.setMonth(d.getMonth()-1);return ds(d).slice(0,7)})();
  return[
    "MES ACTUAL: ingresos "+M(mInc())+" (salario "+M(salMXN())+", ventas "+M(saleTx.filter(s=>mk(s.date)===m).reduce((a,s)=>a+s.total,0))+", otros "+M(incomes.filter(i=>mk(i.date)===m).reduce((a,i)=>a+i.amount,0))+") | egresos "+M(mExp())+" | balance "+M(mInc()-mExp()),
    "MES ANTERIOR: ingresos "+M(mInc(prevM))+" | egresos "+M(mExp(prevM)),
    "GASTOS POR CATEGORÍA: "+(byCat.map(c=>c.l+" "+M(c.v)).join(", ")||"ninguno"),
    "PRESUPUESTOS: "+(CATS.filter(c=>+budgets[c.id]>0).map(c=>c.label+" "+M(+budgets[c.id])).join(", ")||"sin configurar"),
    "GASTOS FIJOS: "+(recurring.map(r=>r.name+" "+M(r.amount)+" día "+r.day).join(", ")||"ninguno"),
    "TARJETAS/DEUDAS: "+(cards.map(c=>{const d=cardDates(c,now);return c.name+(c.kind==="prestamo"?" (préstamo)":"")+" deuda "+M(c.balance||0)+(c.limit?" límite "+M(c.limit)+" util "+d.util+"%":"")+" paga en "+d.dPay+"d"+(c.apr?" tasa "+c.apr+"%":"")+(c.minPayment?" mínimo/mensualidad "+M(c.minPayment):"")}).join(" | ")||"ninguna")+" | DEUDA TOTAL "+M(totDebt),
    "AHORROS: "+M(totSav)+" en "+savings.length+" cuentas ("+savings.map(s=>s.name+" "+(s.currency==="USD"?U(s.amount):M(s.amount))).join(", ")+")",
    "METAS: "+(savGoals.map(g=>g.name+" "+M(g.saved)+"/"+M(g.target)+" vence "+g.deadline).join(", ")||"ninguna"),
    "PATRIMONIO NETO: "+M(totPort-totDebt),
    "PAGOS RECIENTES TC: "+payLog.slice(0,5).map(p=>p.cardName+" "+M(p.amount)+" "+p.date).join(", "),
  ].join("\n");
};

/* ── Análisis IA de finanzas ── */
function FinIA({ctx}){
  const{apiKey,setApiKey}=ctx;
  const[res,setRes]=useState("");const[loading,setLoading]=useState(false);const[open,setOpen]=useState(false);const[keyInput,setKeyInput]=useState("");const[active,setActive]=useState(null);
  const PRESETS=[
    {id:"diag",e:"🩺",l:"Diagnóstico general",p:"Haz un diagnóstico honesto y directo de mis finanzas: salud general del 1 al 10, los 3 problemas más urgentes y las 3 acciones concretas de mayor impacto para este mes. Usa mis números reales."},
    {id:"deuda",e:"💳",l:"Plan para salir de deudas",p:"Diseña un plan concreto para eliminar mis deudas: en qué orden pagarlas (avalancha vs bola de nieve según mis tasas), cuánto destinar cada mes según mi balance real, en cuántos meses quedaría libre y cuánto ahorro en intereses. Sé específico con montos."},
    {id:"ahorro",e:"🐷",l:"Cómo ahorrar más",p:"Analiza mis gastos por categoría y dime dónde exactamente puedo recortar sin sufrir, cuánto ahorraría al mes con cada recorte, y cómo asignarlo a mis metas. Incluye mi tasa de ahorro actual y a cuál debería llegar."},
    {id:"mes",e:"📅",l:"Qué hacer este mes",p:"Dame un plan de acción para el resto del mes: pagos que no puedo olvidar, cuánto puedo gastar por día sin desviarme, y una decisión financiera inteligente que debería tomar esta semana."},
  ];
  const run=async(pr)=>{
    if(!apiKey)return;setActive(pr.id);setLoading(true);setRes("");
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1200,system:"Eres el asesor financiero personal de LifeOS. Datos reales del usuario (pesos mexicanos):\n"+finContext(ctx)+"\n\nResponde en español mexicano, directo, con números concretos, sin rodeos ni disclaimers. Usa viñetas cortas. Máximo 250 palabras.",messages:[{role:"user",content:pr.p}]})});
      const d=await r.json();
      setRes(d.error?"Error: "+d.error.message:(d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n")||"Sin respuesta.");
    }catch(e){setRes("Error: "+e.message)}
    setLoading(false);
  };
  if(!open)return(
    <button onClick={()=>setOpen(true)} className="neo" style={{"--nc":"rgba(168,85,247,.5)","--ncg":"rgba(168,85,247,.2)",width:"100%",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:11,padding:"12px 14px",textAlign:"left"}}>
      <span style={{fontSize:24}}>🧠</span>
      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:"#a855f7"}}>Análisis IA de mis finanzas</div><div style={{fontSize:10,color:"#666"}}>Diagnóstico, plan anti-deudas, dónde ahorrar — con tus números reales</div></div>
      <span style={{color:"#a855f7",fontSize:18}}>›</span>
    </button>
  );
  return(<div className="neo-static" style={{borderColor:"rgba(168,85,247,.4)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <div style={{fontSize:12,fontWeight:800,color:"#a855f7",letterSpacing:1}}>🧠 ANÁLISIS IA</div>
      <button className="lbs" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>setOpen(false)}>✕</button>
    </div>
    {!apiKey?(<div>
      <div style={{fontSize:11,color:"#555",marginBottom:8}}>Conecta tu API Key de Anthropic (console.anthropic.com) para activar el análisis:</div>
      <input className="lfi" type="password" placeholder="sk-ant-..." value={keyInput} onChange={e=>setKeyInput(e.target.value)}/>
      <button className="lbp" style={{marginTop:8,width:"100%",justifyContent:"center",background:"#a855f7",color:"#000"}} onClick={()=>{if(keyInput.startsWith("sk-"))setApiKey(keyInput.trim())}}>Conectar</button>
    </div>):(<>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
        {PRESETS.map(p=>(
          <button key={p.id} onClick={()=>run(p)} disabled={loading} style={{padding:"10px 8px",border:"1px solid "+(active===p.id?"#a855f7":"rgba(255,255,255,.08)"),borderRadius:10,background:active===p.id?"rgba(168,85,247,.12)":"#080808",color:active===p.id?"#a855f7":"#c0c0c0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:3,opacity:loading?.6:1}}>
            <span style={{fontSize:18}}>{p.e}</span>{p.l}
          </button>
        ))}
      </div>
      {loading&&<div style={{fontSize:11,color:"#a855f7",textAlign:"center",padding:10}}>🧠 Analizando tus números...</div>}
      {res&&!loading&&<div style={{fontSize:12,lineHeight:1.7,color:"#e0e0e0",padding:"12px 13px",background:"#080808",borderRadius:10,whiteSpace:"pre-wrap",borderLeft:"3px solid #a855f7"}}>{res}</div>}
    </>)}
  </div>);
}

/* ── Registro rápido (chat) ── */
const parseTxLocal=(text,{savings,cards,savGoals})=>{
  const t=text.toLowerCase();
  const mAmt=t.replace(/,/g,"").match(/(\d+(?:\.\d+)?)\s*(k|mil)?/);
  if(!mAmt)return null;
  let amount=parseFloat(mAmt[1]);if(mAmt[2])amount*=1000;
  const isGoal=/\b(apart|ahorr|abon)\w*\b.*\bpara\b/.test(t)||/\bpara (la |el |mi )?meta\b/.test(t);
  const isIncome=!isGoal&&/\b(vend[ií]|cobr[eé]|ingres|me pagaron|gan[eé]|deposit|recib[ií]|entr[oó]|nómina|nomina|sueldo|quincena|bono)\w*/.test(t);
  const KW=[["food",/tacos|comida|cena|desayun|restaurant|super|despensa|caf[eé]|pizza|hamburgues|com[ií]|almuerzo|sushi|torta|pollo|carne|mandado/],["transport",/uber|didi|gasolina|taxi|metro|cami[oó]n|estacionamiento|caseta|pasaje|combi/],["entertain",/cine|netflix|juego|bar|fiesta|concierto|salida|antro|boleto/],["clothes",/ropa|tenis|playera|zapato|pantal[oó]n|sudadera|gorra|chamarra/],["services",/luz|agua|internet|tel[eé]fono|celular|renta|\bgas\b|spotify|suscripci|plan |recarga/],["health",/doctor|medicin|farmacia|consulta|gym|gimnasio|dentista|vitamin/],["home",/casa|hogar|mueble|limpieza|jab[oó]n|papel/],["snack",/antojo|dulce|helado|refresco|botana|papas|chocolate|galleta|oxxo/],["beauty",/corte|peluquer|barber|cosm|crema|perfume/],["education",/curso|libro|escuela|colegiatura|clase|udemy/]];
  let cat="other";for(const[id,re]of KW){if(re.test(t)){cat=id;break}}
  const findName=list=>list.find(x=>x.name&&t.includes(x.name.toLowerCase()));
  const sav=findName(savings),card=findName(cards),goal=isGoal?(findName(savGoals)||savGoals.find(g=>{const w=g.name.toLowerCase().split(" ")[0];return w.length>3&&t.includes(w)})):null;
  let note=text.replace(/\$?\s*\d+(?:[.,]\d+)?\s*(k|mil)?/i," ");
  for(const x of[sav,card,goal])if(x)note=note.replace(new RegExp(x.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i")," ");
  note=note.replace(/(^|\s)(gast[eé]|pagu[eé]|pagaron|compr[eé]|vend[ií]|cobr[eé]|apart[aeé]|ahorr[aeé]|abon[aeé]|en|de|del|para|con|desde|la|el|los|las|mi|un|una|unas|unos|pesos|me|a)(?=\s|$)/gi," ").replace(/\s+/g," ").trim();
  return{type:isGoal?"goal":isIncome?"income":"expense",amount,cat,note:note?note.charAt(0).toUpperCase()+note.slice(1):"",src:sav?"sav:"+sav.id:card?"card:"+card.id:"none",goalId:goal?goal.id:null,ai:false};
};
function QuickAdd({ctx}){
  const{apiKey,savings,setSavings,cards,setCards,savGoals,setSavGoals,setExpenses,setIncomes,rate,setMod}=ctx;
  const[txt,setTxt]=useState("");const[prev,setPrev]=useState(null);const[busy,setBusy]=useState(false);const[msg,setMsg]=useState("");
  const parse=async()=>{
    const text=txt.trim();if(!text)return;
    let p=parseTxLocal(text,{savings,cards,savGoals});
    if(apiKey){
      setBusy(true);
      try{
        const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:200,system:'Extrae UNA transacción financiera de la frase del usuario. Responde SOLO un JSON válido sin texto extra ni markdown: {"type":"expense"|"income"|"goal","amount":number,"cat":"'+CATS.map(c=>c.id).join("|")+'","note":"descripción corta","source":"nombre exacto de cuenta/tarjeta mencionada o null","goalName":"nombre de meta si type=goal o null"}. type=goal cuando el usuario aparta/ahorra dinero PARA una meta. Cuentas del usuario: '+savings.map(s=>s.name).join(", ")+'. Tarjetas: '+cards.map(c=>c.name).join(", ")+'. Metas: '+savGoals.map(g=>g.name).join(", ")+'.',messages:[{role:"user",content:text}]})});
        const d=await r.json();const raw=(d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
        const j=JSON.parse(raw.replace(/```json|```/g,"").trim());
        if(j&&j.amount>0){
          const findN=(list,n)=>n?list.find(x=>x.name.toLowerCase()===String(n).toLowerCase())||list.find(x=>String(n).toLowerCase().includes(x.name.toLowerCase())):null;
          const sv=findN(savings,j.source),cd=findN(cards,j.source),gl=findN(savGoals,j.goalName);
          p={type:["expense","income","goal"].includes(j.type)?j.type:"expense",amount:+j.amount,cat:CATS.find(c=>c.id===j.cat)?j.cat:(p?p.cat:"other"),note:j.note||(p?p.note:""),src:sv?"sav:"+sv.id:cd?"card:"+cd.id:(p?p.src:"none"),goalId:gl?gl.id:(p?p.goalId:null),ai:true};
        }
      }catch{}
      setBusy(false);
    }
    if(!p){setMsg("No encontré un monto. Ej: \"gasté 150 en tacos\", \"me pagaron 2000\", \"aparta 500 para vacaciones\"");return}
    setMsg("");setPrev({...p,date:td()});
  };
  const applySrc=(srcStr,amt,dir)=>{if(!srcStr||srcStr==="none")return;const[t,idS]=srcStr.split(":");const id=+idS;if(t==="sav")setSavings(pp=>pp.map(s=>s.id===id?{...s,amount:+((s.amount-(s.currency==="USD"?amt/rate:amt)*dir)).toFixed(2)}:s));if(t==="card")setCards(pp=>pp.map(c=>c.id===id?{...c,balance:+(((c.balance||0)+amt*dir)).toFixed(2)}:c))};
  const commit=()=>{
    const p=prev;if(!p||!(p.amount>0))return;
    if(p.type==="expense"){setExpenses(pp=>[...pp,{id:Date.now(),amount:p.amount,note:p.note||GC(p.cat).label,cat:p.cat,date:p.date,src:p.src!=="none"?p.src:undefined}]);applySrc(p.src,p.amount,1);setMsg("✓ Gasto registrado: "+M(p.amount)+" · "+GC(p.cat).label)}
    else if(p.type==="income"){const dest=p.src&&p.src.startsWith("sav:")?p.src:undefined;setIncomes(pp=>[...pp,{id:Date.now(),amount:p.amount,note:p.note||"Ingreso",date:p.date,dest}]);if(dest)applySrc(dest,p.amount,-1);setMsg("✓ Ingreso registrado: "+M(p.amount))}
    else if(p.type==="goal"){if(!p.goalId){setMsg("Elige a qué meta abonar (o créala en Ahorros → Metas)");return}const g=savGoals.find(x=>x.id===p.goalId);setSavGoals(pp=>pp.map(x=>x.id===p.goalId?{...x,saved:x.saved+p.amount}:x));if(p.src&&p.src.startsWith("sav:"))applySrc(p.src,p.amount,1);setMsg("✓ Apartaste "+M(p.amount)+" para "+g.name)}
    setPrev(null);setTxt("");setTimeout(()=>setMsg(""),4000);
  };
  const TYPE={expense:["💸 Gasto","#FF4545"],income:["💰 Ingreso","#00FF87"],goal:["🎯 Apartado","#34d399"]};
  return(<div className="neo-static" style={{borderColor:"rgba(255,183,0,.3)",padding:"11px 13px"}}>
    <div style={{display:"flex",gap:6,alignItems:"center"}}>
      <span style={{fontSize:18}}>⚡</span>
      <input className="lfi" value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&parse()} placeholder='"gasté 150 en tacos con BBVA"  ·  "me pagaron 2000"  ·  "aparta 500 para coche"' style={{flex:1,fontSize:12}}/>
      <button className="lbp" onClick={parse} disabled={busy} style={{background:"#FFB800",color:"#000",padding:"7px 12px",opacity:busy?.6:1}}>{busy?"…":"➤"}</button>
    </div>
    {msg&&<div style={{fontSize:10,color:msg.startsWith("✓")?"#00FF87":"#FFB800",marginTop:6}}>{msg}</div>}
    {prev&&<div style={{marginTop:10,padding:"10px 12px",background:"#080808",borderRadius:10,border:"1px solid "+TYPE[prev.type][1]+"55"}}>
      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
        {Object.keys(TYPE).map(k=><button key={k} onClick={()=>setPrev({...prev,type:k})} style={{padding:"3px 9px",border:"1px solid "+(prev.type===k?TYPE[k][1]:"rgba(255,255,255,.08)"),borderRadius:7,background:prev.type===k?TYPE[k][1]+"22":"transparent",color:prev.type===k?TYPE[k][1]:"#555",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{TYPE[k][0]}</button>)}
        {prev.ai&&<span style={{fontSize:9,color:"#a855f7",marginLeft:"auto"}}>✨ IA</span>}
      </div>
      <div className="lr">
        <div style={{flex:"0 0 100px"}}><label className="lfl">Monto</label><input className="lfi" type="number" inputMode="decimal" value={prev.amount} onChange={e=>setPrev({...prev,amount:+e.target.value})}/></div>
        <div><label className="lfl">Concepto</label><input className="lfi" value={prev.note} onChange={e=>setPrev({...prev,note:e.target.value})}/></div>
      </div>
      <div className="lr" style={{marginTop:6}}>
        {prev.type==="expense"&&<div><label className="lfl">Categoría</label><select className="lfi" value={prev.cat} onChange={e=>setPrev({...prev,cat:e.target.value})}>{CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select></div>}
        {prev.type==="goal"&&<div><label className="lfl">Meta / apartado</label><select className="lfi" value={prev.goalId||""} onChange={e=>setPrev({...prev,goalId:+e.target.value||null})}><option value="">Elige una meta...</option>{savGoals.map(g=><option key={g.id} value={g.id}>🎯 {g.name} · {M(g.saved)}/{M(g.target)}</option>)}</select></div>}
        <div><label className="lfl">{prev.type==="income"?"¿A dónde entró?":prev.type==="goal"?"¿De qué cuenta sale?":"¿De dónde salió?"}</label><select className="lfi" value={prev.src} onChange={e=>setPrev({...prev,src:e.target.value})}>
          <option value="none">💵 Sin registrar</option>
          {savings.map(s=><option key={"s"+s.id} value={"sav:"+s.id}>🏦 {s.name}</option>)}
          {prev.type==="expense"&&cards.map(c=><option key={"c"+c.id} value={"card:"+c.id}>💳 {c.name}</option>)}
        </select></div>
      </div>
      {prev.type==="goal"&&savGoals.length===0&&<div style={{fontSize:10,color:"#FFB800",marginTop:6}}>No tienes metas aún — <span onClick={()=>setMod("dinero")} style={{textDecoration:"underline",cursor:"pointer"}}>créala en Ahorros → Metas / Apartados</span></div>}
      <div style={{display:"flex",gap:6,marginTop:9}}><button className="lbp" onClick={commit} style={{background:TYPE[prev.type][1],color:"#000",flex:1,justifyContent:"center"}}>✓ Registrar</button><button className="lbs" onClick={()=>setPrev(null)}>✕</button></div>
    </div>}
  </div>);
}

/* ══════════ FINANZAS ROBUSTAS ══════════ */
const MN3=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function FinResumen({ctx}){
  const{expenses,saleTx,incomes,salMXN,mInc,mExp,cards,recurring,payLog,totSav,setMod}=ctx;
  const m=nm();const now=new Date();
  const prevM=(()=>{const d=new Date();d.setMonth(d.getMonth()-1);return ds(d).slice(0,7)})();
  const inc=mInc(),exp=mExp(),bal=inc-exp;const rate=inc>0?bal/inc*100:0;
  const pInc=mInc(prevM),pExp=mExp(prevM);
  const salesM=saleTx.filter(s=>mk(s.date)===m).reduce((a,s)=>a+s.total,0);
  const otherM=incomes.filter(i=>mk(i.date)===m).reduce((a,i)=>a+i.amount,0);
  const byCat=CATS.map(c=>({...c,v:expenses.filter(e=>mk(e.date)===m&&e.cat===c.id).reduce((a,e)=>a+e.amount,0)})).filter(c=>c.v>0).sort((a,b)=>b.v-a.v).slice(0,5);
  // 6 meses
  const months=Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-(5-i));const k=ds(d).slice(0,7);return{k,l:MN3[d.getMonth()],inc:mInc(k),exp:mExp(k)}});
  const maxV=Math.max(1,...months.map(x=>Math.max(x.inc,x.exp)));
  // Calendario próximos 30 días
  const events=[];
  cards.forEach(c=>{if(!(c.balance>0))return;const d=cardDates(c,now);const paid=payLog.some(p=>p.cardId===c.id&&new Date(p.date+"T12:00:00")>=d.lastCut);if(!paid&&d.dPay<=30)events.push({d:d.dPay,date:d.pay,e:"💳",t:"Pagar "+c.name,v:c.statementBalance||c.minPayment||c.balance,k:"pay"});events.push({d:d.dCut,date:d.cut,e:"✂️",t:"Corte "+c.name,v:null,k:"cut"})});
  recurring.forEach(r=>{const done=expenses.some(e=>mk(e.date)===m&&e.note===r.name);let dt=new Date(now.getFullYear(),now.getMonth(),Math.min(r.day,28));if(done||dt<now&&done)dt=new Date(now.getFullYear(),now.getMonth()+1,Math.min(r.day,28));else if(dt<now&&!done)dt=new Date(now.getFullYear(),now.getMonth(),Math.min(r.day,28));const dd=Math.ceil((dt-now)/86400000);events.push({d:dd,date:dt,e:"🔁",t:r.name,v:r.amount,k:done?"done":dd<0?"late":"rec"})});
  events.sort((a,b)=>a.d-b.d);
  const tips=finTips(ctx);
  const dCol=d=>d<0?"#FF4545":d<=3?"#FF4545":d<=7?"#FFB800":"#7ED8F6";
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <FinIA ctx={ctx}/>
    {/* Estado del mes */}
    <div className="neo-static" style={{borderColor:"rgba(126,216,246,.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:800,color:"#7ED8F6",letterSpacing:1}}>📊 ESTADO DEL MES · {MN3[now.getMonth()]}</div>
        <div style={{fontSize:10,padding:"3px 9px",borderRadius:7,background:rate>=20?"rgba(0,255,135,.12)":rate>=10?"rgba(255,183,0,.12)":"rgba(255,69,69,.12)",color:rate>=20?"#00FF87":rate>=10?"#FFB800":"#FF4545",fontWeight:800}}>Ahorro {rate.toFixed(0)}%</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
        {[["Ingresos",inc,"#00FF87",pInc],["Egresos",exp,"#FF4545",pExp],["Balance",bal,bal>=0?"#7ED8F6":"#FF4545",pInc-pExp]].map(([l,v,c,pv])=>{const dlt=pv?((v-pv)/Math.abs(pv)*100):null;return(
          <div key={l} style={{background:"#080808",borderRadius:10,padding:"9px 8px",textAlign:"center"}}>
            <div style={{fontSize:8,color:"#555",textTransform:"uppercase",fontWeight:700}}>{l}</div>
            <div className="lmn" style={{fontSize:14,fontWeight:800,color:c,marginTop:3}}>{M(v)}</div>
            {dlt!=null&&isFinite(dlt)&&<div style={{fontSize:8,color:(l==="Egresos"?dlt<=0:dlt>=0)?"#00FF87":"#FF4545",marginTop:2}}>{dlt>=0?"▲":"▼"}{Math.abs(dlt).toFixed(0)}% vs mes ant.</div>}
          </div>)})}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div>
          <div style={{fontSize:9,color:"#555",fontWeight:700,textTransform:"uppercase",marginBottom:5}}>De dónde entra</div>
          {[["💼 Salario",salMXN()],["🛍️ Ventas",salesM],["➕ Otros",otherM]].filter(([,v])=>v>0).map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0"}}><span style={{color:"#999"}}>{l}</span><b className="lmn" style={{color:"#00FF87"}}>{M(v)}</b></div>
          ))}
          {inc===0&&<div style={{fontSize:10,color:"#444"}}>Configura tu salario en Ingresos</div>}
        </div>
        <div>
          <div style={{fontSize:9,color:"#555",fontWeight:700,textTransform:"uppercase",marginBottom:5}}>A dónde se va</div>
          {byCat.map(c=>(
            <div key={c.id} style={{display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0"}}><span style={{color:"#999"}}>{c.icon} {c.label}</span><b className="lmn" style={{color:"#FF4545"}}>{M(c.v)}</b></div>
          ))}
          {byCat.length===0&&<div style={{fontSize:10,color:"#444"}}>Sin gastos este mes</div>}
        </div>
      </div>
    </div>

    {/* Tips */}
    <div className="neo-static" style={{borderColor:"rgba(255,183,0,.25)"}}>
      <div style={{fontSize:11,fontWeight:800,color:"#FFB800",letterSpacing:1,marginBottom:8}}>💡 TIPS DE TU DINERO</div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {tips.map((t,i)=><div key={i} style={{display:"flex",gap:8,padding:"7px 10px",background:"#080808",borderRadius:9,borderLeft:"3px solid "+t.c,fontSize:11,color:"#c0c0c0",lineHeight:1.5}}><span>{t.t}</span><span>{t.x}</span></div>)}
      </div>
    </div>

    {/* Calendario */}
    <div className="neo-static">
      <div style={{fontSize:11,fontWeight:800,color:"#999",letterSpacing:1,marginBottom:8}}>📅 PRÓXIMOS 30 DÍAS</div>
      {events.length===0&&<div style={{fontSize:10,color:"#444"}}>Agrega tarjetas (con día de corte) y gastos fijos para ver tu calendario</div>}
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {events.slice(0,10).map((ev,i)=>(
          <div key={i} onClick={()=>ev.k!=="cut"&&setMod("dinero")} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 10px",background:ev.k==="done"?"rgba(0,255,135,.04)":"#080808",borderRadius:9,opacity:ev.k==="done"?.5:1}}>
            <div style={{width:38,textAlign:"center",flexShrink:0}}><div className="lmn" style={{fontSize:13,fontWeight:800,color:ev.k==="done"?"#00FF87":ev.k==="cut"?"#555":dCol(ev.d)}}>{ev.date.getDate()}</div><div style={{fontSize:8,color:"#555"}}>{MN3[ev.date.getMonth()]}</div></div>
            <span style={{fontSize:14}}>{ev.e}</span>
            <div style={{flex:1,fontSize:11}}>{ev.t}{ev.k==="done"&&<span style={{color:"#00FF87"}}> ✓</span>}</div>
            {ev.v!=null&&<b className="lmn" style={{fontSize:11,color:ev.k==="done"?"#555":"#FFB800"}}>{M(ev.v)}</b>}
            {ev.k!=="cut"&&ev.k!=="done"&&<span style={{fontSize:9,color:dCol(ev.d),fontWeight:700,minWidth:40,textAlign:"right"}}>{ev.d<0?"vencido":ev.d===0?"HOY":"en "+ev.d+"d"}</span>}
          </div>
        ))}
      </div>
    </div>

    {/* 6 meses */}
    <div className="neo-static">
      <div style={{fontSize:11,fontWeight:800,color:"#999",letterSpacing:1,marginBottom:8}}>📈 INGRESOS VS EGRESOS · 6 MESES</div>
      <div style={{display:"flex",alignItems:"flex-end",gap:6,height:90}}>
        {months.map(x=>(
          <div key={x.k} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,height:"100%"}}>
            <div style={{flex:1,width:"100%",display:"flex",alignItems:"flex-end",gap:2}}>
              <div title={"Ingresos "+M(x.inc)} style={{flex:1,height:(x.inc/maxV*100)+"%",minHeight:2,background:"#00FF87",borderRadius:"2px 2px 0 0",opacity:x.k===m?1:.5}}/>
              <div title={"Egresos "+M(x.exp)} style={{flex:1,height:(x.exp/maxV*100)+"%",minHeight:2,background:"#FF4545",borderRadius:"2px 2px 0 0",opacity:x.k===m?1:.5}}/>
            </div>
            <div style={{fontSize:8,color:x.k===m?"#7ED8F6":"#444",fontWeight:x.k===m?700:400}}>{x.l}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:12,fontSize:9,color:"#555",marginTop:6,justifyContent:"center"}}><span><span style={{color:"#00FF87"}}>■</span> Ingresos</span><span><span style={{color:"#FF4545"}}>■</span> Egresos</span></div>
    </div>
  </div>);
}

/* ── Gastos fijos recurrentes ── */
function RecurringCard({ctx}){
  const{recurring,setRecurring,expenses,setExpenses,savings,setSavings,cards,setCards,rate}=ctx;
  const[form,setForm]=useState(null);const[open,setOpen]=useState(true);
  const m=nm();const today=new Date().getDate();
  const E={name:"",amount:"",day:"1",cat:"services",src:"none"};
  const save=()=>{if(!form.name||!form.amount)return;setRecurring(p=>form.id?p.map(x=>x.id===form.id?{...form,amount:+form.amount,day:+form.day}:x):[...p,{...form,amount:+form.amount,day:+form.day,id:Date.now()}]);setForm(null)};
  const applySrc=(srcStr,amt,dir)=>{if(!srcStr||srcStr==="none")return;const[t,idS]=srcStr.split(":");const id=+idS;if(t==="sav")setSavings(p=>p.map(s=>s.id===id?{...s,amount:+((s.amount-(s.currency==="USD"?amt/rate:amt)*dir)).toFixed(2)}:s));if(t==="card")setCards(p=>p.map(c=>c.id===id?{...c,balance:+(((c.balance||0)+amt*dir)).toFixed(2)}:c))};
  const register=(r)=>{setExpenses(p=>[...p,{id:Date.now(),amount:r.amount,note:r.name,cat:r.cat,date:td(),src:r.src!=="none"?r.src:undefined,rec:true}]);applySrc(r.src,r.amount,1)};
  const isDone=r=>expenses.some(e=>mk(e.date)===m&&e.note===r.name);
  const total=recurring.reduce((a,r)=>a+r.amount,0);
  const pend=recurring.filter(r=>!isDone(r));
  return(<div className="lc" style={{borderColor:"rgba(126,216,246,.2)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div onClick={()=>setOpen(v=>!v)} style={{cursor:"pointer"}}><div style={{fontSize:12,fontWeight:700,color:"#7ED8F6"}}>🔁 Gastos fijos del mes</div><div style={{fontSize:10,color:"#555",marginTop:1}}>{recurring.length>0?M(total)+"/mes · "+(pend.length===0?"todos registrados ✓":pend.length+" pendiente"+(pend.length!==1?"s":"")):"Renta, internet, gym, suscripciones..."}</div></div>
      <button className="lbs" style={{fontSize:10,padding:"3px 9px"}} onClick={()=>setForm(E)}>+ Fijo</button>
    </div>
    {form&&<div style={{marginTop:10,padding:10,background:"#080808",borderRadius:9}}>
      <div className="lr"><div><label className="lfl">Nombre</label><input className="lfi" placeholder="Renta, Netflix..." value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><label className="lfl">Monto</label><input className="lfi" type="number" inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div><div style={{flex:"0 0 80px",minWidth:80}}><label className="lfl">Día</label><input className="lfi" type="number" min="1" max="31" value={form.day} onChange={e=>setForm({...form,day:e.target.value})}/></div></div>
      <div className="lr" style={{marginTop:8}}><div><label className="lfl">Categoría</label><select className="lfi" value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})}>{CATS.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select></div><div><label className="lfl">Se paga con</label><select className="lfi" value={form.src} onChange={e=>setForm({...form,src:e.target.value})}><option value="none">💵 Sin descontar</option>{savings.map(s=><option key={"s"+s.id} value={"sav:"+s.id}>🏦 {s.name}</option>)}{cards.map(c=><option key={"c"+c.id} value={"card:"+c.id}>💳 {c.name}</option>)}</select></div></div>
      <div style={{display:"flex",gap:6,marginTop:8}}><button className="lbp" onClick={save}>Guardar</button><button className="lbs" onClick={()=>setForm(null)}>Cancelar</button>{form.id&&<button className="lbd" style={{marginLeft:"auto"}} onClick={()=>{setRecurring(p=>p.filter(x=>x.id!==form.id));setForm(null)}}>🗑</button>}</div>
    </div>}
    {open&&recurring.length>0&&<div style={{display:"flex",flexDirection:"column",gap:5,marginTop:10}}>
      {[...recurring].sort((a,b)=>a.day-b.day).map(r=>{const done=isDone(r);const late=!done&&today>=r.day;const c=GC(r.cat);return(
        <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:done?"rgba(0,255,135,.04)":late?"rgba(255,183,0,.05)":"#080808",borderRadius:8,border:late?".5px solid rgba(255,183,0,.3)":"none"}}>
          <div style={{width:30,textAlign:"center"}}><div className="lmn" style={{fontSize:12,fontWeight:700,color:done?"#00FF87":late?"#FFB800":"#7ED8F6"}}>{r.day}</div><div style={{fontSize:7,color:"#444"}}>día</div></div>
          <span style={{fontSize:13}}>{c.icon}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,textDecoration:done?"line-through":"none",opacity:done?.6:1}}>{r.name}</div><div style={{fontSize:9,color:"#555"}}>{done?"✓ registrado este mes":late?"⚠️ pendiente — ya pasó el día":"próximo"}</div></div>
          <b className="lmn" style={{fontSize:11,color:"#FF4545"}}>{M(r.amount)}</b>
          {!done&&<button className="lbp" style={{padding:"4px 8px",fontSize:10,background:late?"#FFB800":"#7ED8F6"}} onClick={()=>register(r)}>Registrar</button>}
          <button className="lbs" style={{padding:"2px 6px",fontSize:10}} onClick={()=>setForm(r)}>✏️</button>
        </div>)})}
    </div>}
  </div>);
}

/* ── Otros ingresos ── */
function OtherIncomeCard({ctx}){
  const{incomes,setIncomes,savings,setSavings,rate}=ctx;
  const[form,setForm]=useState(null);
  const m=nm();const mine=incomes.filter(i=>mk(i.date)===m).sort((a,b)=>b.id-a.id);
  const applyDest=(destStr,amt,dir)=>{if(!destStr||destStr==="none")return;const id=+destStr.split(":")[1];setSavings(p=>p.map(s=>s.id===id?{...s,amount:+((s.amount+(s.currency==="USD"?amt/rate:amt)*dir)).toFixed(2)}:s))};
  const save=()=>{if(!form.amount||+form.amount<=0)return;const i={id:Date.now(),amount:+form.amount,note:form.note||"Ingreso",date:form.date||td(),dest:form.dest!=="none"?form.dest:undefined};setIncomes(p=>[...p,i]);applyDest(form.dest,i.amount,1);setForm(null)};
  return(<div className="lc" style={{borderColor:"rgba(0,255,135,.2)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{fontSize:12,fontWeight:700,color:"#00FF87"}}>➕ Otros ingresos</div><div style={{fontSize:10,color:"#555"}}>Freelance, bonos, regalos, devoluciones · este mes: <b className="lmn" style={{color:"#00FF87"}}>{M(mine.reduce((a,i)=>a+i.amount,0))}</b></div></div>
      <button className="lbp" style={{padding:"5px 10px",fontSize:11}} onClick={()=>setForm({amount:"",note:"",date:td(),dest:"none"})}>+ Ingreso</button>
    </div>
    {form&&<div style={{marginTop:10,padding:10,background:"#080808",borderRadius:9}}>
      <div className="lr"><div><label className="lfl">Monto</label><input className="lfi" type="number" inputMode="decimal" autoFocus value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div><div><label className="lfl">Concepto</label><input className="lfi" placeholder="Freelance, bono..." value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></div><div style={{flex:"0 0 120px"}}><label className="lfl">Fecha</label><input className="lfi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div></div>
      <div style={{marginTop:8}}><label className="lfl">💰 ¿A dónde entró?</label><select className="lfi" value={form.dest} onChange={e=>setForm({...form,dest:e.target.value})}><option value="none">💵 Sin registrar</option>{savings.map(s=><option key={s.id} value={"sav:"+s.id}>🏦 {s.name} · {s.currency==="USD"?U(s.amount):M2(s.amount)}</option>)}</select></div>
      <div style={{display:"flex",gap:6,marginTop:8}}><button className="lbp" onClick={save}>Guardar</button><button className="lbs" onClick={()=>setForm(null)}>Cancelar</button></div>
    </div>}
    {mine.length>0&&<div style={{display:"flex",flexDirection:"column",gap:4,marginTop:8}}>
      {mine.slice(0,5).map(i=>(
        <div key={i.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#080808",borderRadius:8}}>
          <div style={{flex:1,fontSize:11}}>{i.note}<span style={{color:"#444"}}> · {fd(i.date)}{i.dest?" · 🏦":""}</span></div>
          <b className="lmn" style={{fontSize:11,color:"#00FF87"}}>{M(i.amount)}</b>
          <button className="lbd" style={{padding:"1px 5px"}} onClick={()=>{applyDest(i.dest,i.amount,-1);setIncomes(p=>p.filter(x=>x.id!==i.id))}}><span>🗑</span></button>
        </div>
      ))}
    </div>}
  </div>);
}

function FinModule({ctx}){
  const[tab,setTab]=useState("resumen");
  const bal=ctx.mInc()-ctx.mExp();
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <QuickAdd ctx={ctx}/>
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
      {[["resumen","📊 Resumen","ti-chart"],["gastos","Gastos","ti-receipt"],["ingresos","Ingresos","ti-cash"],["portafolio","Portafolio","ti-chart-candle"],["tarjetas","Tarjetas","ti-credit-card"],["ahorros","Ahorros","ti-piggy-bank"]].map(([id,l,ic])=>(
        <button key={id} className={"pill"+(tab===id?" on":"")} onClick={()=>setTab(id)}>{l}</button>
      ))}
    </div>
    <div className="lc" style={{padding:"9px 12px",borderColor:"rgba(126,216,246,.15)"}}>
      <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
        {[["Balance",M(bal),bal>=0?"#00FF87":"#FF4545"],["Ingresos",M(ctx.mInc()),"#7ED8F6"],["Gastos",M(ctx.mExp()),"#FF4545"],["Patrimonio",M(ctx.totPort-ctx.totDebt),"#7ED8F6"]].map(([l,v,c])=>(
          <div key={l}><div style={{fontSize:9,color:"#444",textTransform:"uppercase"}}>{l}</div><div className="lmn" style={{fontSize:13,fontWeight:700,color:c,marginTop:2}}>{v}</div></div>
        ))}
      </div>
    </div>
    {tab==="resumen"    && <FinResumen ctx={ctx}/>}
    {tab==="gastos"     && <FinGastos ctx={ctx}/>}
    {tab==="ingresos"   && <FinIngresos ctx={ctx}/>}
    {tab==="portafolio" && <FinPortafolio ctx={ctx}/>}
    {tab==="tarjetas"   && <FinTarjetas ctx={ctx}/>}
    {tab==="ahorros"    && <FinAhorros ctx={ctx}/>}
    <AskIA ctx={ctx} module="fin"/>
  </div>);
}

function FinGastos({ctx}){
  const{expenses,setExpenses,savings,setSavings,cards,setCards,rate}=ctx;const[amount,setAmount]=useState("");const[note,setNote]=useState("");const[cat,setCat]=useState("food");const[date,setDate]=useState(td());const[fcat,setFcat]=useState("all");const[src,setSrc]=useState("none");const ref=useRef(null);
  const applySrc=(srcStr,amt,dir)=>{
    if(!srcStr||srcStr==="none")return;
    const[t,idS]=srcStr.split(":");const id=+idS;
    if(t==="sav")setSavings(p=>p.map(s=>s.id===id?{...s,amount:+((s.amount-(s.currency==="USD"?amt/rate:amt)*dir)).toFixed(2)}:s));
    if(t==="card")setCards(p=>p.map(c=>c.id===id?{...c,balance:+(((c.balance||0)+amt*dir)).toFixed(2)}:c));
  };
  const srcLabel=srcStr=>{if(!srcStr||srcStr==="none")return null;const[t,idS]=srcStr.split(":");const id=+idS;if(t==="sav"){const s=savings.find(x=>x.id===id);return s?"🏦 "+s.name:"🏦 (cuenta borrada)"}if(t==="card"){const c=cards.find(x=>x.id===id);return c?"💳 "+c.name:"💳 (tarjeta borrada)"}return null};
  const add=()=>{if(!amount||isNaN(+amount)||+amount<=0)return;setExpenses(p=>[...p,{id:Date.now(),amount:+amount,note:note.trim(),cat,date,src:src!=="none"?src:undefined}]);applySrc(src,+amount,1);setAmount("");setNote("");setTimeout(()=>ref.current?.focus(),50)};
  const filtered=expenses.filter(e=>mk(e.date)===nm()&&(fcat==="all"||e.cat===fcat)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||b.id-a.id);
  const total=filtered.reduce((a,e)=>a+e.amount,0);
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div className="lc" style={{borderColor:"rgba(255,69,69,.2)"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#FF4545",marginBottom:10}}>+ Agregar gasto</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(56px,1fr))",gap:5,marginBottom:10}}>
        {CATS.map(c=>(
          <button key={c.id} onClick={()=>setCat(c.id)} style={{background:cat===c.id?c.color+"25":"#080808",border:`.5px solid ${cat===c.id?c.color:"rgba(255,255,255,.06)"}`,borderRadius:9,padding:"6px 3px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <span style={{fontSize:15}}>{c.icon}</span><span style={{fontSize:8,color:cat===c.id?c.color:"#444",textAlign:"center"}}>{c.label}</span>
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:7,marginBottom:8,flexWrap:"wrap"}}>
        <div style={{flex:"0 0 80px"}}><label className="lfl">Monto</label><input ref={ref} className="lfi" type="number" inputMode="decimal" step="any" placeholder="0" value={amount} onChange={e=>setAmount(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} style={{fontWeight:700}}/></div>
        <div style={{flex:1,minWidth:120}}><label className="lfl">¿En qué?</label><input className="lfi" placeholder="Tacos, uber..." value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}/></div>
        <div style={{flex:"0 0 110px"}}><label className="lfl">Fecha</label><input className="lfi" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div style={{flex:"1 1 100%"}}><label className="lfl">💸 ¿De dónde salió el dinero?</label><select className="lfi" value={src} onChange={e=>setSrc(e.target.value)}>
          <option value="none">💵 Sin descontar (efectivo / otro)</option>
          {savings.map(s=><option key={"s"+s.id} value={"sav:"+s.id}>🏦 {s.name} · {s.currency==="USD"?U(s.amount):M2(s.amount)}</option>)}
          {cards.map(c=><option key={"c"+c.id} value={"card:"+c.id}>💳 {c.name} · deuda {M(c.balance||0)}</option>)}
        </select></div>
      </div>
      <button className="lbp" onClick={add} style={{width:"100%",justifyContent:"center",padding:11,fontSize:14}}>+ Agregar</button>
    </div>
    <BudgetCard ctx={ctx}/>
    <RecurringCard ctx={ctx}/>
    <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
      <select className="lfi" value={fcat} onChange={e=>setFcat(e.target.value)} style={{width:"auto",fontSize:11,padding:"5px 8px"}}><option value="all">Todas</option>{CATS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
      <div className="lmn" style={{fontSize:12,color:"#FF4545",fontWeight:700}}>{M2(total)}</div>
    </div>
    {filtered.slice(0,25).map(e=>{const c=GC(e.cat);return(
      <div key={e.id} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:"#0f0f0f",borderRadius:11,border:".5px solid rgba(255,255,255,.05)"}}>
        <div style={{width:28,height:28,borderRadius:7,background:c.color+"20",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:13}}>{c.icon}</span></div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.note||c.label}</div><div style={{fontSize:10,color:"#444"}}>{fd(e.date)}{e.src&&srcLabel(e.src)?<span> · {srcLabel(e.src)}</span>:null}</div></div>
        <div className="lmn" style={{fontSize:12,fontWeight:700,color:"#FF4545",flexShrink:0}}>{M2(e.amount)}</div>
        <button className="lbd" style={{padding:"2px 5px"}} onClick={()=>{applySrc(e.src,e.amount,-1);setExpenses(p=>p.filter(x=>x.id!==e.id))}}><span>🗑</span></button>
      </div>
    )})}
  </div>);
}

function FinIngresos({ctx}){
  const{salary,setSalary,products,setProducts,saleTx,setSaleTx,salMXN,savings,setSavings,rate}=ctx;
  const[showSal,setShowSal]=useState(!ctx.salary.amount);const[pf,setPf]=useState(null);const[sf,setSf]=useState(null);
  const saveProd=()=>{if(!pf?.name||!pf?.salePrice)return;const p={...pf,cost:+pf.cost,salePrice:+pf.salePrice,id:pf.id||Date.now()};setProducts(prev=>pf.id?prev.map(x=>x.id===p.id?p:x):[...prev,p]);setPf(null)};
  const applyDest=(destStr,amt,dir)=>{if(!destStr||destStr==="none")return;const id=+destStr.split(":")[1];setSavings(p=>p.map(s=>s.id===id?{...s,amount:+((s.amount+(s.currency==="USD"?amt/rate:amt)*dir)).toFixed(2)}:s))};
  const logSale=()=>{const prod=products.find(p=>p.id===+sf.productId);if(!prod||!sf.qty)return;const qty=+sf.qty,total=qty*prod.salePrice,profit=qty*(prod.salePrice-prod.cost);setSaleTx(prev=>[...prev,{id:Date.now(),productId:prod.id,productName:prod.name,qty,total,profit,date:sf.date||td(),note:sf.note||"",dest:sf.dest&&sf.dest!=="none"?sf.dest:undefined}]);applyDest(sf.dest,total,1);setSf(null)};
  const mSales=saleTx.filter(s=>mk(s.date)===nm());
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <OtherIncomeCard ctx={ctx}/>
    <div className="lc"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showSal?10:0}}><div style={{fontSize:13,fontWeight:700}}>💼 Salario</div><button className="lbs" style={{fontSize:11,padding:"3px 9px"}} onClick={()=>setShowSal(v=>!v)}>{showSal?"Cerrar":"Editar"}</button></div>
      {!showSal&&salary.amount&&<div style={{display:"flex",gap:14,marginTop:6,flexWrap:"wrap"}}>
        <div><div style={{fontSize:9,color:"#444"}}>{salary.label}</div><div className="lmn" style={{fontSize:15,fontWeight:700,color:"#7ED8F6"}}>{salary.currency==="MXN"?M(+salary.amount):U(+salary.amount)}</div></div>
        <div><div style={{fontSize:9,color:"#444"}}>Mensual MXN</div><div className="lmn" style={{fontSize:15,fontWeight:700,color:"#00FF87"}}>{M(salMXN())}</div></div>
      </div>}
      {showSal&&<div><div className="lr"><div><label className="lfl">Nombre</label><input className="lfi" value={salary.label} onChange={e=>setSalary({...salary,label:e.target.value})} placeholder="Mi trabajo"/></div><div><label className="lfl">Monto</label><input className="lfi" type="number" inputMode="decimal" value={salary.amount} onChange={e=>setSalary({...salary,amount:e.target.value})}/></div></div>
        <div className="lr" style={{marginTop:8}}><div><label className="lfl">Moneda</label><select className="lfi" value={salary.currency} onChange={e=>setSalary({...salary,currency:e.target.value})}><option value="MXN">MXN</option><option value="USD">USD</option></select></div><div><label className="lfl">Frecuencia</label><select className="lfi" value={salary.freq} onChange={e=>setSalary({...salary,freq:e.target.value})}><option value="monthly">Mensual</option><option value="biweekly">Quincenal</option><option value="weekly">Semanal</option></select></div></div>
        <button className="lbp" style={{marginTop:10,width:"100%",justifyContent:"center"}} onClick={()=>setShowSal(false)}>Guardar</button></div>}
    </div>
    <div className="lc"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:13,fontWeight:700}}>👕 Productos</div><button className="lbp" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>setPf({name:"",type:"playera",cost:"",salePrice:"",currency:"MXN"})}><span>+</span> Agregar</button></div>
      {pf&&<div style={{padding:10,background:"#080808",borderRadius:9,marginBottom:10}}>
        <div className="lr"><div><label className="lfl">Nombre</label><input className="lfi" placeholder="Playera" value={pf.name} onChange={e=>setPf({...pf,name:e.target.value})}/></div><div><label className="lfl">Tipo</label><select className="lfi" value={pf.type} onChange={e=>setPf({...pf,type:e.target.value})}><option>playera</option><option>tenis</option><option>pants</option><option>hoodie</option><option>otro</option></select></div></div>
        <div className="lr" style={{marginTop:8}}><div><label className="lfl">Costo</label><input className="lfi" type="number" inputMode="decimal" placeholder="150" value={pf.cost} onChange={e=>setPf({...pf,cost:e.target.value})}/></div><div><label className="lfl">Precio venta</label><input className="lfi" type="number" inputMode="decimal" placeholder="300" value={pf.salePrice} onChange={e=>setPf({...pf,salePrice:e.target.value})}/></div></div>
        {pf.cost&&pf.salePrice&&<div style={{fontSize:11,color:"#00FF87",marginTop:6}}>Ganancia: {M(+pf.salePrice-+pf.cost)} ({(((+pf.salePrice-+pf.cost)/+pf.salePrice)*100).toFixed(0)}%)</div>}
        <div style={{display:"flex",gap:6,marginTop:8}}><button className="lbp" onClick={saveProd}>Guardar</button><button className="lbs" onClick={()=>setPf(null)}>Cancelar</button>{pf.id&&<button className="lbd" style={{marginLeft:"auto"}} onClick={()=>{setProducts(p=>p.filter(x=>x.id!==pf.id));setPf(null)}}><span>🗑</span></button>}</div>
      </div>}
      {products.length>0&&<><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:7,marginBottom:10}}>
        {products.map(p=><div key={p.id} style={{background:"#080808",borderRadius:9,padding:"10px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:16}}>{p.type==="tenis"?"👟":"👕"}</span><button className="lbs" style={{padding:"1px 5px",fontSize:10}} onClick={()=>setPf(p)}><span>✏️</span></button></div><div style={{fontSize:12,fontWeight:600}}>{p.name}</div><div style={{fontSize:10,color:"#00FF87",marginTop:3}}>+{M(p.salePrice-p.cost)} margen</div></div>)}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><div style={{fontSize:11,fontWeight:700,color:"#FFB800"}}>Registrar venta</div><button className="lbp" style={{fontSize:11,padding:"4px 9px",background:"#FFB800"}} onClick={()=>setSf({productId:"",qty:"",date:td(),note:"",dest:"none"})}><span>+</span> Venta</button></div>
      {sf&&<div style={{padding:10,background:"#080808",borderRadius:9,marginBottom:8}}>
        <div className="lr"><div><label className="lfl">Producto</label><select className="lfi" value={sf.productId} onChange={e=>setSf({...sf,productId:e.target.value})}><option value="">Seleccionar...</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {M(p.salePrice)}</option>)}</select></div><div><label className="lfl">Cantidad</label><input className="lfi" type="number" inputMode="numeric" min="1" value={sf.qty} onChange={e=>setSf({...sf,qty:e.target.value})}/></div></div>
        {sf.productId&&sf.qty&&(()=>{const p=products.find(x=>x.id===+sf.productId);if(!p)return null;return<div style={{fontSize:11,color:"#00FF87",marginTop:6}}>Total: {M(+sf.qty*p.salePrice)} · Ganancia: {M(+sf.qty*(p.salePrice-p.cost))}</div>})()}
        <div style={{marginTop:8}}><label className="lfl">💰 ¿A dónde entró el dinero?</label><select className="lfi" value={sf.dest||"none"} onChange={e=>setSf({...sf,dest:e.target.value})}>
          <option value="none">💵 Sin registrar (efectivo / otro)</option>
          {savings.map(s=><option key={s.id} value={"sav:"+s.id}>🏦 {s.name} · {s.currency==="USD"?U(s.amount):M2(s.amount)}</option>)}
        </select></div>
        <div style={{display:"flex",gap:6,marginTop:8}}><button className="lbp" onClick={logSale}>Registrar</button><button className="lbs" onClick={()=>setSf(null)}>Cancelar</button></div>
      </div>}
      <div style={{fontSize:11,color:"#444"}}>Este mes: <b style={{color:"#FFB800"}}>{M(mSales.reduce((a,s)=>a+s.total,0))}</b> · Ganancia: <b style={{color:"#00FF87"}}>{M(mSales.reduce((a,s)=>a+s.profit,0))}</b></div>
      {mSales.length>0&&<div style={{display:"flex",flexDirection:"column",gap:5,marginTop:8}}>
        {[...mSales].sort((a,b)=>b.id-a.id).slice(0,6).map(s=>(
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#080808",borderRadius:8}}>
            <div style={{flex:1,minWidth:0,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.qty}× {s.productName}<span style={{color:"#444"}}> · {fd(s.date)}{s.dest?" · 🏦":""}</span></div>
            <div className="lmn" style={{fontSize:11,color:"#FFB800",fontWeight:700,flexShrink:0}}>{M(s.total)}</div>
            <button className="lbd" style={{padding:"1px 5px",flexShrink:0}} onClick={()=>{applyDest(s.dest,s.total,-1);setSaleTx(p=>p.filter(x=>x.id!==s.id))}}><span>🗑</span></button>
          </div>
        ))}
      </div>}</>}
      {products.length===0&&!pf&&<Mpty msg="Sin productos" sub="Agrega tus productos para registrar ventas"/>}
    </div>
  </div>);
}

function FinPortafolio({ctx}){
  const{stocks,setStocks,crypto,setCrypto,fixed,setFixed,trading,setTrading,rate,cPx,cy,sV,cV,CRYPTOS,totPort,totDebt}=ctx;
  const[sec,setSec]=useState("acciones");const[epx,setEpx]=useState(null);const[form,setForm]=useState(null);
  const E={ticker:"",name:"",shares:"",buyPrice:"",currentPrice:"",currency:"USD"};
  const saveStk=()=>{const s={...form,shares:+form.shares,buyPrice:+form.buyPrice,currentPrice:+(form.currentPrice||form.buyPrice),id:form.id||Date.now()};if(!s.ticker||!s.shares||!s.buyPrice)return;setStocks(p=>form.id?p.map(x=>x.id===s.id?s:x):[...p,s]);setForm(null)};
  const savePx=id=>{if(!epx?.val)return;setStocks(p=>p.map(x=>x.id===id?{...x,currentPrice:+epx.val}:x));setEpx(null)};
  const[cform,setCform]=useState(null);
  const saveCry=()=>{const c={...cform,amount:+cform.amount,buyPrice:+cform.buyPrice,eid:cform.eid||Date.now()};if(!c.amount||!c.buyPrice)return;setCrypto(p=>cform.eid&&p.find(x=>x.eid===c.eid)?p.map(x=>x.eid===c.eid?c:x):[...p,c]);setCform(null)};
  const[fform,setFform]=useState(null);
  const saveFix=()=>{const f={...fform,principal:+fform.principal,rate:+fform.rate,id:fform.id||Date.now()};if(!f.name||!f.principal||!f.rate)return;setFixed(p=>fform.id?p.map(x=>x.id===f.id?f:x):[...p,f]);setFform(null)};
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:700}}>Portafolio</div><div className="lmn" style={{fontSize:11,color:"#7ED8F6"}}>{M2(totPort)}</div></div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{[["acciones","📈"],["cripto","₿"],["renta","🏦"],["trading","⚡"]].map(([id,l])=><button key={id} className={"pill"+(sec===id?" on":"")} style={{fontSize:11,padding:"5px 11px"}} onClick={()=>{setSec(id);setForm(null);setCform(null);setFform(null)}}>{l} {id}</button>)}</div>
    </div>
    <NetWorthCard ctx={ctx}/>
    {sec==="acciones"&&<div><button className="lbp" style={{fontSize:11,marginBottom:8}} onClick={()=>setForm(E)}><span>+</span> Acción</button>
      {form&&<div className="lc" style={{borderColor:"rgba(126,216,246,.3)",marginBottom:8}}>
        <div className="lr"><div><label className="lfl">Ticker</label><input className="lfi" placeholder="AAPL" value={form.ticker} onChange={e=>setForm({...form,ticker:e.target.value.toUpperCase()})}/></div><div><label className="lfl">Nombre</label><input className="lfi" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><label className="lfl">Acciones</label><input className="lfi" type="number" value={form.shares} onChange={e=>setForm({...form,shares:e.target.value})}/></div></div>
        <div className="lr" style={{marginTop:8}}><div><label className="lfl">P.compra</label><input className="lfi" type="number" inputMode="decimal" value={form.buyPrice} onChange={e=>setForm({...form,buyPrice:e.target.value})}/></div><div><label className="lfl">P.actual</label><input className="lfi" type="number" inputMode="decimal" value={form.currentPrice} onChange={e=>setForm({...form,currentPrice:e.target.value})}/></div><div><label className="lfl">Moneda</label><select className="lfi" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option value="USD">USD</option><option value="MXN">MXN</option></select></div></div>
        <div style={{display:"flex",gap:6,marginTop:8}}><button className="lbp" onClick={saveStk}>Guardar</button><button className="lbs" onClick={()=>setForm(null)}>Cancelar</button>{form.id&&<button className="lbd" onClick={()=>{setStocks(p=>p.filter(x=>x.id!==form.id));setForm(null)}}><span>🗑</span></button>}</div>
      </div>}
      {stocks.length===0&&!form?<Mpty msg="Sin acciones" sub="Agrega tus posiciones en bolsa"/>:
      <table className="ltbl"><thead><tr><th>Ticker</th><th>P.Compra</th><th>P.Actual</th><th style={{textAlign:"right"}}>Valor</th><th>P&L</th><th></th></tr></thead><tbody>
        {stocks.map(s=>{const val=sV(s),cost=s.shares*s.buyPrice*(s.currency==="USD"?rate:1),pnl=val-cost,pp=cost>0?(pnl/cost)*100:0,isE=epx?.id===s.id;return(
          <tr key={s.id}><td><b>{s.ticker}</b><br/><span style={{fontSize:9,color:"#444"}}>{s.name}</span></td>
          <td className="lmn" style={{fontSize:11}}>{s.currency==="USD"?U(s.buyPrice):M(s.buyPrice)}</td>
          <td>{isE?<div style={{display:"flex",gap:3}}><input className="lfi" type="number" inputMode="decimal" value={epx.val} onChange={e=>setEpx({...epx,val:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")savePx(s.id);if(e.key==="Escape")setEpx(null)}} style={{width:65,padding:"3px 6px",fontSize:11}} autoFocus/><button className="lbp" style={{padding:"3px 6px",fontSize:11}} onClick={()=>savePx(s.id)}>✓</button></div>:
          <div className="lmn" style={{fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:3}} onClick={()=>setEpx({id:s.id,val:s.currentPrice||s.buyPrice})}>{s.currency==="USD"?U(s.currentPrice||s.buyPrice):M(s.currentPrice||s.buyPrice)}<span style={{fontSize:9,color:"#444"}}>✏️</span></div>}</td>
          <td className="lmn" style={{color:"#7ED8F6",fontWeight:700,textAlign:"right",fontSize:11}}>{M(val)}</td>
          <td><span className={pnl>=0?"ltg ltgg":"ltg ltgr"}>{pc(pp)}</span></td>
          <td><button className="lbd" style={{padding:"2px 5px"}} onClick={()=>setStocks(p=>p.filter(x=>x.id!==s.id))}><span>🗑</span></button></td></tr>
        )})}
      </tbody></table>}
    </div>}
    {sec==="cripto"&&<div><button className="lbp" style={{fontSize:11,marginBottom:8}} onClick={()=>setCform({id:"bitcoin",symbol:"BTC",name:"Bitcoin",amount:"",buyPrice:""})}><span>+</span> Cripto</button>
      {cform&&<div className="lc" style={{borderColor:"rgba(126,216,246,.3)",marginBottom:8}}>
        <div className="lr"><div><label className="lfl">Moneda</label><select className="lfi" value={cform.id} onChange={e=>{const cr=CRYPTOS.find(c=>c.id===e.target.value);setCform({...cform,id:cr.id,symbol:cr.symbol,name:cr.name})}}>{CRYPTOS.map(c=><option key={c.id} value={c.id}>{c.symbol} — {c.name}</option>)}</select></div><div><label className="lfl">Cantidad</label><input className="lfi" type="number" inputMode="decimal" step="any" value={cform.amount} onChange={e=>setCform({...cform,amount:e.target.value})}/></div><div><label className="lfl">P.compra USD</label><input className="lfi" type="number" inputMode="decimal" value={cform.buyPrice} onChange={e=>setCform({...cform,buyPrice:e.target.value})}/></div></div>
        {cPx[cform.id]?.usd&&<div style={{fontSize:11,color:"#7ED8F6",marginTop:6}}>Actual: {U(cPx[cform.id].usd)} <span className={cPx[cform.id].usd_24h_change>=0?"ltg ltgg":"ltg ltgr"}>{pc(cPx[cform.id].usd_24h_change)} 24h</span></div>}
        <div style={{display:"flex",gap:6,marginTop:8}}><button className="lbp" onClick={saveCry}>Guardar</button><button className="lbs" onClick={()=>setCform(null)}>Cancelar</button></div>
      </div>}
      {crypto.length===0&&!cform?<Mpty msg="Sin cripto" sub="Agrega tus criptomonedas"/>:
      <table className="ltbl"><thead><tr><th>Cripto</th><th>Cant.</th><th>Precio</th><th style={{textAlign:"right"}}>Valor MXN</th><th>P&L</th><th></th></tr></thead><tbody>
        {crypto.map(c=>{const cur=cPx[c.id]?.usd||c.buyPrice,ch=cPx[c.id]?.usd_24h_change||0,val=cV(c),cost=c.amount*c.buyPrice*rate,pnl=val-cost,pp=cost>0?(pnl/cost)*100:0;return(
          <tr key={c.eid}><td><b>{c.symbol}</b><br/><span style={{fontSize:9,color:"#444"}}>{c.name}</span></td>
          <td className="lmn" style={{fontSize:11}}>{c.amount}</td>
          <td><div className="lmn" style={{fontSize:11}}>{U(cur)}</div><span className={ch>=0?"ltg ltgg":"ltg ltgr"}>{pc(ch)}</span></td>
          <td className="lmn" style={{color:"#7ED8F6",fontWeight:700,textAlign:"right",fontSize:11}}>{M(val)}</td>
          <td><span className={pnl>=0?"ltg ltgg":"ltg ltgr"}>{pc(pp)}</span></td>
          <td><button className="lbd" style={{padding:"2px 5px"}} onClick={()=>setCrypto(p=>p.filter(x=>x.eid!==c.eid))}><span>🗑</span></button></td></tr>
        )})}
      </tbody></table>}
    </div>}
    {sec==="renta"&&<div><button className="lbp" style={{fontSize:11,marginBottom:8}} onClick={()=>setFform({type:"SOFIPO",name:"",principal:"",rate:"",startDate:""})}><span>+</span> Agregar</button>
      {fform&&<div className="lc" style={{borderColor:"rgba(126,216,246,.3)",marginBottom:8}}>
        <div className="lr"><div><label className="lfl">Tipo</label><select className="lfi" value={fform.type} onChange={e=>setFform({...fform,type:e.target.value})}><option>SOFIPO</option><option>CETES</option><option>GBM+</option><option>Nu Cuenta</option><option>Hey Banco</option><option>Otra</option></select></div><div><label className="lfl">Nombre</label><input className="lfi" value={fform.name} onChange={e=>setFform({...fform,name:e.target.value})}/></div></div>
        <div className="lr" style={{marginTop:8}}><div><label className="lfl">Capital MXN</label><input className="lfi" type="number" inputMode="decimal" value={fform.principal} onChange={e=>setFform({...fform,principal:e.target.value})}/></div><div><label className="lfl">Tasa %</label><input className="lfi" type="number" inputMode="decimal" step=".01" value={fform.rate} onChange={e=>setFform({...fform,rate:e.target.value})}/></div><div><label className="lfl">Inicio</label><input className="lfi" type="date" value={fform.startDate} onChange={e=>setFform({...fform,startDate:e.target.value})}/></div></div>
        {fform.principal&&fform.rate&&<div style={{fontSize:11,color:"#00FF87",marginTop:6}}>Rend. diario: +{M2(+fform.principal*(+fform.rate/100)/365)}</div>}
        <div style={{display:"flex",gap:6,marginTop:8}}><button className="lbp" onClick={saveFix}>Guardar</button><button className="lbs" onClick={()=>setFform(null)}>Cancelar</button></div>
      </div>}
      {fixed.length===0&&!fform?<Mpty msg="Sin renta fija" sub="CETES, SOFIPOs, Nu..."/>:
      <table className="ltbl"><thead><tr><th>Instrumento</th><th>Capital</th><th>Tasa</th><th style={{textAlign:"right"}}>Intereses</th><th style={{textAlign:"right"}}>Total</th><th></th></tr></thead><tbody>
        {fixed.map(f=>{const yld=cy(f),days=f.startDate?Math.floor((Date.now()-new Date(f.startDate))/86400000):0;return(
          <tr key={f.id}><td><span className="ltg ltgb" style={{fontSize:9}}>{f.type}</span><br/><b style={{fontSize:11}}>{f.name}</b></td>
          <td className="lmn" style={{fontSize:11}}>{M2(f.principal)}</td>
          <td><span className="ltg ltgg" style={{fontSize:9}}>{f.rate}% · {days}d</span></td>
          <td className="lmn" style={{color:"#00FF87",fontWeight:700,textAlign:"right",fontSize:11}}>+{M2(yld)}</td>
          <td className="lmn" style={{color:"#7ED8F6",fontWeight:700,textAlign:"right",fontSize:11}}>{M2(f.principal+yld)}</td>
          <td><button className="lbd" style={{padding:"2px 5px"}} onClick={()=>setFixed(p=>p.filter(x=>x.id!==f.id))}><span>🗑</span></button></td></tr>
        )})}
      </tbody></table>}
    </div>}
    {sec==="trading"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{padding:"9px 12px",background:"rgba(251,191,36,.06)",border:".5px solid rgba(251,191,36,.3)",borderRadius:9,fontSize:11,color:"#FFB800",lineHeight:1.5}}>⚡ El trading <b>no se suma al patrimonio</b> por su volatilidad.</div>
      <div className="lc"><div style={{fontSize:13,fontWeight:700,color:"#FFB800",marginBottom:10}}>⚡ Trading</div>
        <div className="lr"><div><label className="lfl">Balance</label><input className="lfi" type="number" inputMode="decimal" step="any" value={trading.balance} onChange={e=>setTrading({...trading,balance:+e.target.value})}/></div><div><label className="lfl">Moneda</label><select className="lfi" value={trading.currency} onChange={e=>setTrading({...trading,currency:e.target.value})}><option value="USD">USD</option><option value="MXN">MXN</option></select></div></div>
        <div style={{marginTop:10,padding:10,background:"#080808",borderRadius:9}}><div style={{fontSize:10,color:"#444"}}>Equiv. MXN</div><div className="lmn" style={{fontSize:20,fontWeight:700,color:"#FFB800"}}>{M(trading.currency==="USD"?trading.balance*rate:trading.balance)}</div></div>
      </div>
    </div>}
  </div>);
}

function FinTarjetas({ctx}){
  const{cards,setCards,setExpenses,payLog,setPayLog}=ctx;const[form,setForm]=useState(null);const[paying,setPaying]=useState(null);const[payAmt,setPayAmt]=useState("");const[payType,setPayType]=useState("saldo_mes");const[payDate,setPayDate]=useState(td());const[expId,setExpId]=useState(null);
  const E={kind:"tc",name:"",bank:"",limit:"",balance:"",statementBalance:"",cutDay:"",payDay:"",payDays:"20",minPayment:"",apr:""};const[adv,setAdv]=useState(false);
  const BANKS=["BBVA","Santander","Citibanamex","Banorte","HSBC","American Express","Scotiabank","Nu","Liverpool","Coppel","Otra"];
  const save=()=>{const c={...form,kind:form.kind||"tc",limit:+form.limit||0,balance:+form.balance||0,cutDay:+form.cutDay||0,payDay:+form.payDay||0,payDays:+form.payDays||20,minPayment:+form.minPayment||0,statementBalance:+form.statementBalance||0,apr:+form.apr||0,id:form.id||Date.now()};if(!c.name)return;if(c.kind==="tc"&&!c.cutDay)return;setCards(p=>form.id?p.map(x=>x.id===c.id?c:x):[...p,c]);setForm(null);setAdv(false)};
  const doPay=card=>{const amt=payType==="total"?card.balance:payType==="minimo"?(card.minPayment||0):payType==="saldo_mes"?(card.statementBalance||0):+payAmt;if(!amt||amt<=0)return;const applied=Math.min(amt,card.balance);setCards(p=>p.map(x=>x.id===card.id?{...x,balance:Math.max(0,x.balance-applied)}:x));setPayLog(p=>[{id:Date.now(),cardId:card.id,cardName:card.name,amount:applied,type:payType,date:payDate},...p]);setExpenses(p=>[...p,{id:Date.now()+1,amount:applied,note:"Pago tarjeta "+card.name,cat:"services",date:payDate}]);setPayAmt("");setPaying(null)};
  const cdD=card=>{if(card.kind==="prestamo"){const d=cardDates(card);return{dCut:d.dCut,dPay:d.dPay,pay:d.pay,bestDay:null,worstDay:null,maxFree:null}}const t=new Date(),cd=card.cutDay||1,pd=card.payDays||20;let cut=new Date(t.getFullYear(),t.getMonth(),cd);if(cut<=t)cut=new Date(t.getFullYear(),t.getMonth()+1,cd);const pay=new Date(cut);pay.setDate(pay.getDate()+pd);return{dCut:Math.ceil((cut-t)/86400000),dPay:Math.ceil((pay-t)/86400000),pay,bestDay:cd+1>28?1:cd+1,worstDay:cd-1<1?28:cd-1,maxFree:pd+29}};
  const totDebt=cards.reduce((a,c)=>a+(c.balance||0),0);
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:700}}>💳 Tarjetas y deudas</div><div className="lmn" style={{fontSize:12,color:"#FF4545"}}>Deuda: {M2(totDebt)}</div></div><button className="lbp" onClick={()=>setForm(E)}><span>+</span> Agregar</button></div>
    {form&&<div className="lc" style={{borderColor:"rgba(126,216,246,.3)"}}>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["tc","💳 Tarjeta de crédito"],["prestamo","📄 Préstamo / Deuda"]].map(([k,l])=>(
          <button key={k} onClick={()=>setForm({...form,kind:k})} style={{flex:1,padding:"8px",border:"1px solid "+(form.kind===k?"#7ED8F6":"rgba(255,255,255,.08)"),borderRadius:9,background:form.kind===k?"rgba(126,216,246,.12)":"#080808",color:form.kind===k?"#7ED8F6":"#666",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>
      <div className="lr">
        <div><label className="lfl">Nombre</label><input className="lfi" placeholder={form.kind==="tc"?"BBVA Azul":"Préstamo coche, deuda con..."} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
        <div><label className="lfl">{form.kind==="tc"?"Deuda actual $":"Lo que debo $"}</label><input className="lfi" type="number" inputMode="decimal" placeholder="0" value={form.balance} onChange={e=>setForm({...form,balance:e.target.value})}/></div>
      </div>
      <div className="lr" style={{marginTop:8}}>
        {form.kind==="tc"?<>
          <div><label className="lfl">Día de corte *</label><input className="lfi" type="number" inputMode="numeric" min="1" max="31" placeholder="ej. 15" value={form.cutDay} onChange={e=>setForm({...form,cutDay:e.target.value})}/></div>
          <div><label className="lfl">Límite $ (opcional)</label><input className="lfi" type="number" inputMode="decimal" value={form.limit} onChange={e=>setForm({...form,limit:e.target.value})}/></div>
        </>:<>
          <div><label className="lfl">Día de pago mensual</label><input className="lfi" type="number" inputMode="numeric" min="1" max="28" placeholder="ej. 5" value={form.payDay} onChange={e=>setForm({...form,payDay:e.target.value})}/></div>
          <div><label className="lfl">Mensualidad $</label><input className="lfi" type="number" inputMode="decimal" value={form.minPayment} onChange={e=>setForm({...form,minPayment:e.target.value})}/></div>
        </>}
      </div>
      <button onClick={()=>setAdv(v=>!v)} style={{marginTop:8,background:"none",border:"none",color:"#7ED8F6",fontSize:10,cursor:"pointer",fontFamily:"inherit",padding:0}}>{adv?"▴ Menos opciones":"▾ Más opciones (banco, saldo del mes, tasa...)"}</button>
      {adv&&<div className="lr" style={{marginTop:8}}>
        <div><label className="lfl">Banco</label><select className="lfi" value={form.bank||""} onChange={e=>setForm({...form,bank:e.target.value})}><option value="">Banco...</option>{BANKS.map(b=><option key={b}>{b}</option>)}</select></div>
        {form.kind==="tc"&&<div><label className="lfl">Saldo del mes</label><input className="lfi" type="number" inputMode="decimal" value={form.statementBalance} onChange={e=>setForm({...form,statementBalance:e.target.value})}/></div>}
        {form.kind==="tc"&&<div><label className="lfl">Pago mínimo</label><input className="lfi" type="number" inputMode="decimal" value={form.minPayment} onChange={e=>setForm({...form,minPayment:e.target.value})}/></div>}
        {form.kind==="tc"&&<div><label className="lfl">Días para pagar</label><input className="lfi" type="number" inputMode="numeric" value={form.payDays} onChange={e=>setForm({...form,payDays:e.target.value})}/></div>}
        {form.kind==="prestamo"&&<div><label className="lfl">Monto original $</label><input className="lfi" type="number" inputMode="decimal" value={form.limit} onChange={e=>setForm({...form,limit:e.target.value})}/></div>}
        <div><label className="lfl">Tasa anual %</label><input className="lfi" type="number" inputMode="decimal" placeholder="ej. 45" value={form.apr||""} onChange={e=>setForm({...form,apr:e.target.value})}/></div>
      </div>}
      <div style={{display:"flex",gap:6,marginTop:10}}><button className="lbp" onClick={save}>Guardar</button><button className="lbs" onClick={()=>{setForm(null);setAdv(false)}}>Cancelar</button>{form.id&&<button className="lbd" style={{marginLeft:"auto"}} onClick={()=>{setCards(p=>p.filter(x=>x.id!==form.id));setForm(null)}}><span>🗑</span></button>}</div>
    </div>}
    {cards.length===0&&!form?<Mpty msg="Sin tarjetas ni deudas" sub="Agrega tarjetas de crédito o préstamos"/>:
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      {cards.map(card=>{const{dCut,dPay,pay,bestDay,worstDay,maxFree}=cdD(card);const use=Math.round(((card.balance||0)/(card.limit||1))*100);const uc=use>70?"#FF4545":use>40?"#FFB800":"#00FF87";const isP=paying===card.id;return(
        <div key={card.id} className="lc">
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><div><div style={{fontWeight:700,fontSize:13}}>{card.name}</div><div style={{fontSize:10,color:"#444"}}>{card.bank}</div></div><div style={{display:"flex",gap:3}}><button className="lbs" style={{padding:"3px 6px",fontSize:11}} onClick={()=>setForm(card)}><span>✏️</span></button><button className="lbd" onClick={()=>setCards(p=>p.filter(x=>x.id!==card.id))}><span>🗑</span></button></div></div>
          <div style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}><span style={{color:"#444"}}>Uso del límite</span><span className="lmn" style={{color:uc}}>{use}%</span></div><div style={{height:4,background:"#161616",borderRadius:99}}><div style={{height:"100%",width:`${Math.min(use,100)}%`,background:uc,borderRadius:99}}/></div></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:11,marginBottom:8}}>
            {[["Saldo total",M2(card.balance),"#FF4545"],["Límite",M2(card.limit),null],["Corte en",dCut+"d",dCut<=5?"#FF4545":"#FFB800"],["Pago en",dPay+"d",dPay<=10?"#FF4545":"#00FF87"]].map(([l,v,c])=>(
              <div key={l} style={{background:"#080808",borderRadius:8,padding:"7px 8px"}}><div style={{color:"#444",fontSize:9}}>{l}</div><div className="lmn" style={{fontWeight:700,color:c||"#f0f0f0"}}>{v}</div></div>
            ))}
          </div>
          {(()=>{const cd=cardDates(card);const uc=cd.util>=50?"#FF4545":cd.util>=30?"#FFB800":"#00FF87";const paid=ctx.payLog.some(p=>p.cardId===card.id&&new Date(p.date+"T12:00:00")>=cd.lastCut);return(<div style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3}}><span style={{color:"#666"}}>Utilización</span><b className="lmn" style={{color:uc}}>{cd.util}% de {M(card.limit)}</b></div>
            <div style={{height:5,background:"#161616",borderRadius:99,overflow:"hidden",marginBottom:8}}><div style={{height:"100%",width:Math.min(100,cd.util)+"%",background:uc,borderRadius:99}}/><div style={{position:"relative",top:-5,left:"30%",width:1,height:5,background:"rgba(255,255,255,.4)"}}/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
              <div style={{background:"#080808",borderRadius:8,padding:"6px 8px"}}><div style={{fontSize:8,color:"#444"}}>✂️ Próx. corte</div><div className="lmn" style={{fontSize:11,fontWeight:700,color:"#7ED8F6"}}>{cd.cut.getDate()} {["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][cd.cut.getMonth()]}</div><div style={{fontSize:8,color:"#555"}}>en {cd.dCut}d</div></div>
              <div style={{background:card.balance>0&&!paid?(cd.dPay<=3?"rgba(255,69,69,.1)":"rgba(255,183,0,.06)"):"#080808",borderRadius:8,padding:"6px 8px",border:card.balance>0&&!paid&&cd.dPay<=3?".5px solid rgba(255,69,69,.4)":"none"}}><div style={{fontSize:8,color:"#444"}}>📅 Límite pago</div><div className="lmn" style={{fontSize:11,fontWeight:700,color:paid?"#00FF87":cd.dPay<=3?"#FF4545":"#FFB800"}}>{cd.pay.getDate()} {["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][cd.pay.getMonth()]}</div><div style={{fontSize:8,color:paid?"#00FF87":"#555"}}>{paid?"✓ pagada":cd.dPay<0?"vencida":"en "+cd.dPay+"d"}</div></div>
              <div style={{background:"#080808",borderRadius:8,padding:"6px 8px"}}><div style={{fontSize:8,color:"#444"}}>📉 Interés/mes</div><div className="lmn" style={{fontSize:11,fontWeight:700,color:cd.interest>0?"#FF4545":"#00FF87"}}>{card.apr>0?M(cd.interest):"—"}</div><div style={{fontSize:8,color:"#555"}}>{card.apr>0?"si pagas mínimo":"pon tu tasa"}</div></div>
            </div>
          </div>)})()}
          {card.statementBalance>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <div style={{background:"rgba(251,191,36,.06)",border:".5px solid rgba(251,191,36,.3)",borderRadius:8,padding:"8px"}}><div style={{color:"#FFB800",fontSize:9}}>Saldo del mes</div><div className="lmn" style={{fontWeight:700,color:"#FFB800",fontSize:14}}>{M2(card.statementBalance)}</div></div>
            <div style={{background:"#080808",borderRadius:8,padding:"8px"}}><div style={{color:"#444",fontSize:9}}>Pago mínimo</div><div className="lmn" style={{fontWeight:700,color:"#FF4545"}}>{card.minPayment>0?M2(card.minPayment):"—"}</div></div>
          </div>}
          {card.balance>0&&!isP&&<button className="lbp" style={{width:"100%",justifyContent:"center",marginBottom:6,background:"#34d399",color:"#000"}} onClick={()=>{setPaying(card.id);setPayAmt("");setPayType("saldo_mes");setPayDate(td())}}>💳 Registrar pago</button>}
          {card.balance===0&&<div style={{textAlign:"center",fontSize:12,color:"#00FF87",fontWeight:700,marginBottom:6}}>✓ ¡Al corriente!</div>}
          {isP&&<div style={{background:"#080808",borderRadius:9,padding:10,marginBottom:8,border:".5px solid rgba(52,211,153,.3)"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#00FF87",marginBottom:8}}>Registrar pago — {card.name}</div>
            <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
              {[["saldo_mes",card.statementBalance>0?"Mes "+M2(card.statementBalance):"Saldo mes",!!card.statementBalance],["minimo",card.minPayment>0?"Mín "+M2(card.minPayment):"Mínimo",!!card.minPayment],["total","Total "+M2(card.balance),true],["parcial","Otro",true]].map(([v,l,en])=>(
                <button key={v} onClick={()=>en&&setPayType(v)} style={{flex:"1 1 auto",minWidth:60,padding:"6px 4px",fontSize:10,borderRadius:8,border:"none",cursor:en?"pointer":"not-allowed",fontFamily:"inherit",background:payType===v?"#7ED8F6":en?"#161616":"#0a0a0a",color:payType===v?"#000":en?"#888":"#444",fontWeight:payType===v?700:400,opacity:en?1:.5}}>{l}</button>
              ))}
            </div>
            {payType==="parcial"&&<input className="lfi" type="number" inputMode="decimal" placeholder="Monto" value={payAmt} onChange={e=>setPayAmt(e.target.value)} style={{marginBottom:8}}/>}
            <input className="lfi" type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} style={{marginBottom:8}}/>
            <div style={{display:"flex",gap:6}}><button className="lbp" style={{flex:1,justifyContent:"center",background:"#34d399",color:"#000"}} onClick={()=>doPay(card)}>✓ Confirmar</button><button className="lbs" onClick={()=>setPaying(null)}>Cancelar</button></div>
          </div>}
          <button className="lbs" style={{width:"100%",justifyContent:"center",fontSize:10,padding:5}} onClick={()=>setExpId(expId===card.id?null:card.id)}>
            {expId===card.id?"Cerrar ▲":"Mejor día: "+bestDay+" · Peor: "+worstDay+" ▼"}
          </button>
          {expId===card.id&&<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}>
            <div style={{background:"rgba(52,211,153,.06)",border:".5px solid rgba(52,211,153,.3)",borderRadius:9,padding:"8px 11px",fontSize:11}}><div style={{color:"#00FF87",fontWeight:700}}>✓ Mejor día: {bestDay} · ~{maxFree} días sin intereses</div></div>
            <div style={{background:"rgba(255,69,69,.06)",border:".5px solid rgba(255,69,69,.3)",borderRadius:9,padding:"8px 11px",fontSize:11}}><div style={{color:"#FF4545",fontWeight:700}}>✗ Peor día: {worstDay} · Solo ~{card.payDays||20} días</div></div>
            <div style={{background:"#080808",borderRadius:9,padding:"8px 11px",fontSize:11}}><div style={{color:"#888"}}>Límite pago: <b style={{color:"#f0f0f0"}}>{pay.toLocaleDateString("es-MX",{day:"numeric",month:"long"})}</b> · Disponible: <b style={{color:"#00FF87"}}>{M2((card.limit||0)-(card.balance||0))}</b></div></div>
          </div>}
        </div>
      );})}
    </div>}
  </div>);
}

function FinAhorros({ctx}){
  const{savings,setSavings,savGoals,setSavGoals,rate,mInc,mExp}=ctx;
  const[view,setView]=useState("metas");
  const[form,setForm]=useState(null);
  const[gform,setGform]=useState(null);
  const[abonar,setAbonar]=useState(null);
  const[abonoAmt,setAbonoAmt]=useState("");

  /* ── Cuentas (lo de antes) ── */
  const E={name:"",amount:"",currency:"MXN",location:"banco",goal:""};
  const save=()=>{const s={...form,amount:+form.amount,goal:+form.goal||0,id:form.id||Date.now()};if(!s.name||!s.amount)return;setSavings(p=>form.id?p.map(x=>x.id===s.id?s:x):[...p,s]);setForm(null)};
  const total=savings.reduce((a,s)=>a+(s.currency==="USD"?s.amount*rate:s.amount),0);
  const LOCS=[{id:"banco",icon:"🏦"},{id:"efectivo",icon:"💵"},{id:"digital",icon:"📱"},{id:"inversion",icon:"📈"},{id:"otro",icon:"📦"}];
  const gl=id=>LOCS.find(l=>l.id===id)||LOCS[LOCS.length-1];

  /* ── Metas de ahorro ── */
  const GTYPES=[{id:"emergencia",e:"🛡️",l:"Fondo emergencia"},{id:"fondo",e:"💰",l:"Fondo de ahorro"},{id:"coche",e:"🚗",l:"Coche"},{id:"casa",e:"🏠",l:"Casa/Depa"},{id:"vacaciones",e:"✈️",l:"Vacaciones"},{id:"tech",e:"📱",l:"Tecnología"},{id:"negocio",e:"📦",l:"Negocio"},{id:"otro",e:"🎯",l:"Otra meta"}];
  const gtype=id=>GTYPES.find(t=>t.id===id)||GTYPES[GTYPES.length-1];
  const GE={type:"emergencia",name:"",target:"",saved:"",deadline:"",fintech:false,rate:""};
  const saveGoal=()=>{
    const g={...gform,target:+gform.target,saved:+gform.saved||0,rate:+gform.rate||0,id:gform.id||Date.now()};
    if(!g.name||!g.target||!g.deadline)return;
    setSavGoals(p=>gform.id?p.map(x=>x.id===g.id?g:x):[...p,g]);
    setGform(null);
  };
  const doAbono=(g)=>{
    const amt=+abonoAmt;if(!amt||amt<=0)return;
    setSavGoals(p=>p.map(x=>x.id===g.id?{...x,saved:x.saved+amt}:x));
    setAbonoAmt("");setAbonar(null);
  };

  // Calculadora: cuánto ahorrar por día/semana/mes considerando interés compuesto de fintech
  const calc=(g)=>{
    const now=new Date();now.setHours(0,0,0,0);
    const dl=new Date(g.deadline+"T12:00:00");
    const days=Math.max(1,Math.ceil((dl-now)/86400000));
    const falta=Math.max(0,g.target-g.saved);
    const done=g.target>0?Math.min(100,(g.saved/g.target)*100):0;
    let perDay,perWeek,perMonth,interesTotal=0,rendDiario=0;
    if(g.fintech&&g.rate>0){
      const iD=(g.rate/100)/365;
      rendDiario=g.saved*iD;
      // PMT diario con interés compuesto: FV = saved*(1+i)^n + PMT*(((1+i)^n - 1)/i)
      const growth=Math.pow(1+iD,days);
      const fvSaved=g.saved*growth;
      const need=Math.max(0,g.target-fvSaved);
      perDay=need>0?(need*iD)/(growth-1):0;
      perWeek=perDay*7;perMonth=perDay*30.44;
      interesTotal=Math.max(0,g.target-g.saved-perDay*days);
    }else{
      perDay=falta/days;perWeek=perDay*7;perMonth=perDay*30.44;
    }
    return{days,falta,done,perDay,perWeek,perMonth,interesTotal,rendDiario,weeks:Math.ceil(days/7),months:Math.max(1,Math.round(days/30.44))};
  };

  // Sugerencia contextual según el balance real del usuario
  const suggest=(g,c)=>{
    const bal=mInc()-mExp();
    const tips=[];
    if(c.perMonth>bal&&bal>0)tips.push("⚠️ Necesitas "+M(c.perMonth)+"/mes pero tu balance actual es "+M(bal)+". Opciones: extiende la fecha, reduce gastos hormiga o aumenta ventas.");
    else if(bal>0&&c.perMonth<=bal)tips.push("✅ Tu balance mensual ("+M(bal)+") cubre esta meta. Apártalo apenas recibas ingresos — págate a ti primero.");
    if(g.fintech&&g.rate>0&&c.interesTotal>0)tips.push("📈 El interés de tu fintech aportará ~"+M(c.interesTotal)+" del total. ¡El dinero trabaja por ti!");
    if(!g.fintech)tips.push("💡 Si lo guardas en una fintech al 10-15% anual (SOFIPO), el interés reduciría lo que debes aportar.");
    if(g.type==="emergencia")tips.push("🛡️ Regla de oro: 3-6 meses de tus gastos ("+M(mExp()*3)+" a "+M(mExp()*6)+" según tu mes actual).");
    if(c.perDay<50&&c.perDay>0)tips.push("☕ Son solo "+M(c.perDay)+" al día — menos que un antojo diario.");
    return tips;
  };

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {/* Sub-tabs Metas / Cuentas */}
    <div style={{display:"flex",gap:6}}>
      {[["metas","🎯 Metas / Apartados"],["cuentas","🏦 Mis cuentas"]].map(([id,l])=>(
        <button key={id} className={"pill"+(view===id?" on":"")} onClick={()=>setView(id)}>{l}</button>
      ))}
    </div>

    {/* ═══ METAS ═══ */}
    {view==="metas"&&<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:13,fontWeight:700}}>🎯 Metas de ahorro</div><div style={{fontSize:11,color:"#555"}}>{savGoals.length} meta{savGoals.length!==1?"s":""} activa{savGoals.length!==1?"s":""}</div></div>
        <button className="lbp" style={{background:"#34d399"}} onClick={()=>setGform(GE)}>+ Nueva meta</button>
      </div>

      {gform&&<div className="lc" style={{borderColor:"rgba(52,211,153,.35)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#34d399",marginBottom:10}}>{gform.id?"Editar":"Nueva"} meta</div>
        <label className="lfl">Tipo de meta</label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:10,marginTop:4}}>
          {GTYPES.map(t=>(
            <button key={t.id} onClick={()=>setGform({...gform,type:t.id,name:gform.name||t.l})} style={{padding:"8px 3px",border:`.5px solid ${gform.type===t.id?"#34d399":"rgba(255,255,255,.06)"}`,borderRadius:9,cursor:"pointer",background:gform.type===t.id?"rgba(52,211,153,.12)":"#080808",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:17}}>{t.e}</span><span style={{fontSize:8,color:gform.type===t.id?"#34d399":"#555",textAlign:"center",lineHeight:1.1}}>{t.l}</span>
            </button>
          ))}
        </div>
        <div className="lr" style={{marginBottom:8}}>
          <div><label className="lfl">Nombre</label><input className="lfi" placeholder="Fondo de emergencia" value={gform.name} onChange={e=>setGform({...gform,name:e.target.value})}/></div>
          <div><label className="lfl">Monto objetivo $</label><input className="lfi" type="number" inputMode="decimal" placeholder="50000" value={gform.target} onChange={e=>setGform({...gform,target:e.target.value})}/></div>
        </div>
        <div className="lr" style={{marginBottom:8}}>
          <div><label className="lfl">Ya llevo ahorrado $</label><input className="lfi" type="number" inputMode="decimal" placeholder="0" value={gform.saved} onChange={e=>setGform({...gform,saved:e.target.value})}/></div>
          <div><label className="lfl">Fecha límite</label><input className="lfi" type="date" value={gform.deadline} onChange={e=>setGform({...gform,deadline:e.target.value})}/></div>
        </div>
        {/* Fintech */}
        <div onClick={()=>setGform({...gform,fintech:!gform.fintech})} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:gform.fintech?"rgba(52,211,153,.08)":"#080808",border:`.5px solid ${gform.fintech?"rgba(52,211,153,.4)":"rgba(255,255,255,.07)"}`,borderRadius:9,cursor:"pointer",marginBottom:8}}>
          <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${gform.fintech?"#34d399":"#555"}`,background:gform.fintech?"#34d399":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{gform.fintech&&<span style={{fontSize:11,color:"#000",fontWeight:700}}>✓</span>}</div>
          <div><div style={{fontSize:12,fontWeight:600}}>📈 Lo guardo en una fintech con rendimiento</div><div style={{fontSize:10,color:"#555"}}>Nu, Klar, Stori, SOFIPO, CETES... el interés compuesto reduce lo que debes aportar</div></div>
        </div>
        {gform.fintech&&<div style={{marginBottom:8}}>
          <label className="lfl">Tasa anual de la fintech %</label>
          <input className="lfi" type="number" inputMode="decimal" step=".01" placeholder="12.5" value={gform.rate} onChange={e=>setGform({...gform,rate:e.target.value})}/>
          {gform.rate>0&&gform.saved>0&&<div style={{fontSize:10,color:"#34d399",marginTop:5}}>Con {M(+gform.saved)} hoy generas ≈ {M2((+gform.saved)*((+gform.rate/100)/365))} diarios</div>}
        </div>}
        {/* Preview del cálculo en vivo */}
        {gform.target>0&&gform.deadline&&(()=>{
          const c=calc({...gform,target:+gform.target,saved:+gform.saved||0,rate:+gform.rate||0});
          return<div style={{padding:"10px 12px",background:"rgba(52,211,153,.06)",borderRadius:9,marginBottom:10,border:".5px solid rgba(52,211,153,.25)"}}>
            <div style={{fontSize:10,color:"#34d399",fontWeight:700,marginBottom:6}}>📊 CALCULADORA · {c.days} días restantes</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
              {[["Por día",c.perDay],["Por semana",c.perWeek],["Por mes",c.perMonth]].map(([l,v])=>(
                <div key={l} style={{textAlign:"center"}}><div className="lmn" style={{fontSize:13,fontWeight:700,color:"#34d399"}}>{M(v)}</div><div style={{fontSize:9,color:"#555"}}>{l}</div></div>
              ))}
            </div>
            {c.interesTotal>0&&<div style={{fontSize:10,color:"#FFB800",marginTop:7,textAlign:"center"}}>📈 El interés aportará ~{M(c.interesTotal)} — ahorras menos gracias al rendimiento</div>}
          </div>;
        })()}
        <div style={{display:"flex",gap:6}}>
          <button className="lbp" style={{background:"#34d399"}} onClick={saveGoal}>Guardar meta</button>
          <button className="lbs" onClick={()=>setGform(null)}>Cancelar</button>
          {gform.id&&<button className="lbd" style={{marginLeft:"auto"}} onClick={()=>{setSavGoals(p=>p.filter(x=>x.id!==gform.id));setGform(null)}}>🗑</button>}
        </div>
      </div>}

      {savGoals.length===0&&!gform&&<Mpty msg="Sin metas de ahorro" sub="Crea tu primera meta: emergencia, coche, casa, vacaciones..."/>}

      {savGoals.map(g=>{
        const c=calc(g);const t=gtype(g.type);const tips=suggest(g,c);
        const isA=abonar===g.id;const done=c.done>=100;
        return(<div key={g.id} className="lc" style={{borderColor:done?"rgba(0,255,135,.4)":"rgba(52,211,153,.2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <div style={{width:42,height:42,borderRadius:11,background:"rgba(52,211,153,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:21,flexShrink:0}}>{t.e}</div>
              <div>
                <div style={{fontSize:14,fontWeight:700}}>{g.name}</div>
                <div style={{fontSize:10,color:"#555",marginTop:1}}>Meta: <b className="lmn" style={{color:"#34d399"}}>{M(g.target)}</b> · {done?"¡Completada!":c.days+" días restantes"}{g.fintech&&g.rate>0?" · 📈 "+g.rate+"% anual":""}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:3}}>
              <button className="lbs" style={{padding:"3px 7px",fontSize:11}} onClick={()=>setGform(g)}>✏️</button>
              <button className="lbd" onClick={()=>setSavGoals(p=>p.filter(x=>x.id!==g.id))}>🗑</button>
            </div>
          </div>

          {/* Progreso */}
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
              <span>Llevo: <b className="lmn" style={{color:"#00FF87"}}>{M(g.saved)}</b></span>
              <span className="lmn" style={{color:done?"#00FF87":"#34d399",fontWeight:700}}>{c.done.toFixed(0)}%</span>
              <span>Falta: <b className="lmn" style={{color:c.falta>0?"#FFB800":"#00FF87"}}>{M(c.falta)}</b></span>
            </div>
            <div style={{height:7,background:"#161616",borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${c.done}%`,background:done?"#00FF87":"linear-gradient(90deg,#34d399,#00FF87)",borderRadius:99,transition:"width .5s",boxShadow:done?"0 0 10px #00FF87":""}}/>
            </div>
          </div>

          {done?<div style={{padding:10,background:"rgba(0,255,135,.08)",borderRadius:9,textAlign:"center",color:"#00FF87",fontWeight:700,fontSize:13}}>🏆 ¡Meta alcanzada! Felicidades</div>:<>
          {/* Cuánto ahorrar */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
            {[["Por día",c.perDay,"☀️"],["Por semana",c.perWeek,"📅"],["Por mes",c.perMonth,"🗓️"]].map(([l,v,e])=>(
              <div key={l} style={{background:"#080808",borderRadius:9,padding:"9px 6px",textAlign:"center",border:".5px solid rgba(52,211,153,.15)"}}>
                <div style={{fontSize:11}}>{e}</div>
                <div className="lmn" style={{fontSize:13,fontWeight:700,color:"#34d399",marginTop:2}}>{M(v)}</div>
                <div style={{fontSize:8,color:"#555",marginTop:1}}>{l}</div>
              </div>
            ))}
          </div>

          {/* Fintech: rendimiento diario */}
          {g.fintech&&g.rate>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
            <div style={{background:"rgba(255,183,0,.05)",border:".5px solid rgba(255,183,0,.25)",borderRadius:9,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#FFB800"}}>📈 Rendimiento diario HOY</div>
              <div className="lmn" style={{fontSize:14,fontWeight:700,color:"#FFB800"}}>+{M2(c.rendDiario)}</div>
              <div style={{fontSize:9,color:"#555"}}>≈ {M2(c.rendDiario*30.44)}/mes con lo que llevas</div>
            </div>
            <div style={{background:"rgba(255,183,0,.05)",border:".5px solid rgba(255,183,0,.25)",borderRadius:9,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#FFB800"}}>💰 Interés total proyectado</div>
              <div className="lmn" style={{fontSize:14,fontWeight:700,color:"#FFB800"}}>~{M(c.interesTotal)}</div>
              <div style={{fontSize:9,color:"#555"}}>que la fintech pone por ti</div>
            </div>
          </div>}

          {/* Abonar */}
          {!isA?<button className="lbp" style={{width:"100%",justifyContent:"center",background:"#34d399",marginBottom:8}} onClick={()=>{setAbonar(g.id);setAbonoAmt("")}}>💵 Abonar a esta meta</button>:
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input className="lfi" type="number" inputMode="decimal" placeholder="Monto a abonar" value={abonoAmt} onChange={e=>setAbonoAmt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doAbono(g)} autoFocus style={{flex:1}}/>
            <button className="lbp" style={{background:"#34d399"}} onClick={()=>doAbono(g)}>✓</button>
            <button className="lbs" onClick={()=>setAbonar(null)}>✕</button>
          </div>}

          {/* Sugerencias */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {tips.map((tip,i)=><div key={i} style={{fontSize:10,color:"#999",lineHeight:1.5,padding:"6px 9px",background:"#080808",borderRadius:7}}>{tip}</div>)}
          </div>
          </>}
        </div>);
      })}
    </>}

    {/* ═══ CUENTAS ═══ */}
    {view==="cuentas"&&<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:13,fontWeight:700}}>🏦 Mis cuentas</div><div className="lmn" style={{fontSize:12,color:"#00FF87"}}>{M2(total)}</div></div>
        <button className="lbp" onClick={()=>setForm(E)}>+ Agregar</button>
      </div>
      {form&&<div className="lc" style={{borderColor:"rgba(52,211,153,.3)"}}>
        <div className="lr"><div><label className="lfl">Nombre</label><input className="lfi" placeholder="Nu Cuenta..." value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><label className="lfl">Monto</label><input className="lfi" type="number" inputMode="decimal" step="any" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div></div>
        <div className="lr" style={{marginTop:8}}><div><label className="lfl">Moneda</label><select className="lfi" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}><option value="MXN">MXN</option><option value="USD">USD</option></select></div><div><label className="lfl">¿Dónde?</label><select className="lfi" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>{LOCS.map(l=><option key={l.id} value={l.id}>{l.id}</option>)}</select></div><div><label className="lfl">Meta</label><input className="lfi" type="number" inputMode="decimal" placeholder="50000" value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})}/></div></div>
        <div style={{display:"flex",gap:6,marginTop:10}}><button className="lbp" onClick={save}>Guardar</button><button className="lbs" onClick={()=>setForm(null)}>Cancelar</button></div>
      </div>}
      {savings.length===0&&!form?<Mpty msg="Sin cuentas" sub="Agrega tus cuentas de ahorro"/>:
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:8}}>
        {savings.map(s=>{const loc=gl(s.location);const mv=s.currency==="USD"?s.amount*rate:s.amount;const gp=s.goal>0?(mv/s.goal*100):0;return(
          <div key={s.id} className="lc">
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:18}}>{loc.icon}</span><div style={{display:"flex",gap:3}}><button className="lbs" style={{padding:"2px 5px",fontSize:10}} onClick={()=>setForm(s)}>✏️</button><button className="lbd" style={{padding:"2px 5px"}} onClick={()=>setSavings(p=>p.filter(x=>x.id!==s.id))}>🗑</button></div></div>
            <div style={{fontSize:12,fontWeight:700,marginBottom:2}}>{s.name}</div>
            <div className="lmn" style={{fontSize:16,fontWeight:700,color:"#00FF87"}}>{s.currency==="USD"?U(s.amount):M2(s.amount)}</div>
            {s.currency==="USD"&&<div style={{fontSize:10,color:"#444"}}>{M2(mv)} MXN</div>}
            {s.goal>0&&<div style={{marginTop:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginBottom:2}}><span style={{color:"#444"}}>Meta {M(s.goal)}</span><span style={{color:gp>=100?"#00FF87":"#FFB800"}}>{Math.min(gp,100).toFixed(0)}%</span></div><div style={{height:3,background:"#161616",borderRadius:99}}><div style={{height:"100%",width:`${Math.min(gp,100)}%`,background:gp>=100?"#00FF87":"#FFB800",borderRadius:99}}/></div></div>}
          </div>
        )})}
      </div>}
    </>}
  </div>);
}

function HabModule({ctx}){
  const[tab,setTab]=useState("habitos");
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
      {[["habitos","Hábitos"],["tareas","Tareas"],["stats","Progreso"]].map(([id,l])=>(
        <button key={id} className={"pill"+(tab===id?" on":"")} onClick={()=>setTab(id)}>{l}</button>
      ))}
    </div>
    {tab==="habitos" && <HabHabitos ctx={ctx}/>}
    {tab==="tareas"  && <HabTareas ctx={ctx}/>}
    {tab==="stats"   && <HabStats ctx={ctx}/>}
  </div>);
}

function HabHoy({ctx}){
  const{habits,comp,tasks,tToggle}=ctx;const tod=td();
  const done=habits.filter(h=>(comp[h.id]||{})[tod]).length;
  const pct=habits.length>0?Math.round(done/habits.length*100):0;const circ=Math.PI*44;
  const due=tasks.filter(t=>!t.completed&&t.dueDate===tod);
  const nodate=tasks.filter(t=>!t.completed&&!t.dueDate).slice(0,5);
  const overdue=tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate<tod);
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{padding:"12px 16px",background:"#0f0f0f",borderRadius:13,borderLeft:"3px solid #00FF87"}}>
      <div style={{fontSize:9,color:"#00FF87",textTransform:"uppercase",letterSpacing:".5px",marginBottom:5,fontWeight:700}}>💬 Frase del día</div>
      <div style={{fontSize:12,color:"#c0c0c0",lineHeight:1.6,fontStyle:"italic"}}>"{QUOTE()}"</div>
    </div>
    {habits.length>0&&<div className="lc">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><div style={{fontSize:9,color:"#444",textTransform:"uppercase"}}>Hábitos de hoy</div><div style={{fontSize:18,fontWeight:700,color:pct===100?"#00FF87":"#f0f0f0",marginTop:2}}>{done}<span style={{fontSize:12,color:"#444"}}>/{habits.length}</span></div></div>
        <div style={{position:"relative",width:52,height:52}}>
          <svg width="52" height="52" style={{transform:"rotate(-90deg)"}}><circle cx="26" cy="26" r="22" fill="none" stroke="#161616" strokeWidth="5"/><circle cx="26" cy="26" r="22" fill="none" stroke="#00FF87" strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-pct/100)} style={{transition:"stroke-dashoffset .5s",filter:pct===100?"drop-shadow(0 0 5px #00FF87)":""}}/></svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:pct===100?"#00FF87":"#f0f0f0"}}>{pct}%</div>
        </div>
      </div>
      {habits.map(h=>{const d2=(comp[h.id]||{})[tod];const streak=getStreak(comp,h.id);return(
        <div key={h.id} onClick={()=>tToggle(h.id)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:11,border:`.5px solid ${d2?"rgba(0,255,135,.3)":"rgba(255,255,255,.05)"}`,background:d2?"rgba(0,255,135,.05)":"#0a0a0a",marginBottom:7,transition:"all .2s"}}>
          <div style={{width:38,height:38,borderRadius:11,background:d2?h.color:"#161616",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0,boxShadow:d2?`0 0 12px ${h.color}55`:""}}>{d2?"✅":h.emoji}</div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:d2?"#00FF87":"#f0f0f0",textDecoration:d2?"line-through":"none",opacity:d2?.75:1}}>{h.name}</div><div style={{fontSize:10,color:"#444",marginTop:1}}>{d2?"¡Completado! 🎉":"Toca para completar"}</div></div>
          {streak>0&&<div style={{fontSize:11,color:"#FFB800",fontWeight:700}}>🔥{streak}</div>}
        </div>
      )})}
      {pct===100&&<div style={{padding:10,background:"rgba(0,255,135,.08)",borderRadius:10,textAlign:"center",color:"#00FF87",fontWeight:700,fontSize:13,boxShadow:"0 0 20px rgba(0,255,135,.15)"}}>🏆 ¡Todos los hábitos completados!</div>}
    </div>}
    {overdue.length>0&&<div style={{padding:"10px 14px",background:"rgba(255,69,69,.06)",border:".5px solid rgba(255,69,69,.3)",borderRadius:13}}>
      <div style={{fontSize:9,color:"#FF4545",textTransform:"uppercase",marginBottom:8,fontWeight:700}}>⚠️ Atrasadas ({overdue.length})</div>
      {overdue.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:".5px solid rgba(255,255,255,.04)"}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:PCOLOR[t.priority]||"#FF4545",flexShrink:0}}/>
        <div style={{flex:1,fontSize:12}}>{t.text}</div>
        <div style={{fontSize:10,color:"#FF4545"}}>{fd(t.dueDate)}</div>
        <button className="lbp" style={{padding:"3px 7px",fontSize:11}} onClick={e=>{e.stopPropagation();ctx.setTasks(p=>p.map(x=>x.id===t.id?{...x,completed:true,completedAt:td()}:x))}}>✓</button>
      </div>)}
    </div>}
    {due.length>0&&<div className="lc">
      <div style={{fontSize:9,color:"#444",textTransform:"uppercase",marginBottom:8,fontWeight:700}}>📋 Tareas de hoy</div>
      {due.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:".5px solid rgba(255,255,255,.05)"}}>
        <button onClick={()=>ctx.setTasks(p=>p.map(x=>x.id===t.id?{...x,completed:true,completedAt:td()}:x))} style={{width:20,height:20,borderRadius:"50%",border:`.5px solid ${PCOLOR[t.priority]||"#555"}`,background:"transparent",cursor:"pointer",flexShrink:0}}/>
        <div style={{flex:1,fontSize:12,fontWeight:500}}>{t.text}</div>
        <div style={{width:7,height:7,borderRadius:"50%",background:PCOLOR[t.priority]||"#555",flexShrink:0}}/>
      </div>)}
    </div>}
    {nodate.length>0&&<div className="lc">
      <div style={{fontSize:9,color:"#444",textTransform:"uppercase",marginBottom:8,fontWeight:700}}>📌 Pendientes</div>
      {nodate.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:".5px solid rgba(255,255,255,.05)"}}>
        <button onClick={()=>ctx.setTasks(p=>p.map(x=>x.id===t.id?{...x,completed:true,completedAt:td()}:x))} style={{width:19,height:19,borderRadius:"50%",border:".5px solid rgba(255,255,255,.1)",background:"transparent",cursor:"pointer",flexShrink:0}}/>
        <div style={{flex:1,fontSize:12}}>{t.text}</div>
        <div style={{width:7,height:7,borderRadius:"50%",background:PCOLOR[t.priority]||"#555",flexShrink:0}}/>
      </div>)}
    </div>}
    {habits.length===0&&<div style={{textAlign:"center",padding:"28px 0",color:"#444"}}><div style={{fontSize:36,marginBottom:10}}>🔥</div><div style={{fontSize:13}}>Ve a "Hábitos" para crear tu primero</div></div>}
  </div>);
}

function HabHabitos({ctx}){
  const{habits,setHabits,comp,tToggle}=ctx;const[form,setForm]=useState(null);const[showE,setShowE]=useState(false);
  const E={name:"",emoji:"🔥",color:"#00FF87"};const tod=td();
  const save=()=>{if(!form?.name?.trim())return;const h={...form,id:form.id||Date.now(),createdAt:form.createdAt||tod};setHabits(p=>form.id?p.map(x=>x.id===h.id?h:x):[...p,h]);setForm(null);setShowE(false)};
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontSize:13,fontWeight:700}}>🔥 {habits.length} hábitos</div>
      <button className="lbp" onClick={()=>setForm(E)}><span>+</span> Nuevo</button>
    </div>
    {form&&<div className="lc" style={{borderColor:"rgba(0,255,135,.3)"}}>
      <div style={{marginBottom:10}}>
        <label className="lfl">Emoji</label>
        <button onClick={()=>setShowE(v=>!v)} style={{background:"#080808",border:".5px solid rgba(255,255,255,.07)",borderRadius:9,padding:"8px 14px",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",gap:8,color:"#f0f0f0",fontFamily:"inherit"}}>{form.emoji} <span style={{fontSize:11,color:"#555"}}>Cambiar ▾</span></button>
        {showE&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:7,padding:9,background:"#080808",borderRadius:9}}>
          {EMOJIS.map(e=><button key={e} onClick={()=>{setForm({...form,emoji:e});setShowE(false)}} style={{fontSize:20,background:form.emoji===e?"rgba(0,255,135,.15)":"transparent",border:form.emoji===e?".5px solid #00FF87":".5px solid transparent",borderRadius:7,padding:4,cursor:"pointer",width:36,height:36}}>{e}</button>)}
        </div>}
      </div>
      <div style={{marginBottom:10}}><label className="lfl">Nombre</label><input className="lfi" placeholder="Tomar 2L de agua" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} onKeyDown={e=>e.key==="Enter"&&save()}/></div>
      <div style={{marginBottom:12}}><label className="lfl">Color</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:4}}>
          {HCOLORS.map(c=><button key={c} onClick={()=>setForm({...form,color:c})} style={{width:24,height:24,borderRadius:"50%",background:c,cursor:"pointer",border:form.color===c?"2.5px solid #fff":"2px solid transparent",boxShadow:form.color===c?`0 0 7px ${c}`:""}}/>)}
        </div>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button className="lbp" onClick={save}>Guardar</button><button className="lbs" onClick={()=>{setForm(null);setShowE(false)}}>Cancelar</button>
        {form.id&&<button className="lbd" style={{marginLeft:"auto"}} onClick={()=>{setHabits(p=>p.filter(x=>x.id!==form.id));setForm(null)}}><span>🗑</span></button>}
      </div>
    </div>}
    {habits.length===0&&!form&&<Mpty msg="Sin hábitos" sub="Los hábitos son la base del éxito"/>}
    {habits.map(h=>{
      const d2=(comp[h.id]||{})[tod];const streak=getStreak(comp,h.id);const last28=getLast28();const cmap=comp[h.id]||{};const r28=last28.filter(d=>cmap[d]).length;
      return(<div key={h.id} className="lc" style={{borderColor:d2?"rgba(0,255,135,.2)":"rgba(255,255,255,.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div onClick={()=>tToggle(h.id)} style={{width:44,height:44,borderRadius:12,background:d2?h.color:"#161616",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,cursor:"pointer",flexShrink:0,transition:"all .2s",boxShadow:d2?`0 0 14px ${h.color}55`:""}}>{d2?"✅":h.emoji}</div>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{h.name}</div>
            <div style={{display:"flex",gap:8,marginTop:2,fontSize:10,color:"#555",flexWrap:"wrap"}}>
              {streak>0&&<span style={{color:"#FFB800",fontWeight:700}}>🔥 {streak}d</span>}
              <span>{r28}/28 · {Math.round(r28/28*100)}%</span>
              <span style={{color:d2?"#00FF87":"#555"}}>{d2?"✓ Hoy":"Pendiente"}</span>
            </div>
          </div>
          <button className="lbs" style={{padding:"3px 7px",fontSize:11}} onClick={()=>setForm(h)}><span>✏️</span></button>
        </div>
        <div style={{fontSize:9,color:"#444",marginBottom:4,textTransform:"uppercase"}}>Últimos 28 días</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {last28.map(d=><div key={d} style={{aspectRatio:"1",borderRadius:3,background:cmap[d]?h.color:"#161616",boxShadow:cmap[d]?`0 0 4px ${h.color}55`:""}}/>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#444",marginTop:2}}><span>4 sem.</span><span>Hoy</span></div>
      </div>);
    })}
  </div>);
}

function HabTareas({ctx}){
  const{tasks,setTasks}=ctx;
  const[text,setText]=useState("");const[priority,setPriority]=useState("media");const[dueDate,setDueDate]=useState("");const[notes,setNotes]=useState("");
  const[filter,setFilter]=useState("pendientes");const[showForm,setShowForm]=useState(false);const[editId,setEditId]=useState(null);
  const inRef=useRef(null);
  const add=()=>{if(!text.trim())return;if(editId){setTasks(p=>p.map(t=>t.id===editId?{...t,text,priority,dueDate,notes}:t));setEditId(null)}else{setTasks(p=>[...p,{id:Date.now(),text:text.trim(),priority,dueDate,notes,completed:false,completedAt:null,createdAt:td()}])}setText("");setDueDate("");setNotes("");setPriority("media");setShowForm(false)};
  const startEdit=t=>{setEditId(t.id);setText(t.text);setPriority(t.priority);setDueDate(t.dueDate||"");setNotes(t.notes||"");setShowForm(true)};
  const complete=id=>setTasks(p=>p.map(t=>t.id===id?{...t,completed:!t.completed,completedAt:t.completed?null:td()}:t));
  const del=id=>setTasks(p=>p.filter(t=>t.id!==id));
  const tod=td();
  const filtered=filter==="hoy"?tasks.filter(t=>!t.completed&&t.dueDate===tod):filter==="pendientes"?tasks.filter(t=>!t.completed).sort((a,b)=>({alta:0,media:1,baja:2}[a.priority]-{alta:0,media:1,baja:2}[b.priority])):filter==="completadas"?tasks.filter(t=>t.completed).sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||"")):tasks;
  const pending=tasks.filter(t=>!t.completed).length;const todC=tasks.filter(t=>!t.completed&&t.dueDate===tod).length;const overC=tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate<tod).length;
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {!showForm?<button className="lbp" onClick={()=>{setShowForm(true);setTimeout(()=>inRef.current?.focus(),50)}} style={{width:"100%",justifyContent:"center",padding:12,fontSize:14}}><span>+</span> Nueva tarea</button>:
    <div className="lc" style={{borderColor:"rgba(0,255,135,.3)"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#00FF87",marginBottom:10}}>{editId?"Editar":"Nueva"} tarea</div>
      <input ref={inRef} className="lfi" placeholder="¿Qué necesitas hacer?" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} style={{fontSize:14,fontWeight:500,marginBottom:10}}/>
      <div style={{display:"flex",gap:5,marginBottom:10}}>
        {["alta","media","baja"].map(p=><button key={p} onClick={()=>setPriority(p)} style={{flex:1,padding:"7px",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,background:priority===p?PCOLOR[p]:"#161616",color:priority===p?"#000":"#666"}}>{p==="alta"?"🔴 Alta":p==="media"?"🟡 Media":"🔵 Baja"}</button>)}
      </div>
      <div className="lr" style={{marginBottom:10}}><div><label className="lfl">Fecha límite</label><input className="lfi" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div><div><label className="lfl">Nota</label><input className="lfi" placeholder="Detalles..." value={notes} onChange={e=>setNotes(e.target.value)}/></div></div>
      <div style={{display:"flex",gap:6}}><button className="lbp" onClick={add}>Guardar</button><button className="lbs" onClick={()=>{setShowForm(false);setEditId(null);setText("");setDueDate("");setNotes("");setPriority("media")}}>Cancelar</button></div>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
      {[[pending,"Pendientes","#f0f0f0"],[todC,"Para hoy","#00FF87"],[overC,"Atrasadas","#FF4545"]].map(([n,l,c])=><div key={l} style={{background:"#0f0f0f",borderRadius:9,padding:"9px",textAlign:"center"}}><div className="lmn" style={{fontSize:18,fontWeight:700,color:c}}>{n}</div><div style={{fontSize:9,color:"#444",marginTop:2,textTransform:"uppercase"}}>{l}</div></div>)}
    </div>
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
      {[["hoy","Hoy"],["pendientes","Pendientes"],["completadas","Completadas"],["todas","Todas"]].map(([id,l])=><button key={id} onClick={()=>setFilter(id)} style={{padding:"5px 10px",border:"none",borderRadius:16,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:filter===id?700:400,background:filter===id?"#00FF87":"#0f0f0f",color:filter===id?"#000":"#666"}}>{l}</button>)}
    </div>
    {filtered.length===0&&<Mpty msg="Sin tareas aquí" sub={filter==="completadas"?"¡A completar tareas!":"Sin pendientes en este filtro"}/>}
    {filtered.map(t=>{const isO=!t.completed&&t.dueDate&&t.dueDate<tod;return(
      <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"11px 13px",background:"#0f0f0f",borderRadius:11,border:`.5px solid ${isO?"rgba(255,69,69,.3)":t.completed?"rgba(0,255,135,.15)":"rgba(255,255,255,.06)"}`}}>
        <button onClick={()=>complete(t.id)} style={{width:21,height:21,borderRadius:"50%",border:`2px solid ${PCOLOR[t.priority]||"#555"}`,background:t.completed?(PCOLOR[t.priority]||"#00FF87"):"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
          {t.completed&&<span style={{fontSize:11,color:"#000",fontWeight:700}}>✓</span>}
        </button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,textDecoration:t.completed?"line-through":"none",opacity:t.completed?.5:1}}>{t.text}</div>
          <div style={{display:"flex",gap:7,marginTop:2,flexWrap:"wrap"}}>
            {t.dueDate&&<span style={{fontSize:10,color:isO?"#FF4545":t.dueDate===tod?"#00FF87":"#555",fontWeight:t.dueDate===tod?700:400}}>{isO?"⚠️ ":t.dueDate===tod?"📅 ":""}{fd(t.dueDate)}</span>}
            {t.notes&&<span style={{fontSize:10,color:"#444"}}>{t.notes}</span>}
            {t.completedAt&&<span style={{fontSize:10,color:"#00FF87"}}>✓ {fd(t.completedAt)}</span>}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:PCOLOR[t.priority]||"#555",margin:"2px auto"}}/>
          {!t.completed&&<button className="lbs" style={{padding:"2px 5px",fontSize:10}} onClick={()=>startEdit(t)}><span>✏️</span></button>}
          <button className="lbd" style={{padding:"2px 5px",fontSize:10}} onClick={()=>del(t.id)}><span>🗑</span></button>
        </div>
      </div>
    )})}
  </div>);
}

function HabStats({ctx}){
  const{habits,comp,tasks}=ctx;const last28=getLast28();const tod=td();
  const completedM=tasks.filter(t=>t.completed&&t.completedAt?.startsWith(tod.slice(0,7))).length;
  const pending=tasks.filter(t=>!t.completed).length;
  const habitStats=habits.map(h=>{const c=comp[h.id]||{};const s=getStreak(comp,h.id);const r=last28.filter(d=>c[d]).length;return{...h,streak:s,rate:Math.round(r/28*100)}}).sort((a,b)=>b.streak-a.streak);
  const bestS=habitStats.reduce((a,h)=>h.streak>a?h.streak:a,0);
  const avgR=habitStats.length>0?Math.round(habitStats.reduce((a,h)=>a+h.rate,0)/habitStats.length):0;
  const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const dk=ds(d);const done=habits.filter(h=>(comp[h.id]||{})[dk]).length;return{label:d.toLocaleDateString("es-MX",{weekday:"short"}),pct:habits.length>0?Math.round(done/habits.length*100):0}});
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      {[[bestS+"🔥","Mejor racha","días","#00FF87"],[avgR+"%","Consistencia 28d","promedio",avgR>=70?"#00FF87":avgR>=40?"#FFB800":"#FF4545"],[completedM,"Tareas completadas","este mes","#00FF87"],[pending,"Por hacer","pendientes",pending>10?"#FF4545":"#FFB800"]].map(([v,l,s,c])=>(
        <div key={l} style={{background:"#0f0f0f",borderRadius:12,padding:12,border:".5px solid rgba(255,255,255,.06)"}}>
          <div style={{fontSize:9,color:"#444",textTransform:"uppercase"}}>{l}</div>
          <div className="lmn" style={{fontSize:22,fontWeight:700,color:c,marginTop:3}}>{v}</div>
          <div style={{fontSize:10,color:"#444",marginTop:1}}>{s}</div>
        </div>
      ))}
    </div>
    {habits.length>0&&<div className="lc">
      <div style={{fontSize:10,color:"#444",textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Últimos 7 días</div>
      <div style={{display:"flex",alignItems:"flex-end",gap:6,height:80}}>
        {last7.map((d,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,height:"100%"}}>
          <div style={{fontSize:9,color:d.pct===100?"#00FF87":"#444",fontWeight:d.pct===100?700:400}}>{d.pct}%</div>
          <div style={{flex:1,width:"100%",display:"flex",alignItems:"flex-end"}}>
            <div style={{width:"100%",height:`${Math.max(d.pct,3)}%`,background:d.pct===100?"#00FF87":d.pct>=50?"rgba(0,255,135,.3)":"#161616",borderRadius:"3px 3px 0 0",boxShadow:d.pct===100?"0 0 8px rgba(0,255,135,.35)":""}}/>
          </div>
          <div style={{fontSize:9,color:"#444"}}>{d.label}</div>
        </div>)}
      </div>
    </div>}
    {habitStats.length>0&&<div className="lc">
      <div style={{fontSize:10,color:"#444",textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Ranking</div>
      {habitStats.map((h,i)=><div key={h.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:".5px solid rgba(255,255,255,.05)"}}>
        <div style={{fontSize:14,width:22,textAlign:"center",flexShrink:0,color:"#444"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
        <div style={{fontSize:18,flexShrink:0}}>{h.emoji}</div>
        <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{h.name}</div><div style={{height:3,background:"#161616",borderRadius:99,marginTop:4}}><div style={{height:"100%",width:`${h.rate}%`,background:h.color,borderRadius:99}}/></div></div>
        <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:12,fontWeight:700,color:"#00FF87"}}>{h.rate}%</div>{h.streak>0&&<div style={{fontSize:10,color:"#FFB800"}}>🔥{h.streak}</div>}</div>
      </div>)}
    </div>}
    {habits.length===0&&<Mpty msg="Sin datos" sub="Agrega hábitos para ver estadísticas"/>}
  </div>);
}

function MenteModule({ctx}){
  const[tab,setTab]=useState("meditar");
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {[["meditar","Meditar","ti-brain"],["respirar","Respirar","ti-wind"],["journal","Journal","ti-notebook"]].map(([id,l,ic])=>(
        <button key={id} onClick={()=>setTab(id)} style={{padding:"6px 12px",border:"none",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:tab===id?700:400,background:tab===id?"#c084fc":"#0f0f0f",color:tab===id?"#000":"#666",display:"flex",alignItems:"center",gap:4}}>
          {l}
        </button>
      ))}
    </div>
    {tab==="meditar"  && <MedTimer ctx={ctx}/>}
    {tab==="respirar" && <BreathTab/>}
    {tab==="journal"  && <JournalTab ctx={ctx}/>}
    <AskIA ctx={ctx} module="mente"/>
  </div>);
}

function MedTimer({ctx}){
  const{medSess,setMedSess}=ctx;
  const[preset,setPreset]=useState(10);const[running,setRunning]=useState(false);const[elapsed,setElapsed]=useState(0);const[done,setDone]=useState(false);
  const totalSec=preset*60;const remaining=totalSec-elapsed;const pct=totalSec>0?elapsed/totalSec:0;const circ=Math.PI*2*90;
  useEffect(()=>{
    if(!running)return;
    const t=setInterval(()=>{setElapsed(e=>{if(e>=totalSec-1){setRunning(false);setDone(true);return totalSec}return e+1})},1000);
    return()=>clearInterval(t);
  },[running,totalSec]);
  const fmt=s=>String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
  const reset=()=>{setElapsed(0);setRunning(false);setDone(false)};
  const finish=()=>{setMedSess(p=>[...p,{id:Date.now(),minutes:preset,date:td()}]);reset()};
  const thisWeek=medSess.filter(s=>(Date.now()-new Date(s.date))/86400000<=7).length;
  const totalMin=medSess.reduce((a,s)=>a+s.minutes,0);
  return(<div style={{display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
      {[5,10,15,20,30].map(m=><button key={m} onClick={()=>{setPreset(m);reset()}} style={{padding:"6px 14px",border:"none",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:preset===m?700:400,background:preset===m?"#c084fc":"#0f0f0f",color:preset===m?"#000":"#666"}}>{m} min</button>)}
    </div>
    <div style={{position:"relative",width:210,height:210}}>
      <svg width="210" height="210" style={{transform:"rotate(-90deg)"}}>
        <circle cx="105" cy="105" r="90" fill="none" stroke="#161616" strokeWidth="8"/>
        <circle cx="105" cy="105" r="90" fill="none" stroke={done?"#00FF87":"#c084fc"} strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} style={{transition:"stroke-dashoffset .5s",filter:done?"drop-shadow(0 0 10px #00FF87)":"drop-shadow(0 0 8px #c084fc)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        {done?(<div style={{textAlign:"center"}}><div style={{fontSize:36}}>🎉</div><div style={{fontSize:14,fontWeight:700,color:"#00FF87",marginTop:6}}>¡Completada!</div><div style={{fontSize:11,color:"#666",marginTop:3}}>{preset} minutos</div></div>):(<>
          <div className="lmn" style={{fontSize:42,fontWeight:700,color:running?"#c084fc":"#f0f0f0"}}>{fmt(remaining)}</div>
          <div style={{fontSize:11,color:"#555",marginTop:4}}>{running?"meditando...":"listo para comenzar"}</div>
        </>)}
      </div>
    </div>
    <div style={{display:"flex",gap:8,justifyContent:"center"}}>
      {done?(<button className="lbp" style={{background:"#00FF87",fontSize:14,padding:"10px 24px"}} onClick={finish}>✓ Guardar sesión</button>):(<>
        <button className="lbp" style={{background:"#c084fc",fontSize:14,padding:"10px 28px"}} onClick={()=>setRunning(v=>!v)}>{running?"⏸ Pausar":"▶ Comenzar"}</button>
        {elapsed>0&&<button className="lbs" onClick={reset}>↺ Reiniciar</button>}
      </>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,width:"100%",maxWidth:300}}>
      {[[thisWeek,"Esta semana"],[totalMin+" min","Total meditado"],[medSess.length,"Sesiones"],[medSess.length>0?medSess[medSess.length-1].minutes+" min":"—","Última sesión"]].map(([v,l])=>(
        <div key={l} style={{background:"#0f0f0f",borderRadius:10,padding:"10px",textAlign:"center",border:".5px solid rgba(192,132,252,.15)"}}>
          <div className="lmn" style={{fontSize:16,fontWeight:700,color:"#c084fc"}}>{v}</div>
          <div style={{fontSize:9,color:"#444",marginTop:2}}>{l}</div>
        </div>
      ))}
    </div>
  </div>);
}

function BreathTab(){
  const[running,setRunning]=useState(false);const[phase,setPhase]=useState(0);const[count,setCount]=useState(0);const[cycles,setCycles]=useState(0);
  const[type,setType]=useState("box");
  const TYPES={box:{name:"Box 4-4-4-4",phases:[{l:"Inhala",t:4,color:"#c084fc"},{l:"Sostén",t:4,color:"#7ED8F6"},{l:"Exhala",t:4,color:"#00FF87"},{l:"Sostén",t:4,color:"#FFB800"}]},f478:{name:"4-7-8 Relax",phases:[{l:"Inhala",t:4,color:"#c084fc"},{l:"Sostén",t:7,color:"#7ED8F6"},{l:"Exhala",t:8,color:"#00FF87"}]},deep:{name:"Profunda 6-6",phases:[{l:"Inhala",t:6,color:"#c084fc"},{l:"Exhala",t:6,color:"#00FF87"}]}};
  const phases=TYPES[type].phases;const cur=phases[phase%phases.length];
  useEffect(()=>{
    if(!running)return;
    const tick=setInterval(()=>{
      setCount(c=>{
        if(c>=cur.t-1){setPhase(p=>{const np=(p+1)%phases.length;if(np===0)setCycles(cy=>cy+1);return np});return 0}
        return c+1;
      });
    },1000);
    return()=>clearInterval(tick);
  },[running,cur.t,phases.length]);
  const pctB=cur?(count/cur.t):0;const scale=1+pctB*0.35;
  return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
      {Object.entries(TYPES).map(([k,v])=><button key={k} onClick={()=>{setType(k);setPhase(0);setCount(0);setRunning(false)}} style={{padding:"5px 10px",border:"none",borderRadius:14,cursor:"pointer",fontFamily:"inherit",fontSize:10,background:type===k?"#c084fc":"#0f0f0f",color:type===k?"#000":"#666"}}>{v.name}</button>)}
    </div>
    <div style={{position:"relative",width:190,height:190,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:120,height:120,borderRadius:"50%",background:cur.color+"20",border:`2px solid ${cur.color}`,transform:`scale(${running?scale:1})`,transition:`transform ${cur.t}s linear`,boxShadow:`0 0 30px ${cur.color}44`}}/>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontSize:18,fontWeight:700,color:cur.color}}>{running?cur.l:"Listo"}</div>
        <div className="lmn" style={{fontSize:28,fontWeight:700,color:"#f0f0f0",marginTop:2}}>{running?cur.t-count:""}</div>
      </div>
    </div>
    <button className="lbp" style={{background:running?"#FF4545":"#c084fc",padding:"10px 28px",fontSize:14}} onClick={()=>{setRunning(v=>!v);if(!running){setPhase(0);setCount(0)}}}>
      {running?"⏸ Pausar":"▶ Comenzar"}
    </button>
    {cycles>0&&<div style={{fontSize:13,color:"#c084fc"}}>✓ {cycles} ciclo{cycles!==1?"s":""} completado{cycles!==1?"s":""}</div>}
    <div style={{fontSize:11,color:"#555",textAlign:"center",maxWidth:260,lineHeight:1.6}}>La respiración controlada reduce el estrés y mejora el enfoque. Practica 3-5 minutos diarios.</div>
  </div>);
}

function JournalTab({ctx}){
  const{journal,setJournal}=ctx;
  const[mood,setMood]=useState("😊");const[text,setText]=useState("");const[date,setDate]=useState(td());
  const save=()=>{if(!text.trim())return;setJournal(p=>[{id:Date.now(),mood,text:text.trim(),date},...p]);setText("");setMood("😊");setDate(td())};
  const todayEntry=journal.find(j=>j.date===td());
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div className="lc" style={{borderColor:"rgba(192,132,252,.2)"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#c084fc",marginBottom:10}}>📓 {todayEntry?"Agregar otra nota":"Entrada de hoy"}</div>
      <div style={{marginBottom:10}}>
        <label className="lfl">¿Cómo te sientes?</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
          {MOODS.map(m=><button key={m.e} onClick={()=>setMood(m.e)} title={m.l} style={{fontSize:22,background:mood===m.e?"rgba(192,132,252,.2)":"transparent",border:mood===m.e?".5px solid #c084fc":".5px solid transparent",borderRadius:8,padding:5,cursor:"pointer",width:40,height:40}}>{m.e}</button>)}
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <label className="lfl">Reflexión del día</label>
        <textarea className="lfi" rows={3} placeholder="¿Qué pasó hoy? ¿Qué aprendiste? ¿Por qué estás agradecido?" value={text} onChange={e=>setText(e.target.value)} style={{resize:"none",lineHeight:1.6}}/>
      </div>
      <div style={{marginBottom:10}}><label className="lfl">Fecha</label><input className="lfi" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      <button className="lbp" style={{width:"100%",justifyContent:"center",background:"#c084fc"}} onClick={save}><span>✓</span> Guardar entrada</button>
    </div>
    {journal.length===0&&<Mpty msg="Sin entradas" sub="Escribe tu primera reflexión"/>}
    {journal.slice(0,15).map(j=>(
      <div key={j.id} className="lc" style={{borderColor:"rgba(192,132,252,.1)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontSize:22}}>{j.mood}</span><div><div style={{fontSize:10,color:"#c084fc",fontWeight:700}}>{fd(j.date)}</div><div style={{fontSize:9,color:"#444"}}>{MOODS.find(m=>m.e===j.mood)?.l||""}</div></div></div>
          <button className="lbd" style={{padding:"2px 6px",fontSize:10}} onClick={()=>setJournal(p=>p.filter(x=>x.id!==j.id))}><span>🗑</span></button>
        </div>
        <div style={{fontSize:13,color:"#c0c0c0",lineHeight:1.6}}>{j.text}</div>
      </div>
    ))}
  </div>);
}

function CuerpoModule({ctx}){
  const[tab,setTab]=useState("entrenar");
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
      {[["entrenar","Entrenar"],["historial","Historial"],["planes","Mis planes"]].map(([id,l])=>(
        <button key={id} className={"pill"+(tab===id?" on":"")} onClick={()=>setTab(id)}>{l}</button>
      ))}
    </div>
    {tab==="entrenar" && <GymEntrenar ctx={ctx}/>}
    {tab==="historial"&& <GymHistorial ctx={ctx}/>}
    {tab==="planes"   && <GymPlanes ctx={ctx}/>}
  </div>);
}

/* ── Importar rutina pegando texto ── */
const MUSCLE_KW=[
  ["Pecho",/press\s+(inclinad|plano|banca|pecho)|apertura|cruce de polea|pec\s*deck(?!\s*invertid)|pullover en banca|fondos?\s+(de\s+)?pecho/i],
  ["Espalda",/jal[oó]n|remo|dominada|pull[\s-]*over|pullover|dorsal|t-?bar|gironda/i],
  ["Hombros",/elevaci[oó]n(es)?\s+lateral|p[aá]jaro|deltoid|press\s+militar|face\s*pull|pec\s*deck\s*invertid|posterior/i],
  ["Bíceps",/curl(?!\s*(de\s*)?(pierna|femoral))/i],
  ["Tríceps",/tr[ií]ceps|press\s+franc[eé]s|fondos|extensi[oó]n\s+de\s+tr/i],
  ["Glúteos",/hip\s*thrust|gl[uú]teo|patada/i],
  ["Piernas",/sentadilla|prensa|cu[aá]driceps|femoral|peso\s+muerto|zancada|lunge|pantorrilla|talones|b[uú]lgara|curl\s+(de\s+)?pierna|extensi[oó]n\s+de\s+cu/i],
  ["Core",/abdomen|abdominal|crunch|plancha|vacuum|vac[ií]o|ab\s*wheel|rueda|elevaci[oó]n\s+de\s+piernas/i],
  ["Cardio",/cardio|liss|caminadora|cuerda|trote|correr|bici|el[ií]ptica/i],
];
const EMOJI_BY={Pecho:"💪",Espalda:"💪",Hombros:"💪",Bíceps:"💪",Tríceps:"💪",Glúteos:"🍑",Piernas:"🦵",Core:"🔥",Cardio:"🏃"};
const guessMuscle=n=>{for(const[m,re]of MUSCLE_KW)if(re.test(n))return m;return "Otro"};
const DAY_RE=/(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/i;
const parseRoutineText=(text)=>{
  const lines=String(text||"").replace(/\u200b/g,"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const days=[];let planName="";let idc=Date.now();
  const mkEx=(rawName,sets,reps,rest)=>{
    let name=rawName.replace(/^[\s\-•*–—]*\d+[.)]\s*/,"").replace(/^[\s\-•*–—]+/,"").replace(/[.:;]+$/,"").trim();
    name=name.replace(/\s{2,}/g," ");
    if(!name||name.length<3)return null;
    if(name.length>70)name=name.slice(0,70);
    const muscle=guessMuscle(name);
    return{id:idc++,name,muscle,emoji:EMOJI_BY[muscle]||"💪",tSets:sets||3,tReps:reps||"10",rest:rest||""};
  };
  for(const raw of lines){
    const line=raw.replace(/^[📌🗓️🔥🏃‍♂️🏃⚔️•\s]+/,"").trim();
    if(!line)continue;
    const hasSpec=/\d+\s*series?\s*[x×]/i.test(line)||/\(\s*\d+\s*[x×]\s*\d/i.test(line)||/:\s*\d+\s*[x×]\s*\d/.test(line);
    const isDay=!hasSpec&&(DAY_RE.test(line)||/^(d[ií]a|day)\s*\d/i.test(line))&&line.length<90;
    if(isDay){
      let nm=line.replace(/^.*?:\s*/,m=>/^(d[ií]a\s*\d+|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*:/i.test(m)?"":m).trim();
      nm=line.includes(":")?line.split(":").slice(1).join(":").trim()||line.trim():line.trim();
      const dayWord=(line.match(DAY_RE)||[])[0];
      days.push({label:"Día "+(days.length+1),name:(nm+(dayWord&&!nm.toLowerCase().includes(dayWord.toLowerCase())?" ("+dayWord.charAt(0).toUpperCase()+dayWord.slice(1).toLowerCase()+")":"")).replace(/\s{2,}/g," ").trim(),exercises:[]});
      continue;
    }
    if(!hasSpec){
      // Cardio sin series: "Cardio LISS: 15 min en caminadora"
      if(/cardio|liss|caminadora/i.test(line)&&days.length){
        const mins=(line.match(/(\d+)\s*min/i)||[])[1];
        const ex=mkEx(line.split(":")[0],1,(mins||"15")+" min",(line.match(/\(([^)]*bpm[^)]*)\)/i)||[])[1]||"");
        if(ex)days[days.length-1].exercises.push(ex);
      }else if(!days.length&&!planName&&line.length<70&&!/^(esquema|objetivo|descanso|recordatorio|opci[oó]n)/i.test(line))planName=line;
      continue;
    }
    if(!days.length)days.push({label:"Día 1",name:"Día 1",exercises:[]});
    const day=days[days.length-1];
    // Superseries: "A (3x10) + B (3x12)"
    const parts=/\)\s*\+\s*/.test(line)?line.split(/\s*\+\s*(?=[A-ZÁÉÍÓÚÑa-z])/):[line];
    for(const part0 of parts){
      let part=part0.trim();
      part=part.replace(/^superserie[^:]*:\s*/i,"");
      const spec=part.match(/(\d+)\s*series?\s*[x×]\s*([\d]+(?:\s*[-–]\s*\d+)?)/i)||part.match(/\(\s*(\d+)\s*[x×]\s*([\d]+(?:\s*[-–]\s*\d+)?)/i)||part.match(/:\s*(\d+)\s*[x×]\s*([\d]+(?:\s*[-–]\s*\d+)?)/);
      if(!spec)continue;
      const sets=+spec[1];const reps=spec[2].replace(/\s*[-–]\s*/,"-");
      let name=part.slice(0,spec.index);
      if(name.includes(":")){
        const segs=name.split(":");
        const tail=segs[segs.length-1].replace(/\($/,"").trim();
        name=tail.length>=4?tail:segs.slice(0,-1).join(":");
      }
      name=name.replace(/\($/,"").trim();
      if(!name)name=part.split(/[:(]/)[0];
      const after=part.slice(spec.index);
      let rest=(after.match(/descanso[:\s]*([^)]+)\)/i)||[])[1]||"";
      if(!rest){const r2=after.match(/\(([^)]*(?:min|seg|rir|pausa|dropset|bpm)[^)]*)\)/i);rest=r2?r2[1]:""}
      rest=rest.replace(/^\s*descanso[:\s]*/i,"").trim();
      const ex=mkEx(name,sets,reps,rest);
      if(ex)day.exercises.push(ex);
    }
  }
  const valid=days.filter(d=>d.exercises.length>0).map((d,i)=>({...d,label:"Día "+(i+1)}));
  return{name:planName||"Rutina importada",daysPerWeek:valid.length,days:valid};
};

/* ── PLANES: 5 o 4 días por semana ── */
function RoutineImport({ctx,onImported}){
  const[open,setOpen]=useState(false);
  const[txt,setTxt]=useState("");
  const[prev,setPrev]=useState(null);
  const[err,setErr]=useState("");
  const[name,setName]=useState("");
  const analizar=()=>{
    const r=parseRoutineText(txt);
    if(!r.days.length){setErr("No reconocí ejercicios. Asegúrate de que cada ejercicio traiga algo como \"3 series x 8-10\" y que los días digan \"Lunes:\", \"Día 1:\", etc.");setPrev(null);return}
    setErr("");setName(r.name);setPrev(r);
  };
  const guardar=()=>{
    if(!prev)return;
    const pl={id:Date.now(),seedV:99,name:(name.trim()||prev.name),daysPerWeek:prev.daysPerWeek,days:prev.days};
    onImported(pl);
    setOpen(false);setTxt("");setPrev(null);setName("");
  };
  if(!open)return(
    <div className="card" onClick={()=>setOpen(true)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:22}}>📋</span>
      <div style={{flex:1}}>
        <div style={{fontSize:14,fontWeight:600}}>Importar rutina pegando texto</div>
        <div style={{fontSize:11,color:"#8b8f96",marginTop:2}}>Pega la rutina que te pasen y la convierto en un plan</div>
      </div>
      <span style={{color:"#6e727a"}}>›</span>
    </div>
  );
  return(<div className="card" style={{borderColor:"rgba(255,159,69,.35)"}}>
    <div className="sect" style={{justifyContent:"space-between"}}><span>📋 Importar rutina</span><button className="lbs" style={{padding:"3px 9px",fontSize:11}} onClick={()=>{setOpen(false);setPrev(null);setErr("")}}>✕</button></div>
    {!prev?<>
      <div style={{fontSize:11,color:"#8b8f96",marginBottom:8,lineHeight:1.6}}>Pega el texto tal cual. Reconoce formatos como:<br/><span style={{color:"#6e727a"}}>📌 Martes: Torso A<br/>Press inclinado con mancuernas: 4 series x 8-10 reps (Descanso: 2 min)</span></div>
      <textarea className="lfi" value={txt} onChange={e=>setTxt(e.target.value)} placeholder="Pega aquí tu rutina completa..." style={{height:170,fontSize:13,lineHeight:1.5,resize:"vertical"}}/>
      {err&&<div style={{fontSize:11,color:"#ff6b6b",marginTop:8,lineHeight:1.5}}>{err}</div>}
      <button className="lbp" style={{marginTop:10,width:"100%",justifyContent:"center",background:"#ff9f45"}} onClick={analizar} disabled={!txt.trim()}>Analizar rutina</button>
    </>:<>
      <div style={{marginBottom:10}}>
        <label className="lfl">Nombre del plan</label>
        <input className="lfi" value={name} onChange={e=>setName(e.target.value)} placeholder="Mi rutina"/>
      </div>
      <div style={{fontSize:12,color:"#30d158",marginBottom:10}}>✓ Encontré {prev.daysPerWeek} días y {prev.days.reduce((a,d)=>a+d.exercises.length,0)} ejercicios</div>
      <div style={{display:"flex",flexDirection:"column",gap:9,maxHeight:320,overflowY:"auto"}}>
        {prev.days.map((d,di)=>(
          <div key={di} style={{background:"#0b0c0e",borderRadius:11,padding:"10px 12px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#ff9f45",marginBottom:6}}>{d.label} · {d.name}</div>
            {d.exercises.map((ex,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                <span style={{fontSize:13}}>{ex.emoji}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ex.name}</div>
                  <div className="lmn" style={{fontSize:10,color:"#6e727a"}}>{ex.tSets}×{ex.tReps}{ex.rest?" · "+ex.rest:""} · {ex.muscle}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <button className="lbp" style={{flex:1,justifyContent:"center",background:"#ff9f45"}} onClick={guardar}>✓ Guardar como plan</button>
        <button className="lbs" onClick={()=>setPrev(null)}>Volver</button>
      </div>
      <div style={{fontSize:10,color:"#6e727a",marginTop:8}}>Después puedes reordenar o corregir ejercicios editando el plan.</div>
    </>}
  </div>);
}

function GymPlanes({ctx}){
  const{plans,setPlans,activePlanId,setActivePlanId}=ctx;
  const[form,setForm]=useState(null);
  const[editDay,setEditDay]=useState(null);
  const[showAdd,setShowAdd]=useState(false);
  const[custom,setCustom]=useState({name:"",muscle:"Pecho",emoji:"💪"});
  const DAYS_LABELS=["Día 1","Día 2","Día 3","Día 4","Día 5"];

  const newPlan=(nDays)=>{
    setForm({name:"",daysPerWeek:nDays,days:Array.from({length:nDays},(_,i)=>({label:DAYS_LABELS[i],name:"",exercises:[]}))});
  };
  const save=()=>{
    if(!form?.name?.trim())return;
    const p={...form,id:form.id||Date.now()};
    setPlans(prev=>form.id?prev.map(x=>x.id===p.id?p:x):[...prev,p]);
    if(!activePlanId)setActivePlanId(p.id);
    setForm(null);setEditDay(null);
  };
  const toggleEx=(dayIdx,ex)=>{
    setForm(f=>{
      const days=[...f.days];
      const d={...days[dayIdx]};
      d.exercises=d.exercises.find(e=>e.id===ex.id)?d.exercises.filter(e=>e.id!==ex.id):[...d.exercises,ex];
      days[dayIdx]=d;
      return{...f,days};
    });
  };
  const moveEx=(dayIdx,i,dir)=>{
    setForm(f=>{
      const days=[...f.days];const d={...days[dayIdx]};const ex=[...d.exercises];
      const j=i+dir;if(j<0||j>=ex.length)return f;
      [ex[i],ex[j]]=[ex[j],ex[i]];d.exercises=ex;days[dayIdx]=d;return{...f,days};
    });
  };
  const addCustom=(dayIdx)=>{
    if(!custom.name)return;
    const ex={id:Date.now(),...custom};
    toggleEx(dayIdx,ex);
    setCustom({name:"",muscle:"Pecho",emoji:"💪"});setShowAdd(false);
  };

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {/* Importar rutina pegando texto */}
    {!form&&<RoutineImport ctx={ctx} onImported={pl=>{setPlans(prev=>[...prev,pl]);if(!activePlanId)setActivePlanId(pl.id)}}/>}

    {/* Crear nuevo plan según días */}
    {!form&&<div className="lc" style={{borderColor:"rgba(249,115,22,.2)"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#f97316",marginBottom:4}}>➕ Crear plan de entrenamiento</div>
      <div style={{fontSize:11,color:"#555",marginBottom:10}}>Elige según cuántos días puedas entrenar esa semana</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[[5,"🔥","Semana fuerte"],[4,"💪","Semana normal"]].map(([n,e,l])=>(
          <button key={n} onClick={()=>newPlan(n)} style={{padding:"14px 8px",border:".5px solid rgba(249,115,22,.3)",borderRadius:11,cursor:"pointer",background:"#080808",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <span style={{fontSize:22}}>{e}</span>
            <span style={{fontSize:16,fontWeight:700,color:"#f97316"}}>{n} días</span>
            <span style={{fontSize:9,color:"#555"}}>{l}</span>
          </button>
        ))}
      </div>
    </div>}

    {/* Form de plan */}
    {form&&<div className="lc" style={{borderColor:"rgba(249,115,22,.35)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:700,color:"#f97316"}}>{form.id?"Editar":"Nuevo"} plan · {form.daysPerWeek} días/semana</div>
        <button className="lbs" style={{fontSize:10,padding:"3px 8px"}} onClick={()=>{setForm(null);setEditDay(null)}}>✕ Cerrar</button>
      </div>
      <div style={{marginBottom:12}}><label className="lfl">Nombre del plan</label><input className="lfi" placeholder={form.daysPerWeek===5?"PPL + Upper/Lower":"Upper/Lower x2"} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>

      {/* Días del plan */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {form.days.map((day,di)=>(
          <div key={di} style={{background:"#080808",borderRadius:10,padding:"10px 12px",border:`.5px solid ${editDay===di?"#f97316":"rgba(255,255,255,.06)"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                <span style={{fontSize:11,fontWeight:700,color:"#f97316",flexShrink:0}}>{day.label}</span>
                <input className="lfi" placeholder="Ej: Pecho y tríceps" value={day.name} onChange={e=>{const days=[...form.days];days[di]={...days[di],name:e.target.value};setForm({...form,days})}} style={{fontSize:12,padding:"5px 8px"}}/>
              </div>
              <button className="lbs" style={{fontSize:10,padding:"4px 8px",flexShrink:0}} onClick={()=>setEditDay(editDay===di?null:di)}>
                {day.exercises.length} ej. {editDay===di?"▲":"▼"}
              </button>
            </div>
            {day.exercises.length>0&&editDay!==di&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:8}}>
              {day.exercises.map(ex=><span key={ex.id} style={{fontSize:10,padding:"2px 7px",background:"rgba(249,115,22,.1)",borderRadius:5,color:"#f97316"}}>{ex.emoji} {ex.name}</span>)}
            </div>}
            {editDay===di&&<div style={{marginTop:10}}>
              {day.exercises.length>0&&<div style={{marginBottom:14}}>
                <label className="lfl">Orden de la sesión · usa ↑ ↓ para acomodar</label>
                <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:5}}>
                  {day.exercises.map((ex,ei)=>(
                    <div key={ex.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"#0b0c0e",borderRadius:10,border:"1px solid rgba(255,255,255,.06)"}}>
                      <span className="lmn" style={{fontSize:11,color:"#ff9f45",fontWeight:700,minWidth:16}}>{ei+1}</span>
                      <span style={{fontSize:14}}>{ex.emoji||"💪"}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ex.name}</div>
                        {ex.tSets&&<div className="lmn" style={{fontSize:10,color:"#6e727a"}}>{ex.tSets}×{ex.tReps}</div>}
                      </div>
                      <button className="lbs" style={{padding:"4px 8px",fontSize:12,opacity:ei===0?.3:1}} disabled={ei===0} onClick={()=>moveEx(di,ei,-1)}>↑</button>
                      <button className="lbs" style={{padding:"4px 8px",fontSize:12,opacity:ei===day.exercises.length-1?.3:1}} disabled={ei===day.exercises.length-1} onClick={()=>moveEx(di,ei,1)}>↓</button>
                      <button className="lbd" style={{padding:"4px 7px"}} onClick={()=>toggleEx(di,ex)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>}
              <label className="lfl">Agregar ejercicios del catálogo</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:5,marginTop:5,maxHeight:180,overflowY:"auto"}}>
                {DEF_EX.map(ex=>{const s2=day.exercises.find(e=>e.id===ex.id);return(
                  <button key={ex.id} onClick={()=>toggleEx(di,ex)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 8px",border:`.5px solid ${s2?"#f97316":"rgba(255,255,255,.06)"}`,borderRadius:8,cursor:"pointer",background:s2?"rgba(249,115,22,.12)":"#0f0f0f",fontFamily:"inherit",textAlign:"left"}}>
                    <span style={{fontSize:14}}>{ex.emoji}</span><div><div style={{fontSize:10,fontWeight:s2?700:400,color:s2?"#f97316":"#f0f0f0"}}>{ex.name}</div><div style={{fontSize:8,color:"#444"}}>{ex.muscle}</div></div>
                  </button>
                )})}
                {day.exercises.filter(e=>!DEF_EX.find(d=>d.id===e.id)).map(ex=>(
                  <button key={ex.id} onClick={()=>toggleEx(di,ex)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 8px",border:".5px solid #f97316",borderRadius:8,cursor:"pointer",background:"rgba(249,115,22,.12)",fontFamily:"inherit",textAlign:"left"}}>
                    <span style={{fontSize:14}}>{ex.emoji}</span><div><div style={{fontSize:10,fontWeight:700,color:"#f97316"}}>{ex.name}</div><div style={{fontSize:8,color:"#444"}}>{ex.muscle}</div></div>
                  </button>
                ))}
              </div>
              {!showAdd?<button className="lbs" style={{fontSize:10,marginTop:8}} onClick={()=>setShowAdd(true)}>+ Ejercicio personalizado</button>:
              <div style={{padding:8,background:"#0f0f0f",borderRadius:8,marginTop:8}}>
                <div className="lr"><div><input className="lfi" value={custom.name} onChange={e=>setCustom({...custom,name:e.target.value})} placeholder="Nombre..." style={{fontSize:11}}/></div><div><select className="lfi" value={custom.muscle} onChange={e=>setCustom({...custom,muscle:e.target.value})} style={{fontSize:11}}>{MUSCLES.map(m=><option key={m}>{m}</option>)}</select></div></div>
                <div style={{display:"flex",gap:5,marginTop:6}}><button className="lbp" style={{background:"#f97316",fontSize:10,padding:"5px 10px"}} onClick={()=>addCustom(di)}>+ Agregar</button><button className="lbs" style={{fontSize:10,padding:"5px 10px"}} onClick={()=>setShowAdd(false)}>Cancelar</button></div>
              </div>}
            </div>}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:6,marginTop:12}}>
        <button className="lbp" style={{background:"#f97316"}} onClick={save} disabled={!form.name||form.days.every(d=>d.exercises.length===0)}>Guardar plan</button>
        <button className="lbs" onClick={()=>{setForm(null);setEditDay(null)}}>Cancelar</button>
        {form.id&&<button className="lbd" style={{marginLeft:"auto"}} onClick={()=>{setPlans(p=>p.filter(x=>x.id!==form.id));if(activePlanId===form.id)setActivePlanId(null);setForm(null)}}>🗑</button>}
      </div>
    </div>}

    {/* Lista de planes */}
    {plans.length===0&&!form&&<Mpty msg="Sin planes aún" sub="Crea tu primer plan de 5 o 4 días"/>}
    {plans.map(p=>{
      const isActive=activePlanId===p.id;
      return(<div key={p.id} className="lc" style={{borderColor:isActive?"rgba(249,115,22,.4)":"rgba(255,255,255,.06)",background:isActive?"rgba(249,115,22,.04)":"#0f0f0f"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:7}}>
              <div style={{fontSize:14,fontWeight:700}}>{p.name}</div>
              {isActive&&<span style={{fontSize:9,fontWeight:700,padding:"2px 8px",background:"#f97316",color:"#000",borderRadius:10}}>SEMANA ACTIVA</span>}
            </div>
            <div style={{fontSize:11,color:"#555",marginTop:2}}>{p.daysPerWeek} días/semana · {p.days.reduce((a,d)=>a+d.exercises.length,0)} ejercicios</div>
          </div>
          <div style={{display:"flex",gap:4}}>
            <button className="lbs" style={{padding:"3px 7px",fontSize:11}} onClick={()=>{setForm(p);setEditDay(null)}}>✏️</button>
            <button className="lbd" onClick={()=>{setPlans(prev=>prev.filter(x=>x.id!==p.id));if(activePlanId===p.id)setActivePlanId(null)}}>🗑</button>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
          {p.days.map((d,i)=>(
            <div key={i} style={{display:"flex",gap:8,fontSize:11,alignItems:"center"}}>
              <span style={{color:"#f97316",fontWeight:700,width:44,flexShrink:0}}>{d.label}</span>
              <span style={{color:"#f0f0f0",fontWeight:500}}>{d.name||"—"}</span>
              <span style={{color:"#444"}}>· {d.exercises.length} ej.</span>
            </div>
          ))}
        </div>
        {!isActive&&<button className="lbp" style={{width:"100%",justifyContent:"center",background:"#f97316",fontSize:12}} onClick={()=>setActivePlanId(p.id)}>📌 Usar esta semana</button>}
      </div>);
    })}
  </div>);
}

/* ── ENTRENAR: sesión del día con registro de pesos/reps ── */
function GymEntrenar({ctx}){
  const{plans,activePlanId,wkLogs,setWkLogs,gymDraft,setGymDraft}=ctx;
  const plan=plans.find(p=>p.id===activePlanId);
  const draftMatch=gymDraft&&gymDraft.planId===activePlanId?gymDraft:null;
  const[dayIdx,setDayIdx]=useState(draftMatch?draftMatch.dayIdx:null);
  const[sets,setSets]=useState(draftMatch?draftMatch.sets:{});
  const restored=useRef(!!draftMatch);

  // Autoguarda el entreno en curso (peso/reps) para sobrevivir si Android cierra la app en segundo plano
  useEffect(()=>{
    if(dayIdx===null)return;
    setGymDraft({planId:activePlanId,dayIdx,sets,ts:Date.now()});
  },[dayIdx,sets]);

  // Buscar el último registro de cada ejercicio para mostrar referencia
  const lastFor=(exName)=>{
    for(let i=wkLogs.length-1;i>=0;i--){
      const found=(wkLogs[i].exercises||[]).find(e=>e.name===exName&&e.sets?.length>0);
      if(found){const best=found.sets.reduce((a,s)=>(+s.weight||0)>(+a.weight||0)?s:a,found.sets[0]);return{date:wkLogs[i].date,reps:best.reps,weight:best.weight}}
    }
    return null;
  };

  const lastSetsFor=(name)=>{
    for(let i=wkLogs.length-1;i>=0;i--){
      const ex=(wkLogs[i].exercises||[]).find(e=>e.name===name&&(e.sets||[]).some(s=>s.weight||s.reps));
      if(ex)return ex.sets.filter(s=>s.weight||s.reps).map(s=>({reps:s.reps||"",weight:s.weight||"",done:false}));
    }
    return null;
  };
  const start=(di)=>{
    setDayIdx(di);
    const init={};
    plan.days[di].exercises.forEach((ex,i)=>{
      const last=lastSetsFor(ex.name);
      const n=Math.max(ex.tSets||1,last?last.length:0);
      const fallback=last&&last.length>0?last[last.length-1]:null;
      init[i]=Array.from({length:n},(_,j)=>
        last&&last[j]?{...last[j],done:false}
        :fallback?{reps:fallback.reps,weight:fallback.weight,done:false}
        :{reps:"",weight:"",done:false});
    });
    setSets(init);
  };
  const addSet=i=>setSets(p=>({...p,[i]:[...(p[i]||[]),{reps:"",weight:"",done:false}]}));
  const updSet=(i,si,f,v)=>setSets(p=>({...p,[i]:p[i].map((s,idx)=>idx===si?{...s,[f]:v}:s)}));
  const toggleSet=(i,si)=>setSets(p=>({...p,[i]:p[i].map((s,idx)=>idx===si?{...s,done:!s.done}:s)}));
  const finish=()=>{
    const day=plan.days[dayIdx];
    const totalSets=Object.values(sets).reduce((a,arr)=>a+arr.filter(s=>s.done).length,0);
    const log={id:Date.now(),name:plan.name+" · "+day.label+(day.name?" ("+day.name+")":""),planId:plan.id,dayLabel:day.label,dayName:day.name,date:td(),exercises:day.exercises.map((ex,i)=>({name:ex.name,muscle:ex.muscle,sets:(sets[i]||[]).filter(s=>s.done)})),totalSets};
    setWkLogs(p=>[...p,log]);
    setDayIdx(null);setSets({});setGymDraft(null);
  };

  if(!plan)return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div className="lc" style={{borderColor:"rgba(249,115,22,.2)",textAlign:"center",padding:"24px 14px"}}>
      <div style={{fontSize:32,marginBottom:8}}>📋</div>
      <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>No hay plan activo</div>
      <div style={{fontSize:11,color:"#555",marginBottom:4}}>Ve a "Mis Planes", crea uno de 5 o 4 días y actívalo para esta semana</div>
    </div>
  </div>);

  // Días ya entrenados esta semana con este plan
  const weekStart=(()=>{const d=new Date();const dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow);d.setHours(0,0,0,0);return d})();
  const doneThisWeek=wkLogs.filter(w=>w.planId===plan.id&&new Date(w.date+"T12:00:00")>=weekStart).map(w=>w.dayLabel);

  if(dayIdx===null)return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{padding:"10px 14px",background:"rgba(249,115,22,.08)",border:".5px solid rgba(249,115,22,.3)",borderRadius:12}}>
      <div style={{fontSize:13,fontWeight:700,color:"#f97316"}}>📌 {plan.name}</div>
      <div style={{fontSize:11,color:"#555",marginTop:2}}>{plan.daysPerWeek} días/semana · {doneThisWeek.length}/{plan.daysPerWeek} completados esta semana</div>
      <div style={{height:4,background:"#161616",borderRadius:99,marginTop:8}}><div style={{height:"100%",width:`${(doneThisWeek.length/plan.daysPerWeek)*100}%`,background:"#f97316",borderRadius:99,transition:"width .5s"}}/></div>
    </div>
    <div style={{fontSize:10,color:"#444",textTransform:"uppercase",fontWeight:700}}>Elige el día de hoy</div>
    {plan.days.map((day,di)=>{
      const done=doneThisWeek.includes(day.label);
      return(<div key={di} onClick={()=>!done&&start(di)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",background:done?"rgba(0,255,135,.04)":"#0f0f0f",borderRadius:12,border:`.5px solid ${done?"rgba(0,255,135,.25)":"rgba(249,115,22,.15)"}`,cursor:done?"default":"pointer",opacity:done?.7:1}}>
        <div style={{width:42,height:42,borderRadius:11,background:done?"rgba(0,255,135,.15)":"rgba(249,115,22,.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{done?"✅":"🏋️"}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:done?"#00FF87":"#f0f0f0"}}>{day.label}{day.name?" · "+day.name:""}</div>
          <div style={{fontSize:10,color:"#555",marginTop:2}}>{day.exercises.length} ejercicios{done?" · ¡Completado esta semana!":""}</div>
        </div>
        {!done&&<span style={{fontSize:16,color:"#f97316"}}>▶</span>}
      </div>);
    })}
  </div>);

  const day=plan.days[dayIdx];
  const exDone=day.exercises.filter((_,i)=>(sets[i]||[]).some(s=>s.done)).length;
  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {restored.current&&<div style={{padding:"7px 12px",background:"rgba(0,255,135,.08)",border:".5px solid rgba(0,255,135,.3)",borderRadius:9,fontSize:11,color:"#00FF87"}}>🔄 Recuperamos tu entreno donde lo dejaste — nada se perdió</div>}
    <div style={{padding:"10px 14px",background:"rgba(249,115,22,.08)",border:".5px solid rgba(249,115,22,.3)",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{fontSize:13,fontWeight:700,color:"#f97316"}}>{day.label}{day.name?" · "+day.name:""}</div><div style={{fontSize:11,color:"#555"}}>{exDone}/{day.exercises.length} ejercicios</div></div>
      <div style={{display:"flex",gap:5}}>
        <button className="lbs" style={{fontSize:11}} onClick={()=>{setDayIdx(null);setSets({});setGymDraft(null)}}>✕</button>
        <button className="lbp" style={{background:"#00FF87",color:"#000",fontSize:12}} onClick={finish}>✓ Terminar</button>
      </div>
    </div>
    {day.exercises.map((ex,i)=>{
      const exSets=sets[i]||[];const anyD=exSets.some(s=>s.done);
      const last=lastFor(ex.name);
      return(<div key={i} className="lc" style={{borderColor:anyD?"rgba(249,115,22,.3)":"rgba(255,255,255,.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>{ex.emoji||"💪"}</span><div><div style={{fontSize:13,fontWeight:700}}>{ex.name}</div><div style={{fontSize:10,color:"#555"}}>{ex.muscle}{ex.tSets?<span style={{color:"#f97316",fontWeight:700}}> · {ex.tSets}×{ex.tReps}</span>:null}{ex.rest?<span style={{color:"#444"}}> · desc {ex.rest}</span>:null}</div></div></div>
          <button className="lbs" style={{fontSize:11,padding:"3px 8px"}} onClick={()=>addSet(i)}>+ Set</button>
        </div>
        {last&&<div style={{fontSize:10,color:"#FFB800",marginBottom:8,padding:"5px 9px",background:"rgba(255,183,0,.06)",borderRadius:7,border:".5px solid rgba(255,183,0,.2)"}}>
          📈 Última vez ({fd(last.date)}): <b>{last.weight||"?"} kg × {last.reps||"?"} reps</b> — intenta superarlo
        </div>}
        {exSets.map((s,si)=>(
          <div key={si} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:10,color:"#444",width:20,textAlign:"center",flexShrink:0}}>#{si+1}</div>
            <input className="lfi" type="number" inputMode="decimal" placeholder="kg" value={s.weight} onChange={e=>updSet(i,si,"weight",e.target.value)} style={{width:70,fontSize:12,padding:"5px 7px"}}/>
            <span style={{fontSize:10,color:"#444"}}>×</span>
            <input className="lfi" type="number" inputMode="numeric" placeholder="reps" value={s.reps} onChange={e=>updSet(i,si,"reps",e.target.value)} style={{width:70,fontSize:12,padding:"5px 7px"}}/>
            <button onClick={()=>toggleSet(i,si)} style={{width:28,height:28,borderRadius:"50%",border:`2px solid ${s.done?"#f97316":"rgba(255,255,255,.1)"}`,background:s.done?"#f97316":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {s.done&&<span style={{fontSize:12,color:"#000",fontWeight:700}}>✓</span>}
            </button>
          </div>
        ))}
      </div>);
    })}
  </div>);
}

/* ── PROGRESO: historial + evolución por ejercicio ── */
function GymHistorial({ctx}){
  const{wkLogs,setWkLogs}=ctx;
  const[selEx,setSelEx]=useState("");
  const[openW,setOpenW]=useState(null);
  const MN3=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const short=d=>{const x=new Date(d+"T12:00:00");return x.getDate()+" "+MN3[x.getMonth()]};
  const thisWeek=wkLogs.filter(w=>(Date.now()-new Date(w.date+"T12:00:00"))/86400000<=7).length;
  const totalSets=wkLogs.reduce((a,w)=>a+(w.totalSets||0),0);
  const allEx=[...new Set(wkLogs.flatMap(w=>(w.exercises||[]).filter(e=>(e.sets||[]).some(s=>s.weight||s.reps)).map(e=>e.name)))].sort();

  const series=selEx?wkLogs.filter(w=>(w.exercises||[]).find(e=>e.name===selEx&&(e.sets||[]).some(s=>s.weight||s.reps)))
    .map(w=>{const ex=w.exercises.find(e=>e.name===selEx);const ss=ex.sets.filter(s=>s.weight||s.reps);
      const best=ss.reduce((a,s)=>(+s.weight||0)>(+a.weight||0)?s:a,ss[0]);
      return{date:w.date,weight:+best.weight||0,reps:+best.reps||0,vol:ss.reduce((a,s)=>a+(+s.weight||0)*(+s.reps||0),0),sets:ss.length};})
    .sort((a,b)=>a.date.localeCompare(b.date)):[];
  const maxW=series.reduce((a,s)=>Math.max(a,s.weight),0);
  const minW=series.length?Math.min(...series.map(s=>s.weight)):0;
  const rng=(maxW-minW)||1;
  const first=series[0],last=series[series.length-1];
  const delta=series.length>=2?last.weight-first.weight:0;
  const prSession=series.reduce((a,s)=>s.weight>(a?.weight||0)?s:a,null);

  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9}}>
      {[[wkLogs.length,"Entrenos"],[thisWeek,"Esta semana"],[totalSets,"Sets totales"]].map(([v,l])=>(
        <div key={l} className="card" style={{padding:"13px 8px",textAlign:"center"}}>
          <div className="lmn" style={{fontSize:21,fontWeight:700,color:"#ff9f45"}}>{v}</div>
          <div style={{fontSize:11,color:"#6e727a",marginTop:3}}>{l}</div>
        </div>
      ))}
    </div>

    {allEx.length===0?<div className="card" style={{textAlign:"center",padding:"28px 16px"}}>
      <div style={{fontSize:30}}>📊</div>
      <div style={{fontSize:14,fontWeight:600,marginTop:8}}>Aún no hay historial</div>
      <div style={{fontSize:12,color:"#8b8f96",marginTop:4,lineHeight:1.5}}>Registra un entreno y aquí verás tu progreso de cada ejercicio, tus récords y la evolución de los pesos.</div>
    </div>:<>

    {/* Progreso por ejercicio */}
    <div className="card">
      <div className="sect">📈 Progreso por ejercicio</div>
      <select className="lfi" value={selEx} onChange={e=>setSelEx(e.target.value)}>
        <option value="">Elige un ejercicio...</option>
        {allEx.map(n=><option key={n} value={n}>{n}</option>)}
      </select>

      {selEx&&series.length>0&&<div style={{marginTop:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:9,marginBottom:14}}>
          <div style={{background:"#0b0c0e",borderRadius:11,padding:"11px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#6e727a"}}>🏆 Tu récord</div>
            <div className="lmn" style={{fontSize:17,fontWeight:700,color:"#FFB800",marginTop:2}}>{maxW}<span style={{fontSize:11}}>kg</span></div>
            {prSession&&<div style={{fontSize:9,color:"#6e727a",marginTop:2}}>{short(prSession.date)} · {prSession.reps} reps</div>}
          </div>
          <div style={{background:"#0b0c0e",borderRadius:11,padding:"11px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#6e727a"}}>Última vez</div>
            <div className="lmn" style={{fontSize:17,fontWeight:700,color:"#eceef1",marginTop:2}}>{last.weight}<span style={{fontSize:11}}>kg</span></div>
            <div style={{fontSize:9,color:"#6e727a",marginTop:2}}>{short(last.date)} · {last.reps} reps</div>
          </div>
          <div style={{background:"#0b0c0e",borderRadius:11,padding:"11px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#6e727a"}}>Progreso</div>
            <div className="lmn" style={{fontSize:17,fontWeight:700,color:delta>0?"#30d158":delta<0?"#ff6b6b":"#8b8f96",marginTop:2}}>{delta>0?"+":""}{delta}<span style={{fontSize:11}}>kg</span></div>
            <div style={{fontSize:9,color:"#6e727a",marginTop:2}}>{series.length} sesiones</div>
          </div>
        </div>

        {series.length>=2&&<>
          <div style={{fontSize:11,color:"#6e727a",marginBottom:7}}>Peso máximo por sesión</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:5,height:92,marginBottom:6}}>
            {series.slice(-14).map((s,i,arr)=>{
              const h=((s.weight-minW)/rng)*72+22;const isLast=i===arr.length-1;const isPr=s.weight===maxW;
              return(<div key={s.date+i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,height:"100%"}} title={short(s.date)+": "+s.weight+"kg × "+s.reps}>
                <div className="lmn" style={{fontSize:9,color:isPr?"#FFB800":"#6e727a",fontWeight:isPr?700:400}}>{s.weight}</div>
                <div style={{flex:1,width:"100%",display:"flex",alignItems:"flex-end"}}>
                  <div style={{width:"100%",height:h+"%",background:isPr?"#FFB800":isLast?"#ff9f45":"rgba(255,159,69,.4)",borderRadius:"4px 4px 0 0"}}/>
                </div>
                <div style={{fontSize:8,color:"#4d5158"}}>{short(s.date).split(" ")[0]}</div>
              </div>);
            })}
          </div>
        </>}

        <table className="ltbl" style={{marginTop:10}}>
          <thead><tr><th>Fecha</th><th>Mejor serie</th><th>Series</th><th>Volumen</th></tr></thead>
          <tbody>
            {[...series].reverse().slice(0,8).map((s,i)=>(
              <tr key={i}>
                <td style={{color:"#8b8f96"}}>{short(s.date)}</td>
                <td className="lmn" style={{fontWeight:600,color:s.weight===maxW?"#FFB800":"#eceef1"}}>{s.weight}kg × {s.reps}{s.weight===maxW?" 🏆":""}</td>
                <td className="lmn" style={{color:"#8b8f96"}}>{s.sets}</td>
                <td className="lmn" style={{color:"#8b8f96"}}>{s.vol.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>

    {/* Sesiones guardadas */}
    <div className="card">
      <div className="sect">🗂️ Sesiones guardadas</div>
      {[...wkLogs].reverse().slice(0,20).map(w=>{
        const open=openW===w.id;
        const exs=(w.exercises||[]).filter(e=>(e.sets||[]).some(s=>s.weight||s.reps));
        return(<div key={w.id} style={{borderBottom:"1px solid rgba(255,255,255,.05)",padding:"11px 0"}}>
          <div onClick={()=>setOpenW(open?null:w.id)} style={{display:"flex",alignItems:"center",gap:11,cursor:"pointer"}}>
            <div style={{textAlign:"center",minWidth:44}}>
              <div className="lmn" style={{fontSize:14,fontWeight:700,color:"#ff9f45"}}>{new Date(w.date+"T12:00:00").getDate()}</div>
              <div style={{fontSize:9,color:"#6e727a"}}>{MN3[new Date(w.date+"T12:00:00").getMonth()]}</div>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.name}</div>
              <div style={{fontSize:11,color:"#8b8f96",marginTop:2}}>{exs.length} ejercicios · {w.totalSets||0} series</div>
            </div>
            <span style={{color:"#6e727a",fontSize:13}}>{open?"▴":"▾"}</span>
          </div>
          {open&&<div style={{marginTop:9,paddingLeft:55}}>
            {exs.map((e,i)=>(
              <div key={i} style={{marginBottom:7}}>
                <div style={{fontSize:12,fontWeight:600,color:"#eceef1"}}>{e.name}</div>
                <div className="lmn" style={{fontSize:11,color:"#8b8f96",marginTop:2}}>{e.sets.filter(s=>s.weight||s.reps).map(s=>(s.weight||"?")+"kg × "+(s.reps||"?")).join("  ·  ")}</div>
              </div>
            ))}
            <button className="lbd" style={{marginTop:4}} onClick={()=>{if(confirm("¿Borrar esta sesión?"))setWkLogs(p=>p.filter(x=>x.id!==w.id))}}>🗑 Borrar sesión</button>
          </div>}
        </div>);
      })}
    </div>
    </>}
  </div>);
}

/* ══════════ COMIDAS ══════════ */
const SHOP_CATS=[{id:"prot",icon:"🥩",label:"Proteína"},{id:"carb",icon:"🍚",label:"Carbohidratos"},{id:"fruver",icon:"🥦",label:"Frutas y verduras"},{id:"lact",icon:"🥛",label:"Lácteos"},{id:"otro",icon:"🛒",label:"Otros"}];
const SHOP_BASE=[
  {name:"Huevos (2 cartones)",cat:"prot"},{name:"Claras de huevo",cat:"prot"},{name:"Pechuga de pollo 1kg",cat:"prot"},{name:"Bistec de res magro",cat:"prot"},{name:"Filete de pescado",cat:"prot"},{name:"Atún en agua (6 latas)",cat:"prot"},{name:"Proteína Whey",cat:"prot"},
  {name:"Avena en hojuelas 1kg",cat:"carb"},{name:"Arroz 1kg",cat:"carb"},{name:"Papa / camote",cat:"carb"},{name:"Tortillas de maíz",cat:"carb"},{name:"Pan integral",cat:"carb"},{name:"Tostadas horneadas",cat:"carb"},{name:"Granola baja en azúcar",cat:"carb"},
  {name:"Plátanos",cat:"fruver"},{name:"Fruta (sandía/melón/mango)",cat:"fruver"},{name:"Aguacate",cat:"fruver"},{name:"Ensalada verde (espinaca, lechuga)",cat:"fruver"},{name:"Jitomate y pepino",cat:"fruver"},{name:"Verduras para guarnición",cat:"fruver"},
  {name:"Yogur griego natural sin azúcar",cat:"lact"},{name:"Leche entera o deslactosada",cat:"lact"},
  {name:"Crema de cacahuate natural",cat:"otro"},{name:"Aceite de oliva",cat:"otro"},
];
function ShoppingList({ctx}){
  const{shopping,setShopping}=ctx;
  const[txt,setTxt]=useState("");const[cat,setCat]=useState("otro");
  const add=()=>{const n=txt.trim();if(!n)return;setShopping(p=>[...p,{id:Date.now(),name:n,cat,done:false}]);setTxt("")};
  const toggle=id=>setShopping(p=>p.map(x=>x.id===id?{...x,done:!x.done}:x));
  const del=id=>setShopping(p=>p.filter(x=>x.id!==id));
  const addBase=()=>{const have=new Set(shopping.map(s=>s.name.toLowerCase()));const add=SHOP_BASE.filter(b=>!have.has(b.name.toLowerCase())).map((b,i)=>({id:Date.now()+i,name:b.name,cat:b.cat,done:false}));if(add.length)setShopping(p=>[...p,...add])};
  const clearDone=()=>setShopping(p=>p.filter(x=>!x.done));
  const done=shopping.filter(s=>s.done).length;
  const byCat=SHOP_CATS.map(c=>({...c,items:shopping.filter(s=>s.cat===c.id)})).filter(c=>c.items.length>0);
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div className="card">
      <div className="sect" style={{justifyContent:"space-between"}}><span>🛒 Lista de compras</span>{shopping.length>0&&<span style={{color:"#6e727a",fontWeight:500}}>{done}/{shopping.length}</span>}</div>
      <div style={{display:"flex",gap:8}}>
        <input className="lfi" value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Agregar producto..." style={{flex:1}}/>
        <button className="lbp" style={{background:"#30d158"}} onClick={add}>+</button>
      </div>
      <div style={{display:"flex",gap:6,marginTop:9,flexWrap:"wrap"}}>
        {SHOP_CATS.map(c=><button key={c.id} onClick={()=>setCat(c.id)} style={{padding:"5px 10px",borderRadius:999,border:"1px solid "+(cat===c.id?"#30d158":"rgba(255,255,255,.08)"),background:cat===c.id?"rgba(48,209,88,.12)":"transparent",color:cat===c.id?"#30d158":"#6e727a",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{c.icon} {c.label}</button>)}
      </div>
      <div style={{display:"flex",gap:8,marginTop:11,flexWrap:"wrap"}}>
        <button className="lbs" style={{fontSize:12}} onClick={addBase}>📋 Agregar básicos de mi dieta</button>
        {done>0&&<button className="lbs" style={{fontSize:12}} onClick={clearDone}>🧹 Quitar comprados ({done})</button>}
      </div>
    </div>
    {shopping.length===0?<div className="card" style={{textAlign:"center",padding:"26px 16px"}}>
      <div style={{fontSize:28}}>🛒</div>
      <div style={{fontSize:14,fontWeight:600,marginTop:8}}>Tu lista está vacía</div>
      <div style={{fontSize:12,color:"#8b8f96",marginTop:4}}>Agrega productos o toca "Básicos de mi dieta" para llenarla de golpe.</div>
    </div>:byCat.map(c=>(
      <div key={c.id} className="card">
        <div className="sect">{c.icon} {c.label}</div>
        {c.items.map(it=>(
          <div key={it.id} className="row">
            <div onClick={()=>toggle(it.id)} className={"chk"+(it.done?" on":"")}>{it.done?"✓":""}</div>
            <div onClick={()=>toggle(it.id)} style={{flex:1,fontSize:14,textDecoration:it.done?"line-through":"none",opacity:it.done?.5:1}}>{it.name}</div>
            <button className="lbd" style={{padding:"3px 7px",flexShrink:0}} onClick={()=>del(it.id)}>✕</button>
          </div>
        ))}
      </div>
    ))}
  </div>);
}

function ComidasModule({ctx}){
  const[tab,setTab]=useState("hoy");
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
      {[["hoy","Plan de hoy"],["compras","🛒 Compras"],["peso","Mi peso"]].map(([id,l])=>(
        <button key={id} className={"pill"+(tab===id?" on":"")} onClick={()=>setTab(id)}>{l}</button>
      ))}
    </div>
    {tab==="hoy"&&<CuerpoNutricion ctx={ctx}/>}
    {tab==="compras"&&<ShoppingList ctx={ctx}/>}
    {tab==="peso"&&<PesoTab ctx={ctx}/>}
  </div>);
}

function PesoTab({ctx}){
  const{checkins,setCheckins}=ctx;
  const[w,setW]=useState("");
  const tod=td();
  const hist=[...checkins].filter(c=>c.weight>0).sort((a,b)=>a.date.localeCompare(b.date));
  const mn=hist.length?Math.min(...hist.map(c=>c.weight)):0,mx=hist.length?Math.max(...hist.map(c=>c.weight)):0;
  const rng=(mx-mn)||1;
  const last=hist[hist.length-1],first=hist[0];
  const diff=hist.length>=2?last.weight-first.weight:0;
  const MN3=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const save=()=>{const v=+w;if(!v)return;setCheckins(p=>{const ex=p.find(c=>c.date===tod);return ex?p.map(c=>c.date===tod?{...c,weight:v}:c):[...p,{date:tod,sleep:0,energy:0,weight:v}]});setW("")};
  return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
    <div className="card">
      <div className="sect">⚖️ Registrar peso de hoy</div>
      <div style={{display:"flex",gap:8}}>
        <input className="lfi" type="number" inputMode="decimal" step=".1" value={w} onChange={e=>setW(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()} placeholder={last?last.weight+" kg":"77.5"} style={{flex:1}}/>
        <button className="lbp" style={{background:"#30d158"}} onClick={save}>Guardar</button>
      </div>
    </div>
    {hist.length>0&&<div className="card">
      <div className="sect" style={{justifyContent:"space-between"}}><span>Evolución</span><span className="lmn" style={{color:"#30d158",fontWeight:700,fontSize:15}}>{last.weight} kg</span></div>
      {hist.length>=2&&<div style={{fontSize:12,color:"#8b8f96",marginBottom:11}}>Desde {new Date(first.date+"T12:00:00").getDate()+" "+MN3[new Date(first.date+"T12:00:00").getMonth()]}: <b style={{color:diff<0?"#30d158":diff>0?"#FFB800":"#8b8f96"}}>{diff>0?"+":""}{diff.toFixed(1)} kg</b> · {hist.length} registros</div>}
      {hist.length>=2&&<div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
        {hist.slice(-20).map((c,i,arr)=>{const h=((c.weight-mn)/rng)*72+22;return(
          <div key={c.date} style={{flex:1,height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end"}} title={c.date+": "+c.weight+"kg"}>
            <div style={{height:h+"%",background:i===arr.length-1?"#30d158":"rgba(48,209,88,.35)",borderRadius:"4px 4px 0 0"}}/>
          </div>)})}
      </div>}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#4d5158",marginTop:5}}><span>{mn.toFixed(1)} kg</span><span>{mx.toFixed(1)} kg</span></div>
    </div>}
  </div>);
}

function CuerpoNutricion({ctx}){
  const{nutriLog,setNutriLog,checkins}=ctx;
  const tod=td();
  const todayLog=nutriLog[tod]||{};
  const toggle=(mid)=>setNutriLog(p=>({...p,[tod]:{...(p[tod]||{}),[mid]:!(p[tod]||{})[mid]}}));
  const doneCount=NUTRI_MEALS.filter(m=>todayLog[m.id]).length;
  const eaten=NUTRI_MEALS.filter(m=>todayLog[m.id]).reduce((a,m)=>({kcal:a.kcal+m.kcal,p:a.p+m.p,c:a.c+m.c,f:a.f+m.f}),{kcal:0,p:0,c:0,f:0});
  const lastW=[...checkins].filter(c=>c.weight).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const weightHist=[...checkins].filter(c=>c.weight>0).sort((a,b)=>a.date.localeCompare(b.date));
  const wMin=weightHist.length?Math.min(...weightHist.map(c=>c.weight)):0;
  const wMax=weightHist.length?Math.max(...weightHist.map(c=>c.weight)):0;
  const wRange=(wMax-wMin)||1;
  const wFirst=weightHist[0],wLast=weightHist[weightHist.length-1];
  const wDiff=weightHist.length>=2?wLast.weight-wFirst.weight:0;

  const MACROS=[
    {l:"Calorías",v:NUTRI_TARGET.kcal,u:"kcal",c:"#FFB800",e:"🔥"},
    {l:"Proteína",v:NUTRI_TARGET.protein,u:"g",c:"#00FF87",e:"🥩"},
    {l:"Carbos",v:NUTRI_TARGET.carbs,u:"g",c:"#7ED8F6",e:"🍚"},
    {l:"Grasas",v:NUTRI_TARGET.fat,u:"g",c:"#f97316",e:"🥑"},
  ];

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    {/* Contador del día */}
    <div className="card">
      <div className="sect" style={{justifyContent:"space-between"}}><span>🔥 Calorías de hoy</span><span style={{color:"#6e727a",fontWeight:500}}>{doneCount}/{NUTRI_MEALS.length} comidas</span></div>
      <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
        <span className="lmn" style={{fontSize:30,fontWeight:700,color:eaten.kcal>NUTRI_TARGET.kcal?"#FFB800":"#30d158",letterSpacing:"-1px"}}>{eaten.kcal}</span>
        <span style={{fontSize:14,color:"#6e727a"}}>/ {NUTRI_TARGET.kcal} kcal</span>
        <span className="lmn" style={{marginLeft:"auto",fontSize:13,color:"#8b8f96"}}>{Math.max(0,NUTRI_TARGET.kcal-eaten.kcal)} restantes</span>
      </div>
      <div className="bar" style={{marginBottom:15}}><i style={{width:Math.min(100,eaten.kcal/NUTRI_TARGET.kcal*100)+"%",background:eaten.kcal>NUTRI_TARGET.kcal?"#FFB800":"#30d158"}}/></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:11}}>
        {[["Proteína",eaten.p,NUTRI_TARGET.protein,"#64b4f6","🥩"],["Carbos",eaten.c,NUTRI_TARGET.carbs,"#FFB800","🍚"],["Grasas",eaten.f,NUTRI_TARGET.fat,"#ff9f45","🥑"]].map(([l,v,t,col,ic])=>(
          <div key={l}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4}}>
              <span style={{fontSize:11,color:"#8b8f96"}}>{ic} {l}</span>
            </div>
            <div className="lmn" style={{fontSize:16,fontWeight:700,color:col}}>{v}<span style={{fontSize:10,color:"#6e727a",fontWeight:400}}>/{t}g</span></div>
            <div className="bar" style={{height:5,marginTop:5}}><i style={{width:Math.min(100,v/t*100)+"%",background:col}}/></div>
          </div>
        ))}
      </div>
      {doneCount===NUTRI_MEALS.length&&<div style={{marginTop:13,fontSize:13,color:"#30d158",fontWeight:600}}>✅ Plan del día completo · {eaten.p}g de proteína</div>}
      {lastW&&<div style={{marginTop:13,paddingTop:12,borderTop:"1px solid rgba(255,255,255,.06)",fontSize:12,color:"#8b8f96"}}>🎯 Recomposición corporal · último peso <b style={{color:"#30d158"}}>{lastW.weight} kg</b></div>}
    </div>

    <div className="lc" style={{borderColor:"rgba(255,183,0,.2)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,color:"#FFB800"}}>⏰ Horario de hoy</div>
        <div className="lmn" style={{fontSize:11,color:"#555"}}>{doneCount}/{NUTRI_MEALS.length}</div>
      </div>
      <div style={{height:5,background:"#161616",borderRadius:99,marginBottom:12}}><div style={{height:"100%",width:(doneCount/NUTRI_MEALS.length*100)+"%",background:"#FFB800",borderRadius:99,transition:"width .4s"}}/></div>
      {NUTRI_MEALS.map((m,i)=>{
        const done=!!todayLog[m.id];
        return(<div key={m.id} style={{marginBottom:i<NUTRI_MEALS.length-1?11:0,opacity:done?.55:1}}>
          <div onClick={()=>toggle(m.id)} style={{display:"flex",alignItems:"flex-start",gap:9,cursor:"pointer"}}>
            <div style={{width:19,height:19,borderRadius:6,border:"2px solid "+(done?"#FFB800":"#555"),background:done?"#FFB800":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
              {done&&<span style={{fontSize:11,color:"#000",fontWeight:700}}>✓</span>}
            </div>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:8,alignItems:"baseline"}}>
                <span className="lmn" style={{fontSize:10,color:"#FFB800",fontWeight:700}}>{m.time}</span>
                <span style={{fontSize:12,fontWeight:700,textDecoration:done?"line-through":"none"}}>{m.title}</span>
              </div>
              <div className="lmn" style={{fontSize:10,color:"#6e727a",marginTop:3}}>{m.kcal} kcal · {m.p}P · {m.c}C · {m.f}G</div>
              <ul style={{margin:"5px 0 0",paddingLeft:16}}>
                {m.items.map((it,j)=><li key={j} style={{fontSize:10,color:"#999",lineHeight:1.6}}>{it}</li>)}
              </ul>
            </div>
          </div>
        </div>);
      })}
    </div>

    {/* Regla 80/20 */}
    <div className="lc" style={{borderColor:"rgba(126,216,246,.2)"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#7ED8F6",marginBottom:8}}>🍦 Regla 80/20 · tu "gustito" sin culpa</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {[
          ["🔄","Intercambio directo","Si vas a comer algo pesado en la noche (pizza, postre), baja el arroz de las 12pm: de 1.5 tazas a media taza."],
          ["🏦","Banco de calorías","Deja fuera la crema de maní de la mañana y reduce tortillas en la tarde — ahorras ~200 kcal/día para el fin de semana."],
          ["🥩","Proteína intacta","Aunque te des el gusto, cumple siempre tu cuota de pollo, huevo o proteína del día."],
        ].map(([e,t,d])=>(
          <div key={t} style={{display:"flex",gap:9,padding:"8px 10px",background:"#080808",borderRadius:9}}>
            <span style={{fontSize:15}}>{e}</span>
            <div><div style={{fontSize:11,fontWeight:700,color:"#7ED8F6"}}>{t}</div><div style={{fontSize:10,color:"#999",lineHeight:1.5,marginTop:1}}>{d}</div></div>
          </div>
        ))}
      </div>
    </div>

    {/* Compra y batch cooking */}
    <div className="lc" style={{borderColor:"rgba(249,115,22,.2)"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#f97316",marginBottom:8}}>🛒 Compra económica y batch cooking</div>
      <div style={{fontSize:10,color:"#999",lineHeight:1.7}}>
        <b style={{color:"#f97316"}}>Proteínas baratas:</b> pechuga y carne molida en paquete grande/mayoreo.<br/>
        <b style={{color:"#f97316"}}>Carbos de combate:</b> arroz, avena, frijoles y tortillas de maíz — las fuentes más baratas y efectivas.<br/>
        <b style={{color:"#f97316"}}>Cocina para 3 días:</b> 1kg de arroz + 1kg de pechuga/carne los domingos y miércoles. Tuppers listos = 2 min de microondas entre trabajo y gym.
      </div>
    </div>
  </div>);
}

function GymIA({ctx}){
  const{wkLogs,plans,activePlanId,apiKey,setApiKey}=ctx;
  const[result,setResult]=useState("");
  const[loading,setLoading]=useState(false);
  const[keyInput,setKeyInput]=useState("");
  const plan=plans.find(p=>p.id===activePlanId);

  const analyze=async(mode)=>{
    if(!apiKey){alert("Conecta tu API Key primero");return}
    setLoading(true);setResult("");
    // Construir historial resumido de últimos 15 entrenos
    const recent=[...wkLogs].slice(-15).map(w=>({
      fecha:w.date,dia:w.name,
      ejercicios:(w.exercises||[]).filter(e=>e.sets?.length>0).map(e=>({
        nombre:e.name,
        sets:e.sets.map(s=>(s.weight||"?")+"kg x "+(s.reps||"?")+" reps")
      }))
    }));
    const planInfo=plan?{nombre:plan.name,dias:plan.daysPerWeek,estructura:plan.days.map(d=>d.label+": "+(d.name||"?")+" ["+d.exercises.map(e=>e.name).join(", ")+"]")}:null;
    const prompts={
      overload:"Analiza mi historial y dame recomendaciones ESPECÍFICAS de sobrecarga progresiva para cada ejercicio que he entrenado: qué peso y repeticiones debería intentar en mi PRÓXIMA sesión. Usa la regla de progresión doble (subir reps primero, luego peso). Sé concreto con números.",
      weak:"Analiza mi historial: ¿qué grupos musculares estoy descuidando? ¿Qué ejercicios se han estancado? Dame un diagnóstico honesto con recomendaciones.",
      plan:"Basándote en mi plan actual y mi progreso, ¿cómo mejorarías la estructura de mi semana de entrenamiento? Sugiere cambios concretos de ejercicios, orden o volumen."
    };
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,system:"Eres un entrenador personal experto en hipertrofia y fuerza. Respondes en español mexicano, directo y con números concretos. Historial de entrenamientos del usuario (más recientes al final): "+JSON.stringify(recent)+(planInfo?" | Plan actual: "+JSON.stringify(planInfo):" | Sin plan estructurado")+". Si no hay suficientes datos, dilo honestamente y da recomendaciones generales para empezar a registrar bien.",messages:[{role:"user",content:prompts[mode]}]})});
      const d=await r.json();
      if(d.error){setResult("Error: "+d.error.message);setLoading(false);return}
      setResult((d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n")||"Sin respuesta.");
    }catch(e){setResult("Error: "+e.message)}
    setLoading(false);
  };

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div className="lc" style={{borderColor:"rgba(249,115,22,.2)",background:"rgba(249,115,22,.03)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{fontSize:26}}>🧠</div>
        <div><div style={{fontSize:13,fontWeight:700,color:"#f97316"}}>IA de Sobrecarga Progresiva</div><div style={{fontSize:11,color:"#555",marginTop:2}}>Analiza tus {wkLogs.length} entrenos registrados y te dice exactamente qué peso/reps intentar</div></div>
      </div>
    </div>
    {!apiKey?(
      <div className="lc" style={{borderColor:"rgba(255,183,0,.3)"}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:8,color:"#FFB800"}}>Conecta tu API Key</div>
        <div style={{fontSize:11,color:"#555",marginBottom:10}}>La misma que usas en Coach IA (console.anthropic.com)</div>
        <input className="lfi" type="password" placeholder="sk-ant-..." value={keyInput} onChange={e=>setKeyInput(e.target.value)}/>
        <button className="lbp" style={{marginTop:8,width:"100%",justifyContent:"center",background:"#f97316"}} onClick={()=>{if(keyInput.startsWith("sk-"))setApiKey(keyInput.trim());else alert("Debe empezar con sk-ant-")}}>Conectar</button>
      </div>
    ):(<>
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:7}}>
        {[["overload","💪 Sugerir sobrecarga progresiva","Qué peso y reps intentar en tu próxima sesión, ejercicio por ejercicio"],["weak","🔍 Detectar puntos débiles","Músculos descuidados y ejercicios estancados"],["plan","📋 Optimizar mi plan semanal","Mejoras a la estructura de tu semana"]].map(([id,t,d])=>(
          <button key={id} onClick={()=>analyze(id)} disabled={loading} style={{textAlign:"left",padding:"12px 14px",border:".5px solid rgba(249,115,22,.25)",borderRadius:11,cursor:loading?"wait":"pointer",background:"#0f0f0f",fontFamily:"inherit",opacity:loading?.5:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#f97316"}}>{t}</div>
            <div style={{fontSize:10,color:"#555",marginTop:2}}>{d}</div>
          </button>
        ))}
      </div>
      {loading&&<div style={{display:"flex",alignItems:"center",gap:8,color:"#f97316",fontSize:12,padding:"10px"}}><span style={{animation:"pulse 1s infinite"}}>🧠</span> Analizando tu historial de entrenamientos...</div>}
      {result&&<div className="lc" style={{borderColor:"rgba(249,115,22,.3)"}}>
        <div style={{fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap",color:"#e0e0e0"}}>{result}</div>
        <button className="lbs" style={{fontSize:10,marginTop:10}} onClick={()=>setResult("")}>Limpiar</button>
      </div>}
      {wkLogs.length===0&&<div style={{fontSize:11,color:"#FFB800",padding:"8px 12px",background:"rgba(255,183,0,.05)",borderRadius:9,border:".5px solid rgba(255,183,0,.2)"}}>⚠️ Aún no tienes entrenos registrados. Registra al menos 2-3 sesiones para que la IA pueda darte sugerencias basadas en TU progreso real.</div>}
    </>)}
  </div>);
}

function CoachModule({ctx}){
  const{salary,products,trading,habits,comp,tasks,journal,medSess,wkLogs,routines,apiKey,setApiKey,mExp,mInc,totPort,totDebt,totSav,salMXN}=ctx;
  const[msgs,setMsgs]=useState([]);const[input,setInput]=useState("");const[loading,setLoading]=useState(false);const[keyInput,setKeyInput]=useState("");
  const endRef=useRef(null);
  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[msgs]);
  const tod=td();
  const todDone=habits.filter(h=>(comp[h.id]||{})[tod]).length;
  const medWeek=medSess.filter(s=>(Date.now()-new Date(s.date))/86400000<=7).length;
  const wkWeek=wkLogs.filter(w=>(Date.now()-new Date(w.date))/86400000<=7).length;
  const lastWk2=wkLogs.length>0?wkLogs[wkLogs.length-1]:null;
  const sys=()=>"Eres el Coach personal IA del usuario en su app LifeOS. Tienes acceso COMPLETO a su vida:\n\n"+
    "RESUMEN DEL MES:\n- Ingresos: "+M(mInc())+" | Gastos: "+M(mExp())+" | Balance: "+M(mInc()-mExp())+"\n\n"+
    "FINANZAS:\n- Patrimonio: "+M(totPort)+" | Ahorros: "+M(totSav)+" | Deuda tarjetas: "+M(totDebt)+"\n- Salario: "+(salary.amount?M(salMXN())+"/mes":"No configurado")+"\n- Productos que vende: "+(products.map(p=>p.name+" (margen "+M(p.salePrice-p.cost)+")").join(", ")||"Ninguno")+"\n- Cuenta trading: $"+trading.balance+" "+trading.currency+"\n\n"+
    "HÁBITOS:\n- "+habits.length+" hábitos: "+(habits.map(h=>h.name+" (racha "+getStreak(comp,h.id)+"d)").join(", ")||"Ninguno")+"\n- Completados hoy: "+todDone+"/"+habits.length+"\n\n"+
    "TAREAS:\n- Pendientes: "+tasks.filter(t=>!t.completed).length+" ("+tasks.filter(t=>!t.completed).slice(0,5).map(t=>t.text).join("; ")+")\n- Completadas este mes: "+tasks.filter(t=>t.completed&&t.completedAt?.startsWith(tod.slice(0,7))).length+"\n\n"+
    "MENTE:\n- Meditaciones esta semana: "+medWeek+" | Total: "+medSess.length+" sesiones\n- Journal: "+journal.length+" entradas | Último ánimo: "+(journal[0]?.mood||"Sin registro")+"\n\n"+
    "CUERPO:\n- Rutinas: "+routines.map(r=>r.name).join(", ")+"\n- Último entreno: "+(lastWk2?lastWk2.name+" el "+fd(lastWk2.date):"Ninguno")+"\n- Entrenos esta semana: "+wkWeek+"\n\n"+
    "Responde SIEMPRE en español mexicano. Sé motivador, directo y honesto. Puedes buscar en internet cuando sea útil. Da consejos basados en los datos REALES del usuario. Sé conciso pero completo.";
  const QUICK=["¿Cómo voy en general? Análisis completo","¿Cuáles son mis áreas de mejora?","Crea mi plan para esta semana","¿Cómo gano más con mis ventas?","¿Pago deuda o invierto primero?","Sugiéreme una rutina de gym nueva","Analiza mis gastos del mes","Dame 3 acciones concretas para hoy"];
  const send=async()=>{
    if(!input.trim()||loading)return;
    if(!apiKey){alert("Ingresa tu API Key primero");return}
    const msg=input.trim();setInput("");
    const updated=[...msgs,{role:"user",content:msg}];setMsgs(updated);setLoading(true);
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1200,system:sys(),messages:updated.map(m=>({role:m.role,content:m.content})),tools:[{type:"web_search_20250305",name:"web_search"}]})});
      const d=await r.json();
      if(d.error){setMsgs([...updated,{role:"assistant",content:"Error: "+d.error.message}]);setLoading(false);return}
      const txt=(d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n")||"Sin respuesta.";
      setMsgs([...updated,{role:"assistant",content:txt}]);
    }catch(e){setMsgs([...updated,{role:"assistant",content:"Error: "+e.message}])}
    setLoading(false);
  };
  return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div className="lc" style={{borderColor:"rgba(255,183,0,.2)",background:"rgba(255,183,0,.03)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{fontSize:28}}>🤖</div>
        <div><div style={{fontSize:14,fontWeight:700,color:"#FFB800"}}>Tu Coach Personal</div><div style={{fontSize:11,color:"#555",marginTop:2}}>Conoce toda tu vida: finanzas, hábitos, gym, mente</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:10}}>
        {[[todDone+"/"+habits.length,"Hábitos","#00FF87"],[M(mInc()-mExp()).replace(" MXN",""),"Balance","#7ED8F6"],[medWeek,"Meditac.","#c084fc"],[wkWeek,"Entrenos","#f97316"]].map(([v,l,c])=>(
          <div key={l} style={{background:"#0a0a0a",borderRadius:8,padding:"7px",textAlign:"center"}}><div className="lmn" style={{fontSize:13,fontWeight:700,color:c}}>{v}</div><div style={{fontSize:9,color:"#444"}}>{l}</div></div>
        ))}
      </div>
    </div>
    {!apiKey?(
      <div className="lc" style={{borderColor:"rgba(255,183,0,.3)"}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:"#FFB800"}}>Conectar Coach IA</div>
        <div style={{fontSize:11,color:"#555",marginBottom:12,lineHeight:1.7}}>
          Necesitas una API Key de Anthropic:<br/>
          <b style={{color:"#c084fc"}}>1.</b> Ve a <b style={{color:"#7ED8F6"}}>console.anthropic.com</b><br/>
          <b style={{color:"#c084fc"}}>2.</b> API Keys → Create Key<br/>
          <b style={{color:"#c084fc"}}>3.</b> Pégala abajo (se guarda en tu dispositivo)
        </div>
        <label className="lfl">API Key</label>
        <input className="lfi" type="password" placeholder="sk-ant-..." value={keyInput} onChange={e=>setKeyInput(e.target.value)}/>
        <button className="lbp" style={{marginTop:10,width:"100%",justifyContent:"center",background:"#FFB800"}} onClick={()=>{if(keyInput.startsWith("sk-"))setApiKey(keyInput.trim());else alert("La key debe empezar con sk-ant-...")}}>
          <span>✓</span> Conectar
        </button>
      </div>
    ):(<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,padding:"6px 10px",background:"rgba(0,255,135,.05)",borderRadius:9,border:".5px solid rgba(0,255,135,.2)"}}>
        <span style={{color:"#00FF87"}}>✓ Coach conectado · contexto completo</span>
        <button className="lbs" style={{fontSize:10,padding:"2px 7px"}} onClick={()=>setApiKey("")}>Cambiar key</button>
      </div>
      {msgs.length===0&&(<div>
        <div style={{textAlign:"center",padding:"12px 0 10px"}}>
          <div style={{fontSize:30,marginBottom:6}}>🤖</div>
          <div style={{fontWeight:700,fontSize:13,marginBottom:3}}>Tu CFO + Coach + Entrenador</div>
          <div style={{fontSize:11,color:"#555"}}>Pregúntale lo que sea sobre tu vida</div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {QUICK.map(q=><button key={q} className="lbs" style={{fontSize:11,padding:"6px 10px"}} onClick={()=>setInput(q)}>{q}</button>)}
        </div>
      </div>)}
      {msgs.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:380,overflowY:"auto",padding:"2px 0"}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"85%",padding:"9px 12px",borderRadius:12,fontSize:12,lineHeight:1.65,background:m.role==="user"?"#FFB800":"#0f0f0f",color:m.role==="user"?"#000":"#f0f0f0",border:m.role==="assistant"?".5px solid rgba(255,255,255,.07)":"none",whiteSpace:"pre-wrap"}}>{m.content}</div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",alignItems:"center",gap:6,color:"#444",fontSize:11}}><span>💭</span> Analizando tu vida completa...</div>}
        <div ref={endRef}/>
      </div>}
      <div style={{display:"flex",gap:7,alignItems:"flex-end"}}>
        <textarea className="lfi" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Pregunta sobre tu vida, finanzas, gym..." style={{resize:"none",minHeight:44,maxHeight:100,flex:1,lineHeight:1.5}}/>
        <button className="lbp" onClick={send} disabled={loading} style={{height:44,flexShrink:0,background:"#FFB800",padding:"0 14px",opacity:loading?.5:1}}><span>➤</span></button>
      </div>
      {msgs.length>0&&<button className="lbs" style={{fontSize:10,alignSelf:"flex-start"}} onClick={()=>setMsgs([])}><span>🗑</span> Limpiar chat</button>}
    </>)}
  </div>);
}

/* ── Pregunta IA por módulo ── */
function AskIA({ctx,module}){
  const{apiKey,setApiKey,habits,comp,tasks,journal,medSess,wkLogs,plans,activePlanId,salary,products,trading,mExp,mInc,totPort,totDebt,totSav,salMXN}=ctx;
  const[open,setOpen]=useState(false);
  const[msgs,setMsgs]=useState([]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[keyInput,setKeyInput]=useState("");
  const endRef=useRef(null);
  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[msgs]);
  const tod=td();
  const NAMES={home:"toda tu vida",fin:"tus finanzas",hab:"tus hábitos y tareas",mente:"tu mente y bienestar",cuerpo:"tu entrenamiento"};
  const COLORS2={home:"#efefef",fin:"#7ED8F6",hab:"#00FF87",mente:"#c084fc",cuerpo:"#f97316"};
  const col=COLORS2[module]||"#FFB800";
  const buildCtx=()=>{
    const fin=()=>"FINANZAS: Ingresos mes "+M(mInc())+" | Gastos "+M(mExp())+" | Balance "+M(mInc()-mExp())+" | Patrimonio "+M(totPort)+" | Ahorros "+M(totSav)+" | Deuda "+M(totDebt)+" | Salario "+(salary.amount?M(salMXN())+"/mes":"sin configurar")+" | Vende: "+(products.map(p=>p.name).join(", ")||"nada")+" | Trading $"+trading.balance+" "+trading.currency;
    const hab=()=>"HÁBITOS: "+(habits.map(h=>h.name+" (racha "+getStreak(comp,h.id)+"d)").join(", ")||"ninguno")+" | Hoy: "+habits.filter(h=>(comp[h.id]||{})[tod]).length+"/"+habits.length+" | TAREAS pendientes: "+(tasks.filter(t=>!t.completed).map(t=>t.text+" ["+t.priority+(t.dueDate?", vence "+t.dueDate:"")+"]").slice(0,10).join("; ")||"ninguna");
    const men=()=>"MENTE: "+medSess.length+" meditaciones ("+medSess.filter(s=>(Date.now()-new Date(s.date))/86400000<=7).length+" esta semana, "+medSess.reduce((a,s)=>a+s.minutes,0)+" min totales) | Journal: "+journal.length+" entradas | Últimos ánimos: "+journal.slice(0,5).map(j=>j.mood+" "+fd(j.date)).join(", ")+" | Última reflexión: "+(journal[0]?.text?.slice(0,200)||"ninguna");
    const cue=()=>{const plan=plans.find(p=>p.id===activePlanId);return "ENTRENAMIENTO: Plan activo: "+(plan?plan.name+" ("+plan.daysPerWeek+" días: "+plan.days.map(d=>d.label+"="+(d.name||"?")).join(", ")+")":"ninguno")+" | Últimos entrenos: "+[...wkLogs].slice(-8).map(w=>w.date+" "+w.name+" ["+(w.exercises||[]).filter(e=>e.sets?.length).map(e=>e.name+": "+e.sets.map(s=>(s.weight||"?")+"kg x"+(s.reps||"?")).join(", ")).join(" | ")+"]").join(" /// ")};
    if(module==="fin")return fin();
    if(module==="hab")return hab();
    if(module==="mente")return men();
    if(module==="cuerpo")return cue();
    return fin()+"\n"+hab()+"\n"+cue();
  };
  const send=async()=>{
    if(!input.trim()||loading)return;
    const msg=input.trim();setInput("");
    const updated=[...msgs,{role:"user",content:msg}];setMsgs(updated);setLoading(true);
    try{
      const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,system:"Eres el asistente IA de LifeOS enfocado en "+NAMES[module]+" del usuario. Datos reales actuales: "+buildCtx()+" | Responde en español mexicano, directo, útil y con números concretos cuando aplique.",messages:updated.map(m=>({role:m.role,content:m.content}))})});
      const d=await r.json();
      if(d.error){setMsgs([...updated,{role:"assistant",content:"Error: "+d.error.message}]);setLoading(false);return}
      setMsgs([...updated,{role:"assistant",content:(d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n")||"Sin respuesta."}]);
    }catch(e){setMsgs([...updated,{role:"assistant",content:"Error: "+e.message}])}
    setLoading(false);
  };
  if(!open)return(
    <button onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"#0f0f0f",border:`.5px dashed ${col}55`,borderRadius:11,cursor:"pointer",fontFamily:"inherit",width:"100%",marginTop:2}}>
      <span style={{fontSize:16}}>💬</span>
      <span style={{fontSize:12,color:col,fontWeight:600}}>Preguntar a la IA sobre {NAMES[module]}</span>
      <span style={{marginLeft:"auto",fontSize:11,color:"#555"}}>▾</span>
    </button>
  );
  return(<div className="lc" style={{borderColor:col+"44",marginTop:2}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <div style={{fontSize:12,fontWeight:700,color:col}}>💬 IA · {NAMES[module]}</div>
      <button className="lbs" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>setOpen(false)}>▴ Cerrar</button>
    </div>
    {!apiKey?(<div>
      <div style={{fontSize:11,color:"#555",marginBottom:8}}>Conecta tu API Key de Anthropic (console.anthropic.com):</div>
      <input className="lfi" type="password" placeholder="sk-ant-..." value={keyInput} onChange={e=>setKeyInput(e.target.value)}/>
      <button className="lbp" style={{marginTop:8,width:"100%",justifyContent:"center",background:col,color:"#000"}} onClick={()=>{if(keyInput.startsWith("sk-"))setApiKey(keyInput.trim());else alert("Debe empezar con sk-ant-")}}>Conectar</button>
    </div>):(<>
      {msgs.length>0&&<div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:280,overflowY:"auto",marginBottom:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"88%",padding:"8px 11px",borderRadius:11,fontSize:12,lineHeight:1.6,background:m.role==="user"?col:"#0a0a0a",color:m.role==="user"?"#000":"#f0f0f0",border:m.role==="assistant"?".5px solid rgba(255,255,255,.07)":"none",whiteSpace:"pre-wrap"}}>{m.content}</div>
          </div>
        ))}
        {loading&&<div style={{fontSize:11,color:"#555"}}>💭 Pensando con tus datos...</div>}
        <div ref={endRef}/>
      </div>}
      <div style={{display:"flex",gap:6,alignItems:"flex-end"}}>
        <textarea className="lfi" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder={"Pregunta sobre "+NAMES[module]+"..."} style={{resize:"none",minHeight:40,maxHeight:90,flex:1,fontSize:12}}/>
        <button className="lbp" onClick={send} disabled={loading} style={{height:40,flexShrink:0,background:col,color:"#000",padding:"0 13px",opacity:loading?.5:1}}>➤</button>
      </div>
      {msgs.length>0&&<button className="lbs" style={{fontSize:10,marginTop:6}} onClick={()=>setMsgs([])}>Limpiar</button>}
    </>)}
  </div>);
}

/* ── Presupuestos por categoría ── */
function BudgetCard({ctx}){
  const{budgets,setBudgets,expenses}=ctx;
  const[edit,setEdit]=useState(false);
  const m=nm();
  const now=new Date();
  const daysInM=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const monthPct=(now.getDate()/daysInM)*100;
  const spentBy=id=>expenses.filter(e=>mk(e.date)===m&&e.cat===id).reduce((a,e)=>a+e.amount,0);
  const active=CATS.filter(c=>+budgets[c.id]>0);
  const totB=active.reduce((a,c)=>a+ +budgets[c.id],0);
  const totS=active.reduce((a,c)=>a+spentBy(c.id),0);
  const barColor=p=>p>=100?"#FF4545":p>=85?"#FFB800":"#00FF87";
  if(!edit&&active.length===0)return(
    <div onClick={()=>setEdit(true)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",background:"rgba(126,216,246,.05)",border:".5px dashed rgba(126,216,246,.35)",borderRadius:11,cursor:"pointer"}}>
      <span style={{fontSize:18}}>📊</span>
      <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:"#7ED8F6"}}>Configura tus presupuestos</div><div style={{fontSize:10,color:"#555"}}>Ponle límite mensual a cada categoría y controla tu gasto de verdad</div></div>
      <span style={{color:"#7ED8F6"}}>▶</span>
    </div>
  );
  return(<div className="lc" style={{borderColor:"rgba(126,216,246,.2)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#7ED8F6"}}>📊 Presupuesto del mes</div>
        {active.length>0&&<div style={{fontSize:10,color:"#555",marginTop:1}}>Gastado <b className="lmn" style={{color:barColor(totB>0?totS/totB*100:0)}}>{M(totS)}</b> de <b className="lmn">{M(totB)}</b> · va {monthPct.toFixed(0)}% del mes</div>}
      </div>
      <button className="lbs" style={{fontSize:10,padding:"3px 9px"}} onClick={()=>setEdit(v=>!v)}>{edit?"✓ Listo":"⚙️ Configurar"}</button>
    </div>
    {edit&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:7,marginBottom:active.length>0?12:0}}>
      {CATS.map(c=>(
        <div key={c.id} style={{background:"#080808",borderRadius:9,padding:"8px 9px"}}>
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}><span style={{fontSize:13}}>{c.icon}</span><span style={{fontSize:10,color:"#999"}}>{c.label}</span></div>
          <input className="lfi" type="number" inputMode="decimal" placeholder="Sin límite" value={budgets[c.id]||""} onChange={e=>setBudgets(p=>({...p,[c.id]:e.target.value}))} style={{fontSize:12,padding:"5px 8px"}}/>
        </div>
      ))}
    </div>}
    {!edit&&active.map(c=>{
      const b=+budgets[c.id];const s=spentBy(c.id);const p=b>0?(s/b)*100:0;
      const overPace=p>monthPct+12&&p<100;
      return(<div key={c.id} style={{marginBottom:9}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
          <span style={{display:"flex",alignItems:"center",gap:5}}><span>{c.icon}</span><span style={{color:"#c0c0c0"}}>{c.label}</span></span>
          <span className="lmn" style={{color:barColor(p)}}>{M(s)} / {M(b)} · {p.toFixed(0)}%</span>
        </div>
        <div style={{height:6,background:"#161616",borderRadius:99,overflow:"hidden",position:"relative"}}>
          <div style={{height:"100%",width:Math.min(p,100)+"%",background:barColor(p),borderRadius:99,transition:"width .4s"}}/>
          <div style={{position:"absolute",top:0,bottom:0,left:monthPct+"%",width:1.5,background:"rgba(255,255,255,.35)"}} title="Ritmo del mes"/>
        </div>
        {p>=100&&<div style={{fontSize:9,color:"#FF4545",marginTop:2}}>🚨 Presupuesto excedido en {M(s-b)}</div>}
        {overPace&&<div style={{fontSize:9,color:"#FFB800",marginTop:2}}>⚠️ Vas al {p.toFixed(0)}% y el mes va al {monthPct.toFixed(0)}% — baja el ritmo</div>}
      </div>);
    })}
    {!edit&&active.length>0&&(()=>{
      const rest=totB-totS;const daysLeft=daysInM-now.getDate()+1;
      return<div style={{fontSize:10,color:"#555",paddingTop:6,borderTop:".5px solid rgba(255,255,255,.05)"}}>
        {rest>0?<>Te quedan <b className="lmn" style={{color:"#00FF87"}}>{M(rest)}</b> ÷ {daysLeft} días = <b className="lmn" style={{color:"#7ED8F6"}}>{M(rest/daysLeft)}/día</b> disponibles</>:<span style={{color:"#FF4545"}}>Sin presupuesto restante este mes — modo supervivencia 🛡️</span>}
      </div>;
    })()}
  </div>);
}

/* ── Patrimonio histórico ── */
function NetWorthCard({ctx}){
  const{nwLog}=ctx;
  if(nwLog.length===0)return null;
  const data=nwLog.slice(-12);
  const maxV=Math.max(...data.map(d=>d.value),1);
  const minV=Math.min(...data.map(d=>d.value),0);
  const range=maxV-minV||1;
  const first=data[0],last=data[data.length-1];
  const diff=last.value-first.value;
  const diffPct=first.value!==0?((diff/Math.abs(first.value))*100).toFixed(1):null;
  const prev=data.length>=2?data[data.length-2]:null;
  const mDiff=prev?last.value-prev.value:0;
  const MN=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const ml=m=>MN[+m.slice(5,7)-1];
  return(<div className="lc" style={{borderColor:"rgba(126,216,246,.2)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#7ED8F6"}}>📈 Patrimonio histórico</div>
        <div className="lmn" style={{fontSize:20,fontWeight:800,color:last.value>=0?"#00FF87":"#FF4545",marginTop:3}}>{M(last.value)}</div>
        <div style={{fontSize:10,color:"#555",marginTop:2}}>
          {prev&&mDiff!==0&&<span style={{color:mDiff>0?"#00FF87":"#FF4545",fontWeight:700}}>{mDiff>0?"▲":"▼"} {M(Math.abs(mDiff))} vs mes pasado</span>}
          {data.length>=3&&diffPct!=null&&<span> · {diff>=0?"+":""}{diffPct}% desde {ml(first.month)}</span>}
        </div>
      </div>
      {last.debt>0&&<div style={{textAlign:"right"}}><div style={{fontSize:9,color:"#444"}}>Deuda actual</div><div className="lmn" style={{fontSize:12,fontWeight:700,color:"#FF4545"}}>{M(last.debt)}</div></div>}
    </div>
    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:70}}>
      {data.map((d,i)=>{
        const h=range>0?((d.value-minV)/range)*85+15:50;
        const up=i===0||d.value>=data[i-1].value;
        return(<div key={d.month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,height:"100%"}}>
          <div className="lmn" style={{fontSize:7,color:up?"#00FF87":"#FF4545"}}>{Math.abs(d.value)>=1000?(d.value/1000).toFixed(0)+"K":d.value}</div>
          <div style={{flex:1,width:"100%",display:"flex",alignItems:"flex-end"}}>
            <div title={d.month+": "+M(d.value)} style={{width:"100%",height:h+"%",background:i===data.length-1?(up?"#00FF87":"#FF4545"):(up?"rgba(0,255,135,.35)":"rgba(255,69,69,.35)"),borderRadius:"3px 3px 0 0",transition:"height .4s"}}/>
          </div>
          <div style={{fontSize:7,color:"#444"}}>{ml(d.month)}</div>
        </div>);
      })}
    </div>
    {data.length===1&&<div style={{fontSize:10,color:"#555",marginTop:8,textAlign:"center"}}>La foto de tu patrimonio se toma automáticamente cada mes — regresa el próximo para ver tu evolución 📊</div>}
  </div>);
}

/* ── Gamificación: XP, niveles y logros ── */
/* ══════════ MOTOR DE JUEGO ══════════ */
const fireMult=s=>s>=30?2:s>=14?1.75:s>=7?1.5:s>=3?1.2:1;
const fireLabel=s=>s>=30?"🔥🔥🔥 INFIERNO":s>=14?"🔥🔥 EN LLAMAS":s>=7?"🔥 ENCENDIDO":s>=3?"✨ CHISPA":"💤 FRÍO";
const calcXp=({habits,comp,tasks,wkLogs,checkins,reviews,saleTx,savGoals})=>{
  const habComps=Object.values(comp).reduce((a,m)=>a+Object.values(m).filter(Boolean).length,0);
  const tasksDone=tasks.filter(t=>t.completed).length;
  const totalSets=wkLogs.reduce((a,w)=>a+(w.totalSets||0),0);
  const priosDone=reviews.reduce((a,r)=>a+(r.priorities||[]).filter(p=>p.done).length,0);
  const goalsDone=savGoals.filter(g=>g.saved>=g.target).length;
  const streakBonus=habits.reduce((a,h)=>{const s=getStreak(comp,h.id);return a+(s>=30?450:s>=14?150:s>=7?50:0)},0);
  const base=habComps*10+tasksDone*15+wkLogs.length*50+totalSets*2+checkins.length*10+reviews.length*100+saleTx.length*25+goalsDone*200+priosDone*30;
  return{xp:base+streakBonus,base,streakBonus,habComps,tasksDone,totalSets,priosDone,goalsDone};
};
const calcPlayerStats=({habits,comp,wkLogs,plans,activePlanId,checkins,nutriLog,budgets,expenses,savGoals,cards,salMXN})=>{
  const now=new Date();const d7=new Date(now);d7.setDate(d7.getDate()-6);const d30=new Date(now);d30.setDate(d30.getDate()-29);
  const inRange=(dateStr,from)=>{const d=new Date(dateStr+"T12:00:00");return d>=from&&d<=now};
  const plan=plans.find(p=>p.id===activePlanId);const target=plan?plan.daysPerWeek:4;
  // 💪 Fuerza
  const wk7=wkLogs.filter(w=>inRange(w.date,d7)).length;const wk30=wkLogs.filter(w=>inRange(w.date,d30)).length;
  const fuerza=wkLogs.length===0?0:Math.round(Math.min(100,wk7/target*100)*.6+Math.min(100,wk30/(target*4)*100)*.4);
  // 🔥 Disciplina
  const tod=td();
  const disciplina=habits.length===0?0:Math.round(habits.reduce((a,h)=>a+Math.min(100,getStreak(comp,h.id)/30*100),0)/habits.length*.5+habits.filter(h=>(comp[h.id]||{})[tod]).length/habits.length*100*.5);
  // 💰 Riqueza
  const m=nm();const act=CATS.filter(c=>+budgets[c.id]>0);
  const budgetScore=act.length===0?null:Math.round(act.reduce((a,c)=>{const b=+budgets[c.id];const s=expenses.filter(e=>mk(e.date)===m&&e.cat===c.id).reduce((x,e)=>x+e.amount,0);return a+(s<=b?100:Math.max(0,100-((s-b)/b)*100))},0)/act.length);
  const goalScore=savGoals.length===0?null:Math.round(savGoals.reduce((a,g)=>a+Math.min(100,g.target>0?g.saved/g.target*100:0),0)/savGoals.length);
  const debt=cards.reduce((a,c)=>a+(c.balance||0),0);const inc=salMXN();
  const debtScore=cards.length===0?null:debt===0?100:inc>0?Math.max(0,Math.round(100-debt/inc*50)):50;
  const rParts=[budgetScore,goalScore,debtScore].filter(v=>v!=null);
  const riqueza=rParts.length===0?0:Math.round(rParts.reduce((a,v)=>a+v,0)/rParts.length);
  // ⚡ Energía
  const ck7=checkins.filter(c=>inRange(c.date,d7));
  const energia=ck7.length===0?0:Math.round(ck7.reduce((a,c)=>a+Math.min(100,(c.sleep||0)/8*100),0)/ck7.length*.5+ck7.reduce((a,c)=>a+(c.energy||0)*10,0)/ck7.length*.5);
  // 🍽️ Vitalidad
  const nDays=Object.keys(nutriLog).filter(k=>inRange(k,d7));
  const vitalidad=nDays.length===0?0:Math.round(nDays.reduce((a,k)=>a+Object.values(nutriLog[k]).filter(Boolean).length,0)/(nDays.length*NUTRI_MEALS.length)*100);
  const stats=[
    {id:"fuerza",e:"💪",l:"Fuerza",v:fuerza,c:"#f97316",tip:"Entrena según tu plan esta semana"},
    {id:"disciplina",e:"🔥",l:"Disciplina",v:disciplina,c:"#00FF87",tip:"Completa tus hábitos y cuida las rachas"},
    {id:"riqueza",e:"💰",l:"Riqueza",v:riqueza,c:"#7ED8F6",tip:"Respeta presupuestos y abona a tus metas"},
    {id:"energia",e:"⚡",l:"Energía",v:energia,c:"#FFB800",tip:"Duerme 7h+ y registra tu check-in"},
    {id:"vitalidad",e:"🍽️",l:"Vitalidad",v:vitalidad,c:"#a855f7",tip:"Marca tus comidas del plan cada día"},
  ];
  const poder=Math.round(stats.reduce((a,s)=>a+s.v,0)/stats.length);
  return{stats,poder,bestStreak:habits.reduce((a,h)=>Math.max(a,getStreak(comp,h.id)),0)};
};
const calcAchievements=(ctx)=>{
  const{habits,comp,tasks,wkLogs,checkins,reviews,saleTx,savGoals,cards,expenses,budgets,salMXN,plans,activePlanId,nutriLog}=ctx;
  const x=calcXp({habits,comp,tasks,wkLogs,checkins,reviews,saleTx,savGoals});
  const bestStreak=habits.reduce((a,h)=>Math.max(a,getStreak(comp,h.id)),0);
  const prHunter=(()=>{const first={},best={};for(const w of wkLogs)for(const ex of(w.exercises||[]))for(const s of(ex.sets||[])){const wgt=+s.weight||0;if(!wgt)continue;if(!(ex.name in first))first[ex.name]=wgt;best[ex.name]=Math.max(best[ex.name]||0,wgt)}return Object.keys(first).some(n=>best[n]>first[n])})();
  const debtFree=cards.length>0&&cards.every(c=>(c.balance||0)===0);
  const m=nm();
  const budgetOk=(()=>{const act=CATS.filter(c=>+budgets[c.id]>0);if(act.length===0)return false;return act.every(c=>expenses.filter(e=>mk(e.date)===m&&e.cat===c.id).reduce((a,e)=>a+e.amount,0)<=+budgets[c.id])})();
  const score80=(()=>{const plan=plans.find(p=>p.id===activePlanId);const args={habits,comp,wkLogs,medSess:[],journal:[],expenses,dailyBudget:salMXN()>0?salMXN()/30:0,plan};for(let i=0;i<14;i++){const d=new Date();d.setDate(d.getDate()-i);const r=calcDayScore(ds(d),args);if(r.score!=null&&r.score>=80)return true}return false})();
  const perfectMeals=Object.values(nutriLog).filter(dl=>Object.values(dl).filter(Boolean).length>=NUTRI_MEALS.length).length;
  return[
    {e:"🔥",n:"Primera chispa",d:"Completa tu primer hábito",ok:x.habComps>=1,r:"comun"},
    {e:"🔥",n:"Semana de fuego",d:"Racha de 7 días",ok:bestStreak>=7,r:"raro"},
    {e:"🌋",n:"Mes imparable",d:"Racha de 30 días",ok:bestStreak>=30,r:"legendario"},
    {e:"💪",n:"Primer entreno",d:"Registra tu primera sesión",ok:wkLogs.length>=1,r:"comun"},
    {e:"💪",n:"Constancia de hierro",d:"10 entrenos",ok:wkLogs.length>=10,r:"raro"},
    {e:"🏛️",n:"Templo de acero",d:"50 entrenos",ok:wkLogs.length>=50,r:"epico"},
    {e:"🏋️",n:"Cazador de PRs",d:"Sube el peso en un ejercicio",ok:prHunter,r:"raro"},
    {e:"⚡",n:"Centurión",d:"100 sets acumulados",ok:x.totalSets>=100,r:"raro"},
    {e:"🍽️",n:"Chef de combate",d:"5 días con las 5 comidas",ok:perfectMeals>=5,r:"raro"},
    {e:"✅",n:"Ejecutor",d:"25 tareas completadas",ok:x.tasksDone>=25,r:"raro"},
    {e:"💰",n:"Primera venta",d:"Registra una venta",ok:saleTx.length>=1,r:"comun"},
    {e:"🎯",n:"Meta cumplida",d:"Completa una meta de ahorro",ok:x.goalsDone>=1,r:"epico"},
    {e:"📝",n:"Cierre de ciclo",d:"Primera revisión semanal",ok:reviews.length>=1,r:"comun"},
    {e:"👹",n:"Cazajefes",d:"4 jefes semanales derrotados",ok:reviews.length>=4,r:"epico"},
    {e:"🧬",n:"Día perfecto",d:"Score de Vida 80+ (últ. 14d)",ok:score80,r:"raro"},
    {e:"🌅",n:"Autoconocimiento",d:"7 check-ins diarios",ok:checkins.length>=7,r:"comun"},
    {e:"💳",n:"Libre de deudas",d:"Todas tus tarjetas en $0",ok:debtFree,r:"epico"},
    {e:"📊",n:"Mes bajo control",d:"Ningún presupuesto excedido",ok:budgetOk,r:"raro"},
    {e:"👑",n:"Maestro de Vida",d:"Alcanza el nivel 10",ok:lvlFromXp(x.xp)>=10,r:"legendario"},
  ];
};
const RARITY={comun:{l:"Común",c:"#8a8f98"},raro:{l:"Raro",c:"#3b82f6"},epico:{l:"Épico",c:"#a855f7"},legendario:{l:"Legendario",c:"#f59e0b"}};
/* Sonidos (WebAudio, sin archivos) */
const beep=(freq,dur,type="sine",vol=.08)=>{try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ac=beep._ac||(beep._ac=new AC());const o=ac.createOscillator();const g=ac.createGain();o.type=type;o.frequency.value=freq;g.gain.value=vol;o.connect(g);g.connect(ac.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur);o.stop(ac.currentTime+dur)}catch{}};
const playXp=()=>{beep(880,.12,"square",.05);setTimeout(()=>beep(1320,.15,"square",.05),90)};
const playFanfare=()=>{[[523,0],[659,120],[784,240],[1047,380]].forEach(([f,t])=>setTimeout(()=>beep(f,.35,"triangle",.09),t))};

function LevelUpModal({lvl,name,onClose}){
  const title=LVL_TITLES[Math.min(lvl-1,LVL_TITLES.length-1)];
  const pieces=Array.from({length:40},(_,i)=>({l:Math.random()*100,d:Math.random()*1.5,c:["#a855f7","#00FF87","#FFB800","#7ED8F6","#f97316"][i%5],s:6+Math.random()*8,r:Math.random()*360}));
  return(<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflow:"hidden"}}>
    {pieces.map((p,i)=><div key={i} style={{position:"absolute",top:-20,left:p.l+"%",width:p.s,height:p.s*.6,background:p.c,transform:"rotate("+p.r+"deg)",animation:"confettiFall "+(2.2+p.d)+"s linear "+p.d*.4+"s forwards",borderRadius:2}}/>)}
    <div style={{animation:"levelPop .5s ease-out",textAlign:"center",background:"linear-gradient(160deg,#14101f,#0a0a10)",border:"1px solid rgba(168,85,247,.6)",borderRadius:22,padding:"30px 26px",maxWidth:340,width:"100%",boxShadow:"0 0 60px rgba(168,85,247,.35)"}}>
      <div style={{fontSize:11,color:"#a855f7",letterSpacing:3,fontWeight:800}}>¡SUBISTE DE NIVEL!</div>
      <div className="lmn" style={{fontSize:72,fontWeight:900,color:"#a855f7",lineHeight:1.1,textShadow:"0 0 30px rgba(168,85,247,.8)",margin:"8px 0"}}>{lvl}</div>
      <div style={{fontSize:18,fontWeight:800,color:"#f0f0f0"}}>{name}, ahora eres</div>
      <div style={{fontSize:22,fontWeight:900,marginTop:4,background:"linear-gradient(90deg,#a855f7,#7ED8F6,#00FF87,#a855f7)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 3s linear infinite"}}>{title}</div>
      <button onClick={onClose} style={{marginTop:22,width:"100%",padding:13,border:"none",borderRadius:12,background:"#a855f7",color:"#000",fontSize:14,fontWeight:900,cursor:"pointer",fontFamily:"inherit"}}>¡Seguir subiendo! 🚀</button>
    </div>
  </div>);
}
const LVL_TITLES=["Novato","Aprendiz","Constante","Disciplinado","Enfocado","Imparable","Máquina","Titán","Leyenda","Maestro de Vida"];
const lvlFromXp=xp=>{let l=1;while(xp>=100*l*(l+1)/2)l++;return l};
const xpForLvl=l=>100*(l-1)*l/2;
function GamePanel({ctx}){
  const[open,setOpen]=useState(false);
  const[filter,setFilter]=useState("all");
  const ACH=calcAchievements(ctx);
  const unlocked=ACH.filter(a=>a.ok);
  const byR=r=>ACH.filter(a=>a.r===r);
  const shown=filter==="all"?ACH:filter==="locked"?ACH.filter(a=>!a.ok):ACH.filter(a=>a.r===filter);
  return(<div className="neo-static" style={{borderColor:"rgba(245,158,11,.3)"}}>
    <div onClick={()=>setOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:11,cursor:"pointer"}}>
      <span style={{fontSize:26}}>🏆</span>
      <div style={{flex:1}}>
        <div style={{fontSize:12,fontWeight:800,color:"#f59e0b",letterSpacing:1}}>SALA DE TROFEOS</div>
        <div style={{display:"flex",gap:8,marginTop:4,fontSize:9,flexWrap:"wrap"}}>
          {Object.keys(RARITY).map(r=><span key={r} style={{color:RARITY[r].c,fontWeight:700}}>{byR(r).filter(a=>a.ok).length}/{byR(r).length} {RARITY[r].l}</span>)}
        </div>
      </div>
      <div className="lmn" style={{fontSize:16,fontWeight:900,color:"#f59e0b"}}>{unlocked.length}<span style={{fontSize:10,color:"#555"}}>/{ACH.length}</span></div>
      <span style={{color:"#555"}}>{open?"▴":"▾"}</span>
    </div>
    {open&&<div style={{marginTop:12}}>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
        {[["all","Todos"],["locked","🔒 Por ganar"],["comun","Común"],["raro","Raro"],["epico","Épico"],["legendario","Legendario"]].map(([id,l])=>(
          <button key={id} onClick={()=>setFilter(id)} style={{padding:"4px 9px",border:"1px solid "+(filter===id?(RARITY[id]?.c||"#f59e0b"):"rgba(255,255,255,.08)"),borderRadius:8,background:filter===id?"rgba(255,255,255,.06)":"transparent",color:filter===id?(RARITY[id]?.c||"#f59e0b"):"#666",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{l}</button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(105px,1fr))",gap:7}}>
        {shown.map((a,i)=>{const rc=RARITY[a.r].c;return(
          <div key={i} style={{background:a.ok?"linear-gradient(160deg,"+rc+"22,#0a0a0f)":"#08080c",border:"1px solid "+(a.ok?rc:"rgba(255,255,255,.05)"),borderRadius:12,padding:"10px 7px",textAlign:"center",opacity:a.ok?1:.5,boxShadow:a.ok?"0 0 12px "+rc+"55":"none"}}>
            <div style={{fontSize:22,filter:a.ok?"none":"grayscale(1)"}}>{a.e}</div>
            <div style={{fontSize:10,fontWeight:800,color:a.ok?rc:"#555",marginTop:4,lineHeight:1.2}}>{a.n}</div>
            <div style={{fontSize:8,color:"#555",marginTop:3,lineHeight:1.3}}>{a.d}</div>
            <div style={{fontSize:7,color:rc,marginTop:4,fontWeight:800,letterSpacing:1,textTransform:"uppercase"}}>{RARITY[a.r].l}</div>
          </div>)})}
      </div>
      <div style={{marginTop:12,padding:"8px 11px",background:"#08080c",borderRadius:9,fontSize:9,color:"#555",lineHeight:1.7}}>
        <b style={{color:"#999"}}>Cómo ganas XP:</b> hábito ✓ +10 · tarea ✓ +15 · entreno +50 (+2/set) · check-in +10 · jefe semanal +100 · prioridad cumplida +30 · venta +25 · meta de ahorro +200 · <b style={{color:"#FFB800"}}>bonus de racha:</b> 7d +50 · 14d +150 · 30d +450 por hábito
      </div>
    </div>}
  </div>);
}

/* ── Revisión semanal guiada ── */
function WeeklyReview({ctx}){
  const{reviews,setReviews,habits,comp,wkLogs,medSess,journal,expenses,salMXN,plans,activePlanId,now}=ctx;
  const[open,setOpen]=useState(false);
  const[showHist,setShowHist]=useState(false);
  const[wins,setWins]=useState("");const[miss,setMiss]=useState("");const[lesson,setLesson]=useState("");
  const[p1,setP1]=useState("");const[p2,setP2]=useState("");const[p3,setP3]=useState("");
  const wk=weekKey();
  const doneThisWeek=reviews.find(r=>r.weekKey===wk);
  const streak=reviewStreak(reviews);
  const isWeekend=[5,6,0].includes(now.getDay());
  // Prioridades activas: las que se fijaron para ESTA semana
  const activeRev=reviews.find(r=>r.targetWeek===wk);
  const togglePrio=(ri,pi)=>setReviews(p=>p.map(r=>r.id===ri?{...r,priorities:r.priorities.map((x,i)=>i===pi?{...x,done:!x.done}:x)}:r));

  // Stats automáticas de la semana en curso (lunes → hoy)
  const stats=(()=>{
    const start=new Date(wk+"T00:00:00");const days=[];
    for(let d=new Date(start);d<=now;d.setDate(d.getDate()+1))days.push(ds(d));
    const habPct=habits.length>0?Math.round(days.reduce((a,d)=>a+habits.filter(h=>(comp[h.id]||{})[d]).length,0)/(habits.length*days.length)*100):null;
    const trains=wkLogs.filter(w=>days.includes(w.date)).length;
    const plan=plans.find(p=>p.id===activePlanId);
    const meds=medSess.filter(s=>days.includes(s.date)).length;
    const jrs=journal.filter(j=>days.includes(j.date)).length;
    const spent=expenses.filter(e=>days.includes(e.date)).reduce((a,e)=>a+e.amount,0);
    const budget=salMXN()>0?(salMXN()/30)*days.length:null;
    return{habPct,trains,planTarget:plan?.daysPerWeek,meds,jrs,spent,budget,nDays:days.length};
  })();

  const save=()=>{
    if(!wins.trim()&&!p1.trim())return;
    const prios=[p1,p2,p3].filter(x=>x.trim()).map(t=>({text:t.trim(),done:false}));
    setReviews(p=>[...p.filter(r=>r.weekKey!==wk),{id:Date.now(),weekKey:wk,targetWeek:nextWeekKey(),date:td(),wins:wins.trim(),miss:miss.trim(),lesson:lesson.trim(),priorities:prios,stats}]);
    setWins("");setMiss("");setLesson("");setP1("");setP2("");setP3("");setOpen(false);
  };

  return(<div style={{display:"flex",flexDirection:"column",gap:8}}>
    {/* Prioridades de ESTA semana */}
    {activeRev&&activeRev.priorities.length>0&&<div className="lc" style={{borderColor:"rgba(255,183,0,.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:"#FFB800"}}>🎯 Prioridades de esta semana</div>
        <div className="lmn" style={{fontSize:10,color:"#555"}}>{activeRev.priorities.filter(p=>p.done).length}/{activeRev.priorities.length}</div>
      </div>
      {activeRev.priorities.map((p,i)=>(
        <div key={i} onClick={()=>togglePrio(activeRev.id,i)} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",cursor:"pointer",borderBottom:i<activeRev.priorities.length-1?".5px solid rgba(255,255,255,.05)":"none"}}>
          <div style={{width:19,height:19,borderRadius:"50%",border:"2px solid "+(p.done?"#FFB800":"#555"),background:p.done?"#FFB800":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {p.done&&<span style={{fontSize:10,color:"#000",fontWeight:700}}>✓</span>}
          </div>
          <div style={{fontSize:12,fontWeight:500,textDecoration:p.done?"line-through":"none",opacity:p.done?.55:1}}>{p.text}</div>
        </div>
      ))}
      {activeRev.priorities.every(p=>p.done)&&<div style={{marginTop:8,padding:8,background:"rgba(255,183,0,.08)",borderRadius:8,textAlign:"center",fontSize:11,fontWeight:700,color:"#FFB800"}}>🏆 ¡Las 3 prioridades de la semana cumplidas!</div>}
    </div>}

    {/* CTA / estado revisión */}
    {!open&&(doneThisWeek?
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"9px 14px",background:"rgba(0,255,135,.04)",border:".5px solid rgba(0,255,135,.2)",borderRadius:11}}>
        <span style={{fontSize:14}}>✅</span>
        <div style={{flex:1,fontSize:11,color:"#c0c0c0"}}>Revisión semanal hecha · racha <b style={{color:"#FFB800"}}>🔥{streak}</b> semana{streak!==1?"s":""}</div>
        <button className="lbs" style={{fontSize:9,padding:"2px 8px"}} onClick={()=>setShowHist(v=>!v)}>{showHist?"ocultar":"historial"}</button>
      </div>
      :
      <div onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",gap:10,padding:isWeekend?"13px 14px":"9px 14px",background:isWeekend?"rgba(255,183,0,.07)":"rgba(255,255,255,.02)",border:".5px solid "+(isWeekend?"rgba(255,183,0,.4)":"rgba(255,255,255,.08)"),borderRadius:11,cursor:"pointer",boxShadow:isWeekend?"0 0 16px rgba(255,183,0,.08)":"none"}}>
        <span style={{fontSize:isWeekend?20:15}}>📝</span>
        <div style={{flex:1}}>
          <div style={{fontSize:isWeekend?13:12,fontWeight:700,color:isWeekend?"#FFB800":"#999"}}>{isWeekend?"Es momento de tu revisión semanal":"Revisión semanal"}</div>
          <div style={{fontSize:10,color:"#555"}}>{streak>0?"Racha 🔥"+streak+" — no la rompas":"5 minutos que cambian tu semana"}</div>
        </div>
        <span style={{color:isWeekend?"#FFB800":"#555"}}>▶</span>
      </div>
    )}

    {/* Historial */}
    {showHist&&[...reviews].sort((a,b)=>b.weekKey.localeCompare(a.weekKey)).slice(0,6).map(r=>(
      <div key={r.id} className="lc" style={{borderColor:"rgba(255,255,255,.06)",padding:"10px 12px"}}>
        <div style={{fontSize:10,color:"#FFB800",fontWeight:700,marginBottom:5}}>Semana del {fd(r.weekKey)}</div>
        {r.wins&&<div style={{fontSize:11,color:"#c0c0c0",marginBottom:3}}>🏆 {r.wins}</div>}
        {r.miss&&<div style={{fontSize:11,color:"#999",marginBottom:3}}>🔧 {r.miss}</div>}
        {r.lesson&&<div style={{fontSize:11,color:"#7ED8F6",fontStyle:"italic"}}>💡 {r.lesson}</div>}
        <div style={{fontSize:10,color:"#555",marginTop:5}}>Prioridades cumplidas: {r.priorities.filter(p=>p.done).length}/{r.priorities.length}</div>
      </div>
    ))}

    {/* Formulario */}
    {open&&<div className="lc" style={{borderColor:"rgba(255,183,0,.35)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:700,color:"#FFB800"}}>📝 Revisión de la semana</div>
        <button className="lbs" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>setOpen(false)}>✕</button>
      </div>
      {/* Números automáticos de la semana */}
      <div style={{padding:"9px 11px",background:"#080808",borderRadius:9,marginBottom:12}}>
        <div style={{fontSize:9,color:"#555",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>📊 Tu semana en números ({stats.nDays} días)</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:10,fontSize:11}}>
          {stats.habPct!=null&&<span>🔥 Hábitos <b className="lmn" style={{color:scoreColor(stats.habPct)}}>{stats.habPct}%</b></span>}
          <span>💪 Entrenos <b className="lmn" style={{color:"#f97316"}}>{stats.trains}{stats.planTarget?"/"+stats.planTarget:""}</b></span>
          <span>💸 Gastado <b className="lmn" style={{color:stats.budget&&stats.spent>stats.budget?"#FF4545":"#7ED8F6"}}>{M(stats.spent)}</b>{stats.budget?<span style={{color:"#555"}}> / {M(stats.budget)}</span>:null}</span>
        </div>
      </div>
      <div style={{marginBottom:9}}><label className="lfl">🏆 ¿Qué logré esta semana?</label><textarea className="lfi" rows={2} placeholder="Victorias grandes o pequeñas..." value={wins} onChange={e=>setWins(e.target.value)} style={{resize:"none",lineHeight:1.5}}/></div>
      <div style={{marginBottom:9}}><label className="lfl">🔧 ¿Qué puedo mejorar?</label><textarea className="lfi" rows={2} placeholder="Sin juzgarte — solo datos..." value={miss} onChange={e=>setMiss(e.target.value)} style={{resize:"none",lineHeight:1.5}}/></div>
      <div style={{marginBottom:12}}><label className="lfl">💡 Lección de la semana</label><input className="lfi" placeholder="Una frase que te llevas..." value={lesson} onChange={e=>setLesson(e.target.value)}/></div>
      <label className="lfl">🎯 Mis 3 prioridades para la próxima semana</label>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4,marginBottom:12}}>
        {[["1.",p1,setP1],["2.",p2,setP2],["3.",p3,setP3]].map(([n,v,set])=>(
          <div key={n} style={{display:"flex",gap:7,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#FFB800",fontWeight:700,width:14}}>{n}</span>
            <input className="lfi" placeholder={n==="1."?"Lo más importante primero":"Prioridad "+n.replace(".","")} value={v} onChange={e=>set(e.target.value)}/>
          </div>
        ))}
      </div>
      <button className="lbp" style={{width:"100%",justifyContent:"center",background:"#FFB800",padding:11,fontSize:13}} onClick={save} disabled={!wins.trim()&&!p1.trim()}>✓ Cerrar mi semana {streak>0?"· racha 🔥"+(streak+(doneThisWeek?0:1)):""}</button>
    </div>}
  </div>);
}

/* ── Check-in diario ── */
function CheckinCard({ctx}){
  const{checkins,setCheckins}=ctx;
  const tod=td();
  const todayCk=checkins.find(c=>c.date===tod);
  const[edit,setEdit]=useState(false);
  const[sleep,setSleep]=useState(todayCk?.sleep??"");
  const[energy,setEnergy]=useState(todayCk?.energy??0);
  const[weight,setWeight]=useState(todayCk?.weight??"");
  const save=()=>{
    if(!sleep&&!energy)return;
    const ck={date:tod,sleep:+sleep||0,energy:+energy||0,weight:+weight||null};
    setCheckins(p=>[...p.filter(c=>c.date!==tod),ck]);
    setEdit(false);
  };
  if(todayCk&&!edit)return(
    <div onClick={()=>{setSleep(todayCk.sleep);setEnergy(todayCk.energy);setWeight(todayCk.weight||"");setEdit(true)}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:"rgba(0,255,135,.04)",border:".5px solid rgba(0,255,135,.2)",borderRadius:11,cursor:"pointer"}}>
      <span style={{fontSize:15}}>✅</span>
      <div style={{flex:1,fontSize:12,color:"#c0c0c0"}}>Check-in de hoy: <b>😴 {todayCk.sleep}h</b> · <b>⚡ {todayCk.energy}/10</b>{todayCk.weight?<> · <b>⚖️ {todayCk.weight}kg</b></>:null}</div>
      <span style={{fontSize:10,color:"#555"}}>editar</span>
    </div>
  );
  if(!todayCk&&!edit)return(
    <div onClick={()=>setEdit(true)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"rgba(126,216,246,.05)",border:".5px solid rgba(126,216,246,.3)",borderRadius:11,cursor:"pointer"}}>
      <span style={{fontSize:20}}>🌅</span>
      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#7ED8F6"}}>Check-in diario</div><div style={{fontSize:10,color:"#555"}}>2 minutos: sueño, energía y peso — alimenta tu Score de Vida</div></div>
      <span style={{fontSize:14,color:"#7ED8F6"}}>▶</span>
    </div>
  );
  return(<div className="lc" style={{borderColor:"rgba(126,216,246,.35)"}}>
    <div style={{fontSize:12,fontWeight:700,color:"#7ED8F6",marginBottom:10}}>🌅 Check-in de hoy</div>
    <div className="lr" style={{marginBottom:10}}>
      <div><label className="lfl">😴 Horas de sueño</label><input className="lfi" type="number" inputMode="decimal" step=".5" placeholder="7.5" value={sleep} onChange={e=>setSleep(e.target.value)}/></div>
      <div><label className="lfl">⚖️ Peso kg (opcional)</label><input className="lfi" type="number" inputMode="decimal" step=".1" placeholder="—" value={weight} onChange={e=>setWeight(e.target.value)}/></div>
    </div>
    <label className="lfl">⚡ Nivel de energía</label>
    <div style={{display:"flex",gap:4,marginTop:4,marginBottom:12}}>
      {[1,2,3,4,5,6,7,8,9,10].map(n=>(
        <button key={n} onClick={()=>setEnergy(n)} style={{flex:1,padding:"8px 0",border:"none",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,background:energy===n?(n>=7?"#00FF87":n>=4?"#FFB800":"#FF4545"):"#161616",color:energy===n?"#000":"#555"}}>{n}</button>
      ))}
    </div>
    <div style={{display:"flex",gap:6}}>
      <button className="lbp" style={{background:"#7ED8F6"}} onClick={save} disabled={!sleep||!energy}>✓ Guardar check-in</button>
      <button className="lbs" onClick={()=>setEdit(false)}>Cancelar</button>
    </div>
  </div>);
}

/* ── Score de Vida ── */
function ScoreVida({ctx}){
  const{habits,comp,wkLogs,medSess,journal,expenses,salMXN,plans,activePlanId,checkins}=ctx;
  const plan=plans.find(p=>p.id===activePlanId);
  const dailyBudget=salMXN()>0?salMXN()/30:0;
  const args={habits,comp,wkLogs,medSess,journal,expenses,dailyBudget,plan};
  const tod=td();
  const today=calcDayScore(tod,args);
  // Tendencia 14 días
  const days=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(13-i));const k=ds(d);return{k,label:d.getDate(),...calcDayScore(k,args)}});
  const withData=days.filter(d=>d.score!=null);
  const avg14=withData.length>0?Math.round(withData.reduce((a,d)=>a+d.score,0)/withData.length):null;
  const prev7=withData.filter((d,i)=>i<withData.length-7);
  const last7=withData.slice(-7);
  const trend=prev7.length>0&&last7.length>0?Math.round(last7.reduce((a,d)=>a+d.score,0)/last7.length)-Math.round(prev7.reduce((a,d)=>a+d.score,0)/prev7.length):0;
  const circ=Math.PI*2*42;
  // Insight sueño ↔ hábitos
  const insight=(()=>{
    if(checkins.length<5||habits.length===0)return null;
    const habPct=d=>{const done=habits.filter(h=>(comp[h.id]||{})[d]).length;return done/habits.length*100};
    const good=checkins.filter(c=>c.sleep>=7),bad=checkins.filter(c=>c.sleep>0&&c.sleep<7);
    if(good.length<2||bad.length<2)return null;
    const gAvg=good.reduce((a,c)=>a+habPct(c.date),0)/good.length;
    const bAvg=bad.reduce((a,c)=>a+habPct(c.date),0)/bad.length;
    const diff=Math.round(gAvg-bAvg);
    if(Math.abs(diff)<10)return null;
    return diff>0?"💡 Cuando duermes 7h+ completas "+diff+"% más hábitos. El sueño es tu palanca.":"💡 Curioso: tus días de menos sueño rinden más — revisa la calidad, no solo horas.";
  })();
  if(today.score==null)return null;
  return(<div className="lc" style={{borderColor:scoreColor(today.score)+"44"}}>
    <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:12}}>
      {/* Ring */}
      <div style={{position:"relative",width:96,height:96,flexShrink:0}}>
        <svg width="96" height="96" style={{transform:"rotate(-90deg)"}}>
          <circle cx="48" cy="48" r="42" fill="none" stroke="#161616" strokeWidth="7"/>
          <circle cx="48" cy="48" r="42" fill="none" stroke={scoreColor(today.score)} strokeWidth="7" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-today.score/100)} style={{transition:"stroke-dashoffset .8s",filter:"drop-shadow(0 0 8px "+scoreColor(today.score)+"66)"}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div className="lmn" style={{fontSize:26,fontWeight:800,color:scoreColor(today.score)}}>{today.score}</div>
          <div style={{fontSize:8,color:"#555"}}>/ 100</div>
        </div>
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:".4px",fontWeight:700}}>🧬 Score de Vida · hoy</div>
        <div style={{fontSize:15,fontWeight:700,color:scoreColor(today.score),marginTop:2}}>{scoreLabel(today.score)}</div>
        <div style={{fontSize:11,color:"#555",marginTop:4}}>
          Promedio 14d: <b className="lmn" style={{color:scoreColor(avg14)}}>{avg14??"—"}</b>
          {trend!==0&&<span style={{color:trend>0?"#00FF87":"#FF4545",fontWeight:700}}> {trend>0?"▲":"▼"}{Math.abs(trend)} vs sem. pasada</span>}
        </div>
      </div>
    </div>
    {/* Pilares */}
    <div style={{display:"grid",gridTemplateColumns:"repeat("+today.pillars.length+",1fr)",gap:6,marginBottom:12}}>
      {today.pillars.map(p=>(
        <div key={p.id} style={{background:"#080808",borderRadius:9,padding:"8px 6px",textAlign:"center"}}>
          <div style={{fontSize:13}}>{p.e}</div>
          <div className="lmn" style={{fontSize:14,fontWeight:700,color:scoreColor(p.v),marginTop:2}}>{p.v}</div>
          <div style={{height:3,background:"#161616",borderRadius:99,marginTop:4}}><div style={{height:"100%",width:p.v+"%",background:scoreColor(p.v),borderRadius:99}}/></div>
          <div style={{fontSize:8,color:"#555",marginTop:3}}>{p.l}</div>
        </div>
      ))}
    </div>
    {/* Tendencia 14 días */}
    <div style={{fontSize:9,color:"#444",textTransform:"uppercase",marginBottom:5,fontWeight:700}}>Últimos 14 días</div>
    <div style={{display:"flex",alignItems:"flex-end",gap:3,height:44}}>
      {days.map((d,i)=>(
        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,height:"100%"}}>
          <div style={{flex:1,width:"100%",display:"flex",alignItems:"flex-end"}}>
            <div title={d.k+": "+(d.score??"—")} style={{width:"100%",height:(d.score??3)+"%",minHeight:2,background:d.score==null?"#161616":i===13?scoreColor(d.score):scoreColor(d.score)+"77",borderRadius:"2px 2px 0 0"}}/>
          </div>
          {i%2===1&&<div style={{fontSize:7,color:"#333"}}>{d.label}</div>}
        </div>
      ))}
    </div>
    {insight&&<div style={{marginTop:10,fontSize:11,color:"#c0c0c0",lineHeight:1.5,padding:"8px 11px",background:"rgba(126,216,246,.05)",borderRadius:8,border:".5px solid rgba(126,216,246,.2)"}}>{insight}</div>}
  </div>);
}

/* ── Bienvenida primera vez ── */
function IntroOverlay({onStart}){
  const ITEMS=[
    ["☀️","Hoy","Tu día en una pantalla: comidas, entreno, hábitos"],
    ["💪","Cuerpo","Entrena y guarda tus pesos, con historial de cada ejercicio"],
    ["🍽️","Comidas","Tu plan de comidas, lista de compras y control de peso"],
    ["💰","Dinero","Gastos, tarjetas, metas de ahorro y análisis"],
    ["⋯","Más","Hábitos, tareas, tu semana y tu perfil"],
  ];
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
    <div style={{maxWidth:400,width:"100%",background:"#0f0f0f",border:".5px solid rgba(0,255,135,.3)",borderRadius:18,padding:"26px 22px",textAlign:"center"}}>
      <div style={{fontSize:44}}>🧬</div>
      <div style={{fontSize:20,fontWeight:800,marginTop:8}}>Bienvenido a LifeOS</div>
      <div style={{fontSize:12,color:"#999",marginTop:6,lineHeight:1.6}}>Tu sistema para controlar y mejorar tu vida.<br/>Todo medible, todo en un lugar.</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:18,textAlign:"left"}}>
        {ITEMS.map(([e,t,d])=>(
          <div key={t} style={{display:"flex",gap:11,alignItems:"center",padding:"9px 12px",background:"#080808",borderRadius:11}}>
            <span style={{fontSize:20}}>{e}</span>
            <div><div style={{fontSize:12,fontWeight:700}}>{t}</div><div style={{fontSize:10,color:"#555",lineHeight:1.4}}>{d}</div></div>
          </div>
        ))}
      </div>
      <div style={{fontSize:10,color:"#00FF87",marginTop:14}}>💾 Todo se guarda automáticamente en este dispositivo</div>
      <button onClick={onStart} style={{marginTop:14,width:"100%",padding:"13px",border:"none",borderRadius:12,background:"#00FF87",color:"#000",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>¡Empezar! 🚀</button>
    </div>
  </div>);
}

/* ── Checklist de arranque ── */
function StartHere({ctx}){
  const{habits,expenses,checkins,wkLogs,hideStart,setHideStart,setMod}=ctx;
  const items=[
    {e:"🌅",t:"Haz tu primer check-in",ok:checkins.length>0,go:"hoy"},
    {e:"🔥",t:"Crea tu primer hábito",ok:habits.length>0,go:"mas"},
    {e:"💸",t:"Registra un gasto",ok:expenses.length>0,go:"dinero"},
    {e:"💪",t:"Marca tu primer entreno",ok:wkLogs.length>0,go:"cuerpo"},
  ];
  const done=items.filter(i=>i.ok).length;
  if(hideStart||done===items.length)return null;
  return(<div className="lc" style={{borderColor:"rgba(0,255,135,.3)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
      <div style={{fontSize:12,fontWeight:700,color:"#00FF87"}}>🚀 Empieza aquí · {done}/{items.length}</div>
      <button onClick={()=>setHideStart(true)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✕</button>
    </div>
    <div style={{height:5,background:"#161616",borderRadius:99,marginBottom:10}}><div style={{height:"100%",width:(done/items.length*100)+"%",background:"#00FF87",borderRadius:99,transition:"width .4s"}}/></div>
    {items.map((it,i)=>(
      <div key={i} onClick={()=>!it.ok&&setMod(it.go)} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",cursor:it.ok?"default":"pointer",opacity:it.ok?.5:1}}>
        <span style={{fontSize:14}}>{it.ok?"✅":it.e}</span>
        <span style={{fontSize:12,textDecoration:it.ok?"line-through":"none",flex:1}}>{it.t}</span>
        {!it.ok&&<span style={{fontSize:11,color:"#00FF87"}}>ir ›</span>}
      </div>
    ))}
  </div>);
}

/* ── Panel de datos: respaldo manual ── */
function DataPanel({backendName,saveState,onRetry,onSync,exportData,importData,onClose}){
  const[mode,setMode]=useState(null);
  const[txt,setTxt]=useState("");
  const[msg,setMsg]=useState("");
  const isMem=backendName.includes("Memoria");
  return(<div style={{margin:"10px 12px 0",padding:"12px 14px",background:"#0f0f0f",border:".5px solid rgba(255,255,255,.12)",borderRadius:12,maxWidth:780,marginLeft:"auto",marginRight:"auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <div style={{fontSize:12,fontWeight:700}}>💾 Datos y respaldo</div>
      <button onClick={onClose} style={{background:"none",border:"none",color:"#666",cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>✕</button>
    </div>
    <div style={{fontSize:11,color:"#999",marginBottom:10,lineHeight:1.6}}>
      💾 <b style={{color:"#00FF87"}}>Autoguardado activo</b> — cada cambio se guarda solo (puntito verde arriba).<br/>
      Almacenamiento: <b style={{color:isMem?"#FF4545":"#00FF87"}}>{backendName||"detectando..."}</b>
      {backendName.includes("Nube Claude ☁️")&&<div style={{color:"#555",marginTop:3}}>☁️ Doble respaldo: guardado local + nube de tu cuenta Claude. Sincroniza solo entre dispositivos al volver a la app.</div>}
      {backendName.includes("falla")&&<div style={{color:"#FFB800",marginTop:3}}>📱 Tus datos están seguros en LOCAL, pero la nube de Claude no responde en este dispositivo — la app lo reintenta en cada guardado y se reconecta sola. Mientras tanto, para pasar datos a otro dispositivo usa Exportar → Importar.</div>}
      {backendName.includes("navegador")&&<div style={{color:"#FFB800",marginTop:3}}>📱 Esta versión guarda solo en este navegador. Para mover datos entre dispositivos: Exportar → Importar.</div>}
      {isMem&&<div style={{color:"#FF6B6B",marginTop:3}}>⚠️ Sin almacenamiento persistente detectado — usa "Exportar" antes de cerrar y "Importar" al volver.</div>}
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
      <button className="lbs" style={{fontSize:11}} onClick={onSync}>☁️ Sincronizar ahora</button>
      <button className="lbs" style={{fontSize:11}} onClick={onRetry}>💾 Re-guardar</button>
      <button className="lbs" style={{fontSize:11}} onClick={async()=>{const t=exportData();try{await navigator.clipboard.writeText(t);setMode(null);setMsg("✓ Respaldo copiado — en tu otro celular: Importar → pegar → Restaurar")}catch{setMode("export");setTxt(t);setMsg("Toca el texto para copiarlo")}}}>📋 Copiar respaldo</button>
      <button className="lbs" style={{fontSize:11}} onClick={()=>{setMode("export");setTxt(exportData());setMsg("")}}>⬆️ Ver/Exportar</button>
      <button className="lbs" style={{fontSize:11}} onClick={()=>{setMode("import");setTxt("");setMsg("")}}>⬇️ Importar datos</button>
    </div>
    {!mode&&msg&&<div style={{fontSize:10,color:"#00FF87",marginBottom:8}}>{msg}</div>}
    {mode==="export"&&<div>
      <div style={{fontSize:10,color:"#555",marginBottom:5}}>Copia TODO este texto y guárdalo (notas, WhatsApp contigo mismo, etc.):</div>
      <textarea className="lfi" readOnly value={txt} onClick={e=>{e.target.select();try{document.execCommand("copy");setMsg("✓ Copiado al portapapeles")}catch{setMsg("Selecciona todo y copia manualmente")}}} style={{height:110,fontSize:10,fontFamily:"monospace",lineHeight:1.4}}/>
      {msg&&<div style={{fontSize:10,color:"#00FF87",marginTop:4}}>{msg}</div>}
    </div>}
    {mode==="import"&&<div>
      <div style={{fontSize:10,color:"#555",marginBottom:5}}>Pega aquí el texto que exportaste antes:</div>
      <textarea className="lfi" value={txt} onChange={e=>setTxt(e.target.value)} placeholder='{"exp":[...],"habits":[...]...}' style={{height:110,fontSize:10,fontFamily:"monospace",lineHeight:1.4}}/>
      <button className="lbp" style={{marginTop:6,fontSize:12}} onClick={()=>{if(importData(txt)){setMsg("✓ Datos restaurados y guardando...");setTxt("")}else setMsg("✗ El texto no es válido — revisa que copiaste todo")}}>Restaurar datos</button>
      {msg&&<div style={{fontSize:10,color:msg.startsWith("✓")?"#00FF87":"#FF6B6B",marginTop:4}}>{msg}</div>}
    </div>}
  </div>);
}

const Mpty=({msg,sub})=>(
  <div style={{textAlign:"center",padding:"26px 0",color:"#444"}}>
    <span style={{fontSize:26,display:"block",marginBottom:8,opacity:.4}}>📥</span>
    <div style={{fontWeight:500,color:"#555",marginBottom:3,fontSize:13}}>{msg}</div>
    <div style={{fontSize:11}}>{sub}</div>
  </div>
);
