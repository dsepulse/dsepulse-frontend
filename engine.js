/* DSE Pulse - shared conviction engine. Builds window.__ms (used by Smart Money, Master Signal, Holdings). */
(function(){
  const API="https://dsepulse-backend-production.up.railway.app";
  const FEEDS=[
    {key:"picker",  path:"/api/picks/today",   pick:d=>(d&&d.picks)||[]},
    {key:"wma",     path:"/api/wma/today",      pick:d=>Array.isArray(d)?d:[]},
    {key:"tech",    path:"/api/tech/today",     pick:d=>Array.isArray(d)?d:[]},
    {key:"combined",path:"/api/combined/today", pick:d=>Array.isArray(d)?d:[]},
    {key:"bd",      path:"/api/bd/all",         pick:d=>Array.isArray(d)?d:[]},
    {key:"act",     path:"/api/activity/today", pick:d=>Array.isArray(d)?d:((d&&d.data)||[])},
  ];
  const ENGINES=["PK","WMA","TCH","CMB","BD","ACT"];
  const convCol=c=>c>=80?"var(--green)":c>=60?"var(--green-bright)":c>=45?"var(--gold)":c>0?"#5b4bd0":"var(--red)";
  let DATA=null, loaded=false, STOCKS=[];
  const num=v=>{ if(v==null)return null; const n=parseFloat(String(v).replace(/[^0-9.\-]/g,"")); return isNaN(n)?null:n; };
  const F=(o,ks)=>{ if(!o)return undefined; for(const k of ks){ if(o[k]!=null&&o[k]!=="")return o[k]; } return undefined; };
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  async function fj(p){ try{const r=await fetch(API+p);if(!r.ok)return null;return await r.json();}catch(e){return null;} }
  function sigAbbr(s){s=(s||"").toUpperCase();return s==="STRONG BUY"?"SB":s==="BUY"?"B":s==="NEUTRAL"?"N":s==="SELL"?"S":s.slice(0,2);}
  function readAct(r){
    const raw=String(F(r,["read","profile"])||"").toLowerCase();
    const dir=String(F(r,["direction","dir"])||"").toLowerCase();
    const note=String(F(r,["note","reason"])||"");
    if(/stealth/.test(raw))return{dir:"stealth",read:"Stealth accumulation",delta:8,note:note||"volume surging while price stays flat — positioning before the move."};
    if(/distribution|insider sell/.test(raw))return{dir:"bearish",read:"Distribution",delta:-14,note:note||"a block sold into the move — someone offloading."};
    if(/accumulation|insider buy/.test(raw))return{dir:"bullish",read:"Accumulation",delta:6,note:note||"a block bought above market — strong hands paying up."};
    if(/frenzy|retail/.test(raw))return{dir:"caution",read:"Retail frenzy",delta:0,note:note||"big volume from tiny trades near the circuit — the late crowd."};
    if(dir==="bullish")return{dir:"bullish",read:"Bullish",delta:6,note:note};
    if(dir==="bearish")return{dir:"bearish",read:"Bearish",delta:-12,note:note};
    return{dir:"neutral",read:"Normal",delta:0,note:note||"nothing unusual in volume or blocks today."};
  }
  function trendOf(wma,wsig){
    const w9=num(F(wma,["w9","wma9"])),w34=num(F(wma,["w34","wma34"])),w89=num(F(wma,["w89","wma89"]));
    if(w9!=null&&w34!=null&&w89!=null){
      if(w9>=w34&&w34>=w89)return{v:"9 \u25B8 34 \u25B8 89",read:"Uptrend",dir:"bull"};
      if(w9<=w34&&w34<=w89)return{v:"9 \u25C2 34 \u25C2 89",read:"Downtrend",dir:"bear"};
      return{v:"crossing",read:"Mixed",dir:"warn"};
    }
    if(/STRONG BUY|BUY/.test(wsig))return{v:wsig,read:"Uptrend",dir:"bull"};
    if(/SELL/.test(wsig))return{v:wsig,read:"Downtrend",dir:"bear"};
    return{v:wsig||"\u2014",read:"Flat",dir:"neu"};
  }
  function macdOf(o){
    const raw=F(o,["macd","macd_hist","macd_state","macd_signal"]);
    if(raw==null)return{v:"\u2014",read:"\u2014",dir:"neu"};
    const mn=num(raw);
    if(mn!=null)return{v:(mn>=0?"+":"")+mn.toFixed(2),read:mn>=0?"Bullish":"Bearish",dir:mn>=0?"bull":"bear"};
    const s=String(raw);return{v:s,read:/bull|up|cross/i.test(s)?"Bullish":/bear|down/i.test(s)?"Bearish":"Neutral",dir:/bull|up|cross/i.test(s)?"bull":/bear|down/i.test(s)?"bear":"neu"};
  }
  function compute(code,f){
    const agree={PK:0,WMA:0,TCH:0,CMB:0,BD:0,ACT:0}, reads={};
    if(f.picker){agree.PK=1;reads.PK="#"+(F(f.picker,["rank"])||"?");}else reads.PK="\u2014";
    let wsig="";
    if(f.wma){wsig=String(F(f.wma,["signal","verdict"])||"").toUpperCase();agree.WMA=/STRONG BUY|BUY/.test(wsig)?1:0;reads.WMA=wsig||"listed";}else reads.WMA="\u2014";
    let tsc=null;
    if(f.tech){tsc=num(F(f.tech,["score"]));agree.TCH=(tsc!=null&&tsc>=70)?1:0;reads.TCH=tsc!=null?Math.round(tsc)+"/100":"listed";}else reads.TCH="\u2014";
    if(f.combined){agree.CMB=1;reads.CMB="Aligned";}else reads.CMB="Not aligned";
    let veto=null,bdScore=null;
    if(f.bd){
      const rawScore=num(F(f.bd,["final_score","score"]));
      const rj=String(F(f.bd,["reject_reason"])||"").trim();
      const rejected = rj.length>0 || String(F(f.bd,["signal"])||"").toUpperCase()==="REJECTED";
      if(rj && /illiquid|low volume|turnover|circuit|category z|above .*limit|pe \d/i.test(rj)) veto=rj;
      if(rejected){
        bdScore=null;
        reads.BD = veto ? "veto" : "\u2014";
        agree.BD = 0;
      } else {
        bdScore = rawScore;
        const q=F(f.bd,["qualified"]); const qualified=(q===true||q==="true"||q===1||q==="1");
        reads.BD = bdScore!=null?String(Math.round(bdScore)):"listed";
        agree.BD = (qualified||(bdScore!=null&&bdScore>=65))?1:0;
      }
    }else reads.BD="\u2014";
    let act={dir:"neutral",read:"Normal",delta:0,note:""};
    if(f.act){act=readAct(f.act);agree.ACT=(act.dir==="bullish"||act.dir==="stealth")?1:0;reads.ACT=act.read;}else reads.ACT="Normal";
    const agreeN=ENGINES.reduce((a,e)=>a+agree[e],0);
    const any=f.bd||f.tech||f.wma||f.picker||{};
    const ltp=num(F(any,["ltp","last","close"]));
    const sector=F(f.bd||f.tech||f.picker||{},["sector","industry"])||"";
    let rsi=num(F(f.bd||f.tech||{},["rsi"])); if(rsi!=null&&(rsi<=0||rsi>=100))rsi=null;
    const vol=num(F(f.act||f.bd||{},["vol_ratio","volume_ratio"]));
    const rsiDir=rsi==null?"neu":rsi>=80?"bear":rsi<=30?"warn":"neu";
    const tech={
      trend:trendOf(f.wma,wsig),
      macd:macdOf(f.tech||f.bd||{}),
      rsi:{v:rsi!=null?rsi.toFixed(1):"\u2014",read:rsi==null?"\u2014":rsi>=80?"Overbought":rsi<=30?"Oversold":"Neutral",dir:rsiDir},
      vol:{v:vol!=null?vol.toFixed(1)+"\u00d7":"\u2014",read:vol==null?"\u2014":vol>=3?"Surging":vol>=1.5?"Above avg":"Normal",dir:vol!=null&&vol>=1.5?"bull":"neu"},
      boll:(function(){const bv=F(f.bd||f.tech||{},["bollinger","bb","bb_pos","band"]);return bv?{v:String(bv),read:String(bv),dir:"neu"}:{v:"\u2014",read:"\u2014",dir:"neu"};})(),
      ctx:{cat:F(f.bd||f.tech||f.picker||{},["cat","category"])||"\u2014",
           pe:(num(F(f.bd||{},["pe","pe_ratio"]))!=null?num(F(f.bd||{},["pe","pe_ratio"])).toFixed(1):"\u2014"),
           circuit:(num(F(f.bd||{},["circuit_dist","circuit"]))!=null?num(F(f.bd||{},["circuit_dist","circuit"])).toFixed(1)+"%":"\u2014"),
           mood:F(f.bd||{},["mood","dsex_mood"])||"\u2014",
           updays:(num(F(f.bd||f.picker||{},["consec_up","consecutive","up_days"]))!=null?num(F(f.bd||f.picker||{},["consec_up","consecutive","up_days"])):"\u2014")}
    };
    const psrc=f.bd||f.picker||{};
    let e=num(F(psrc,["entry","entry_price"])); if(e==null)e=ltp;
    let t=num(F(psrc,["target","target_l1","target1"]));
    let s=num(F(psrc,["sl","stop","stoploss"]));
    let rr=num(F(psrc,["rr"]));
    let plan=null;
    if(e!=null&&e>0){ if(t==null)t=+(e*1.05).toFixed(2); if(s==null)s=+(e*0.97).toFixed(2); if(rr==null||!isFinite(rr))rr=(t-e)>0&&(e-s)>0?+((t-e)/(e-s)).toFixed(1):0; plan={entry:e,target:t,stop:s,rr:rr}; }
    let conv=Math.round((agreeN/6)*82 + act.delta + clamp(((bdScore!=null?bdScore:50)-50)/5,-8,10));
    conv=clamp(conv,1,99);
    let verdict=agreeN>=5?"Strong Buy":agreeN>=3?"Buy":agreeN===2?"Watch":agreeN===1?"Speculative":"Watch";
    let downgraded=false;
    if(act.dir==="bearish"&&(verdict==="Strong Buy"||verdict==="Buy")){verdict="Watch";downgraded=true;conv=Math.min(conv,55);}
    if(veto){verdict="Avoid";conv=0;}
    let why;
    if(veto)why="BD\u2019s safety filter flagged this: "+veto+". The exit is the problem, not the entry \u2014 avoid.";
    else if(downgraded)why="Technicals point up, but the Activity layer read Distribution \u2014 a block being sold into the move. The leading signal overrides, so this drops to Watch.";
    else why=agreeN+" of 6 engines agree."+(act.dir==="bullish"||act.dir==="stealth"?" Activity confirms ("+act.read.toLowerCase()+"), adding conviction.":act.dir==="neutral"?" Activity is quiet today.":"");
    const mem=[
      {label:"Picker",val:"",inn:!!f.picker},
      {label:"WMA",val:sigAbbr(wsig),inn:agree.WMA===1},
      {label:"Tech",val:tsc!=null?Math.round(tsc):"",inn:agree.TCH===1},
      {label:"Combined",val:"",inn:!!f.combined},
      {label:"BD",val:bdScore!=null?Math.round(bdScore):"",inn:agree.BD===1},
    ];
    return {code,sector,ltp,rsi,vol,conv,verdict,downgraded,veto,act,agree,agreeN,reads,wsig,tech,plan,why,mem};
  }
  window.__ms = {
    ready: async function(){
      if(loaded && DATA) return;
      const res=await Promise.all(FEEDS.map(x=>fj(x.path)));
      DATA={};
      FEEDS.forEach((x,i)=>{ (x.pick(res[i])||[]).forEach(r=>{ const c=String(r.code||'').toUpperCase(); if(!c)return; (DATA[c]||(DATA[c]={}))[x.key]=r; }); });
      loaded=true;
      STOCKS=Object.keys(DATA).map(c=>compute(c,DATA[c])).filter(s=>s.agreeN>=1).sort((a,b)=>b.conv-a.conv);
    },
    for: function(code){ code=String(code||'').toUpperCase(); const ex=STOCKS.find(s=>s.code===code); if(ex)return ex; return (DATA&&DATA[code])?compute(code,DATA[code]):null; },
    convCol: convCol
  };
})();
