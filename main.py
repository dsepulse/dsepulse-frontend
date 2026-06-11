"""
DSE Pulse — Backend API v3.0
All data served from Supabase DB.
"""
from fastapi import FastAPI, HTTPException, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional, List
import os, json, hashlib, hmac, base64, time, urllib.request
from datetime import datetime, date, timedelta

app = FastAPI(title="DSE Pulse API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SUPABASE_URL    = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY    = os.getenv("SUPABASE_KEY", "")
SUPABASE_SECRET = os.getenv("SUPABASE_SECRET", "")
JWT_SECRET      = os.getenv("JWT_SECRET", "dsepulse2026secret")
ADMIN_KEY       = os.getenv("ADMIN_KEY", "dsepulse-admin-2026")
SSL_STORE       = os.getenv("SSLCOMMERZ_STORE", "")
SSL_PASS        = os.getenv("SSLCOMMERZ_PASS", "")
SSL_SANDBOX     = os.getenv("SSLCOMMERZ_SANDBOX", "true") == "true"
TRIAL_DAYS      = 7

SAMPLE_PICKS = [
    {"rank":1,"code":"MIRAKHTER","cat":"A","ltp":47.00,"pct":6.58,"bz":"৳46.25-৳46.80","l1":47.94,"l2":49.35,"l3":50.76,"sl":45.59,"rr":2.9,"score":39,"vol":6.79,"consec":1},
    {"rank":2,"code":"ACMEPL","cat":"B","ltp":26.10,"pct":6.10,"bz":"৳25.50-৳25.90","l1":26.62,"l2":27.41,"l3":28.19,"sl":25.32,"rr":2.2,"score":37,"vol":11.15,"consec":3},
    {"rank":3,"code":"AGNISYSL","cat":"A","ltp":30.00,"pct":3.45,"bz":"৳29.60-৳29.90","l1":30.60,"l2":31.50,"l3":32.40,"sl":29.10,"rr":2.0,"score":34.5,"vol":5.73,"consec":1},
    {"rank":4,"code":"EHL","cat":"A","ltp":92.20,"pct":5.01,"bz":"৳90.80-৳91.60","l1":94.04,"l2":96.81,"l3":99.58,"sl":89.43,"rr":1.9,"score":34.2,"vol":1.38,"consec":1},
    {"rank":5,"code":"MONOSPOOL","cat":"A","ltp":109.90,"pct":5.77,"bz":"৳108.00-৳109.20","l1":112.10,"l2":115.40,"l3":118.69,"sl":106.60,"rr":1.8,"score":34.0,"vol":1.87,"consec":1},
    {"rank":6,"code":"NCCBANK","cat":"A","ltp":15.50,"pct":0.65,"bz":"৳15.20-৳15.40","l1":15.81,"l2":16.28,"l3":16.74,"sl":15.05,"rr":2.1,"score":33.3,"vol":21.98,"consec":1},
    {"rank":7,"code":"NAVANAPHAR","cat":"A","ltp":75.40,"pct":1.75,"bz":"৳74.00-৳74.90","l1":76.91,"l2":79.17,"l3":81.43,"sl":73.14,"rr":2.0,"score":32.5,"vol":2.84,"consec":1},
    {"rank":8,"code":"LOVELLO","cat":"A","ltp":75.00,"pct":2.32,"bz":"৳73.60-৳74.60","l1":76.50,"l2":78.75,"l3":81.00,"sl":72.75,"rr":1.8,"score":32.4,"vol":2.65,"consec":1},
    {"rank":9,"code":"BSC","cat":"A","ltp":108.60,"pct":4.93,"bz":"৳106.80-৳108.00","l1":110.77,"l2":114.03,"l3":117.29,"sl":105.34,"rr":1.5,"score":31.8,"vol":1.21,"consec":1},
    {"rank":10,"code":"BXPHARMA","cat":"A","ltp":125.30,"pct":1.95,"bz":"৳123.50-৳124.80","l1":127.81,"l2":131.57,"l3":135.32,"sl":121.54,"rr":1.8,"score":31.4,"vol":1.20,"consec":1},
]

DEFAULT_PRICING = {
    "monthly":   {"free":0,"premium":499,"pro":999},
    "quarterly": {"free":0,"premium":1347,"pro":2697,"label":"Save 10%"},
    "annual":    {"free":0,"premium":4790,"pro":9590,"label":"Save 20%"},
    "trial_days": 7
}

# ── SUPABASE ──────────────────────────────────────────────────────────────────
def db(table, method="GET", data=None, params="", use_secret=False, prefer="return=representation"):
    if not SUPABASE_URL:
        return [] if method=="GET" else {}
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    key = SUPABASE_SECRET if use_secret else SUPABASE_KEY
    headers = {"apikey":key,"Authorization":f"Bearer {key}","Content-Type":"application/json","Prefer":prefer}
    body = json.dumps(data).encode() if data else None
    try:
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=10) as r:
            resp = r.read()
            return json.loads(resp) if resp else []
    except Exception as e:
        print(f"DB error {table}: {e}")
        return [] if method=="GET" else {}

def db_one(table, params=""):
    r = db(table, params=params+"&limit=1")
    return r[0] if r else None

# ── JWT ───────────────────────────────────────────────────────────────────────
def make_token(payload):
    h   = base64.urlsafe_b64encode(json.dumps({"alg":"HS256","typ":"JWT"}).encode()).rstrip(b'=')
    payload["exp"] = int(time.time()) + 86400*30
    p   = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b'=')
    sig = base64.urlsafe_b64encode(hmac.new(JWT_SECRET.encode(), h+b"."+p, hashlib.sha256).digest()).rstrip(b'=')
    return (h+b"."+p+b"."+sig).decode()

def decode_token(token):
    try:
        parts = token.split(".")
        payload = json.loads(base64.urlsafe_b64decode(parts[1]+"=="))
        if payload.get("exp",0) < int(time.time()):
            raise HTTPException(status_code=401, detail="Token expired")
        return payload
    except HTTPException: raise
    except: raise HTTPException(status_code=401, detail="Invalid token")

def hash_pass(p): return hashlib.sha256(f"{p}{JWT_SECRET}".encode()).hexdigest()

def get_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return decode_token(authorization.split(" ")[1])

def get_admin(x_admin_key: Optional[str] = Header(None)):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Admin access required")
    return True

def trial_info(user):
    ts = user.get("trial_start")
    left, expired = TRIAL_DAYS, False
    if ts and user.get("plan","free") == "free":
        try:
            days = (datetime.now()-datetime.fromisoformat(ts)).days
            left = max(0, TRIAL_DAYS-days)
            expired = days >= TRIAL_DAYS
        except: pass
    return left, expired

# ── MODELS ────────────────────────────────────────────────────────────────────
class Register(BaseModel):
    name: str; email: str; password: str; phone: Optional[str]=""

class Login(BaseModel):
    email: str; password: str

class Signal(BaseModel):
    stock_code: str; signal: str

class AdminPicks(BaseModel):
    picks: list; date: Optional[str]=None

class AdminHistory(BaseModel):
    date: str; outcomes: dict

class AdminPricing(BaseModel):
    monthly_premium:int=499; monthly_pro:int=999
    quarterly_premium:int=1347; quarterly_pro:int=2697
    annual_premium:int=4790; annual_pro:int=9590
    trial_days:int=7

class AdminFeatures(BaseModel):
    gates: list

class AdminBlog(BaseModel):
    title:str; category:str="General"; plan_required:str="free"
    content:str=""; excerpt:str=""; read_time:int=5; status:str="published"

class PlanChange(BaseModel):
    user_id:str; plan:str; expires_at:Optional[str]=None

class WMAUpload(BaseModel):
    source: str = "dse_wma"
    trade_date: Optional[str] = None
    generated_at: Optional[str] = None
    summary: Optional[dict] = None
    stocks: list = []

class TechUpload(BaseModel):
    source: str = "dse_tech"
    trade_date: Optional[str] = None
    generated_at: Optional[str] = None
    summary: Optional[dict] = None
    stocks: list = []

# ── TECHNICAL ANALYSIS ────────────────────────────────────────────────────────
def calc_wma(prices, period):
    if len(prices) < period: return prices[-1] if prices else 0.0
    s = prices[-period:]
    w = list(range(1,period+1))
    return round(sum(p*wt for p,wt in zip(s,w))/sum(w), 2)

def calc_ema(prices, period):
    if not prices: return 0.0
    k = 2.0/(period+1); ema = prices[0]
    for p in prices[1:]: ema = p*k + ema*(1-k)
    return round(ema, 2)

def calc_rsi(prices, period=14):
    if len(prices) < period+1: return 50.0
    gains=[max(prices[i]-prices[i-1],0) for i in range(1,len(prices))]
    losses=[max(prices[i-1]-prices[i],0) for i in range(1,len(prices))]
    ag=sum(gains[-period:])/period; al=sum(losses[-period:])/period
    return round(100-(100/(1+ag/al)),2) if al else 100.0

def calc_macd(prices, fast=12, slow=26, signal=9):
    if len(prices)<slow: return {"macd":0,"signal":0,"histogram":0,"cross":"NEUTRAL"}
    mv=[]
    for i in range(slow-1,len(prices)):
        mv.append(round(calc_ema(prices[:i+1][-fast*2:],fast)-calc_ema(prices[:i+1][-slow*2:],slow),4))
    ml=mv[-1]; sl2=calc_ema(mv[-signal*3:],signal) if len(mv)>=signal else mv[-1]
    hist=round(ml-sl2,4)
    cross="NEUTRAL"
    if len(mv)>=2:
        ph=round(mv[-2]-sl2,4)
        if ph<=0 and hist>0: cross="BULLISH_CROSS"
        elif ph>=0 and hist<0: cross="BEARISH_CROSS"
        elif hist>0: cross="BULLISH"
        else: cross="BEARISH"
    return {"macd":round(ml,2),"signal":round(sl2,2),"histogram":round(hist,2),"cross":cross}

def calc_wma_signals(prices):
    w9=calc_wma(prices,9); w34=calc_wma(prices,34)
    w89=calc_wma(prices,min(89,len(prices)))
    if w9>w34>w89: sig,lbl="STRONG_BUY","Strong Buy — WMA9>WMA34>WMA89"
    elif w9>w34:   sig,lbl="BUY","Buy — WMA9 above WMA34"
    elif w9<w34<w89: sig,lbl="STRONG_SELL","Strong Sell — all bearish"
    elif w9<w34:   sig,lbl="SELL","Sell — WMA9 below WMA34"
    else:          sig,lbl="NEUTRAL","Neutral — wait for crossover"
    trend="UPTREND" if w34>w89 else "DOWNTREND" if w34<w89*0.995 else "SIDEWAYS"
    return {"wma9":w9,"wma34":w34,"wma89":w89,"signal":sig,"signal_label":lbl,"trend":trend}

def score_stock(s, dsex_change=0.66):
    ltp=float(s.get("ltp",0)); pct=float(s.get("pct",0))
    vol=float(s.get("vol",0)); avg_vol=float(s.get("avg_vol",vol or 1))
    cat=str(s.get("cat","B")).upper(); low=float(s.get("low",ltp*0.97))
    rsi=float(s.get("rsi",50))
    score=0
    score += min(max(pct,0)*3,20)
    vr=(vol/avg_vol) if avg_vol>0 else 1
    score += min(vr*5,20)
    dm=1.0 if dsex_change>0.5 else 0.7 if dsex_change>0 else 0.5 if dsex_change>-0.5 else 0.3
    score *= dm
    agg=round(low*1.005,2); cons=round(low*1.015,2)
    entry=cons; l1=round(entry*1.02,2); l2=round(entry*1.05,2); l3=round(entry*1.08,2); sl=round(entry*0.97,2)
    rr=round((l1-entry)/(entry-sl),2) if entry>sl else 0
    score += min(rr*4,15) if rr>=1.5 else 0
    score += {"A":10,"B":5,"Z":0}.get(cat,0)
    cd=((ltp*1.1-ltp)/ltp*100) if ltp else 0; score += 8 if cd>7 else 4 if cd>4 else 0
    score += 10 if 30<=rsi<=50 else 6 if rsi<=65 else 0
    score=round(min(score,100),1)
    sig="BUY" if score>=70 else "WATCH" if score>=50 else "CAUTION" if score>=35 else "AVOID"
    return {"code":s.get("code",""),"cat":cat,"ltp":ltp,"pct":pct,"score":round(score/2,1),
            "signal":sig,"buy_zone":f"৳{agg}-৳{cons}","entry":entry,
            "l1":l1,"l2":l2,"l3":l3,"sl":sl,"rr":rr,
            "rsi":rsi,"volume_ratio":round(vr,2)}

def build_card(code):
    """Build the Scan/Analyse card shape the frontend (renderScan) expects.
    Best-effort from stocks/picks/wma_signals + score_stock. Returns None if unknown."""
    code = code.upper()
    s  = db_one("stocks", f"?code=eq.{code}")
    pk = db_one("picks", f"?code=eq.{code}&order=date.desc&limit=1")
    wm = db_one("wma_signals", f"?code=eq.{code}&order=trade_date.desc&limit=1")
    src = s or pk or wm
    if not src:
        return None
    ltp = float(src.get("ltp", 0) or 0)
    pct = float(src.get("pct", 0) or 0)
    cat = str(src.get("cat", "A")).upper()
    name = (s or {}).get("name") or src.get("name") or code
    sector = (s or {}).get("sector") or src.get("sector") or "—"
    m  = db_one("market_summary", f"?date=eq.{date.today().isoformat()}")
    dc = float(m["dsex_change"]) if m else 0.66
    base = score_stock({**src, "code": code, "cat": cat, "ltp": ltp, "pct": pct}, dc)
    score = float(pk["score"]) if pk and pk.get("score") is not None else base["score"]
    sig = "STRONG BUY" if score >= 38 else "BUY" if score >= 30 else "WATCH" if score >= 20 else "CAUTION"
    entry = float(pk["l1"]) if pk and pk.get("l1") else base["entry"]
    t1    = float(pk["l2"]) if pk and pk.get("l2") else base["l1"]
    sl    = float(pk["sl"]) if pk and pk.get("sl") else base["sl"]
    rr    = float(pk["rr"]) if pk and pk.get("rr") else base["rr"]
    tf = "1–3 days" if sig in ("STRONG BUY", "BUY") else "5–8 days"
    vr = base.get("volume_ratio", 1)
    bars = [
        ["Momentum",    min(int(max(pct, 0) * 1.5), 10), 10, "#1A6B3C"],
        ["Volume surge", min(int(vr * 2), 10),           10, "#1D4ED8"],
        ["Trade count",  5,                               7, "#B8860B"],
        ["Category",     {"A": 5, "B": 3, "Z": 1}.get(cat, 3), 5, "#7C3AED"],
        ["RSI zone",     4,                               5, "#C2410C"],
        ["R/R",          min(int(rr * 2), 5),             5, "#1A6B3C"],
    ]
    flags = ["✅ Cat A" if cat == "A" else f"⚠ Cat {cat}",
             "✅ Positive today" if pct > 0 else "⚠ Negative today"]
    if vr >= 2: flags.append(f"✅ Vol {vr:.1f}×")
    if wm and wm.get("fresh"): flags.append("🔔 Fresh cross")
    return {"name": name, "cat": cat, "sector": sector, "ltp": ltp, "chg": pct,
            "score": round(score, 1), "sig": sig, "entry": round(entry, 2),
            "t1": round(t1, 2), "sl": round(sl, 2), "rr": round(rr, 1),
            "tf": tf, "bars": bars, "flags": flags}

# ── ENDPOINTS ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    test=db("users",params="?limit=1")
    return {"status":"ok","service":"DSE Pulse API v3","db":"connected" if test is not None else "error","time":datetime.now().isoformat()}

@app.get("/api/config")
def api_config():
    pr=db_one("config","?key=eq.pricing"); ft=db_one("config","?key=eq.features")
    return {"pricing":json.loads(pr["value"]) if pr else DEFAULT_PRICING,"features":[] if not ft else json.loads(ft["value"])}

@app.get("/api/picks/today")
def picks_today():
    latest=db_one("picks","?order=date.desc&limit=1")
    if not latest:
        return {"status":"sample","date":date.today().isoformat(),"picks":SAMPLE_PICKS}
    d=latest.get("date") or date.today().isoformat()
    rows=db("picks",params=f"?date=eq.{d}&order=rank.asc")
    return {"status":"live" if rows else "sample","date":d,"picks":rows or SAMPLE_PICKS}

@app.get("/api/market")
def api_market():
    today=date.today().isoformat()
    row=db_one("market_summary",f"?date=eq.{today}")
    return {"status":"live" if row else "sample","market":row or {"dsex":5847.2,"dsex_change":0.66,"mood":"GREEN","gainers":124,"losers":89,"neutral":48}}

@app.get("/api/blog")
def api_blog():
    rows=db("articles",params="?status=eq.published&order=created_at.desc")
    return {"articles":rows or []}

@app.post("/api/auth/register")
def register(body: Register):
    email=body.email.lower().strip()
    if db("users",params=f"?email=eq.{email}&limit=1",use_secret=True):
        raise HTTPException(status_code=400,detail="Email already registered")
    uid=hashlib.md5(f"{email}{time.time()}".encode()).hexdigest()
    user={"id":uid,"email":email,"name":body.name,"phone":body.phone or "","password_hash":hash_pass(body.password),"plan":"free","trial_start":datetime.now().isoformat(),"trial_active":True,"created_at":datetime.now().isoformat(),"status":"active"}
    db("users",method="POST",data=user,use_secret=True)
    token=make_token({"user_id":uid,"email":email,"plan":"free","trial_start":user["trial_start"],"name":body.name})
    return {"token":token,"plan":"free","trial_days_left":TRIAL_DAYS}

@app.post("/api/auth/login")
def login(body: Login):
    email=body.email.lower().strip()
    users=db("users",params=f"?email=eq.{email}&limit=1",use_secret=True)
    if not users: raise HTTPException(status_code=401,detail="Invalid email or password")
    u=users[0]
    if u.get("status")=="banned": raise HTTPException(status_code=403,detail="Account suspended")
    if u.get("password_hash")!=hash_pass(body.password): raise HTTPException(status_code=401,detail="Invalid email or password")
    left,expired=trial_info({"plan":u.get("plan","free"),"trial_start":u.get("trial_start")})
    token=make_token({"user_id":u["id"],"email":email,"plan":u.get("plan","free"),"trial_start":u.get("trial_start"),"name":u.get("name","")})
    return {"token":token,"plan":u.get("plan","free"),"trial_days_left":left,"trial_expired":expired,"name":u.get("name","")}

@app.get("/api/auth/me")
def me(user=Depends(get_user)):
    left,expired=trial_info(user)
    return {"user_id":user.get("user_id"),"email":user.get("email"),"name":user.get("name",""),"plan":user.get("plan","free"),"trial_days_left":left,"trial_expired":expired}

@app.get("/api/picks/full")
def picks_full(user=Depends(get_user)):
    plan=user.get("plan","free"); left,expired=trial_info(user)
    if expired: return {"status":"trial_expired","picks":[],"message":"Your 7-day trial has ended. Please upgrade to Premium."}
    today=date.today().isoformat()
    rows=db("picks",params=f"?date=eq.{today}&order=rank.asc") or SAMPLE_PICKS
    limit=10 if plan in ["premium","pro"] else 3
    return {"status":"ok","plan":plan,"picks":rows[:limit],"trial_days_left":left}

@app.get("/api/dashboard")
def dashboard(user=Depends(get_user)):
    today=date.today().isoformat()
    picks=db("picks",params=f"?date=eq.{today}&order=rank.asc") or SAMPLE_PICKS
    market=db_one("market_summary",f"?date=eq.{today}") or {"dsex":5847.2,"dsex_change":0.66,"mood":"GREEN"}
    left,expired=trial_info(user)
    return {"picks":picks[:3],"market":market,"plan":user.get("plan","free"),"trial_days_left":left,"trial_expired":expired}

@app.get("/api/history")
def get_history(user=Depends(get_user)):
    plan=user.get("plan","free"); left,_=trial_info(user)
    days=365 if plan in ["premium","pro"] else 7
    since=(date.today()-timedelta(days=days)).isoformat()
    rows=db("pick_history",params=f"?date=gte.{since}&order=date.desc")
    return {"history":rows or [],"plan":plan}

@app.get("/api/stocks")
def api_stocks(cat:Optional[str]=None,min_price:Optional[float]=None,max_price:Optional[float]=None,user=Depends(get_user)):
    plan=user.get("plan","free"); limit=426 if plan in ["premium","pro"] else 50
    params="?order=score.desc.nullslast"
    if cat: params+=f"&cat=eq.{cat}"
    stocks=db("stocks",params=params)
    if not stocks: stocks=db("picks",params=f"?date=eq.{date.today().isoformat()}&order=rank.asc") or SAMPLE_PICKS
    if min_price: stocks=[s for s in stocks if float(s.get("ltp",0))>=min_price]
    if max_price: stocks=[s for s in stocks if float(s.get("ltp",0))<=max_price]
    return {"stocks":stocks[:limit],"plan":plan}

@app.get("/api/portfolio")
def get_portfolio(user=Depends(get_user)):
    rows=db("holdings",params=f"?user_id=eq.{user['user_id']}&order=created_at.desc",use_secret=True)
    return {"holdings":rows or []}

@app.post("/api/portfolio")
def save_portfolio(data:dict,user=Depends(get_user)):
    data["user_id"]=user["user_id"]; data["updated_at"]=datetime.now().isoformat()
    db("holdings",method="POST",data=data,use_secret=True)
    return {"status":"saved"}

@app.get("/api/signals")
def get_signals(user=Depends(get_user)):
    rows=db("signals",params=f"?user_id=eq.{user['user_id']}",use_secret=True)
    return {"signals":{r["stock_code"]:r["signal"] for r in (rows or [])}}

@app.post("/api/signals")
def save_signal(body:Signal,user=Depends(get_user)):
    uid=user["user_id"]
    ex=db("signals",params=f"?user_id=eq.{uid}&stock_code=eq.{body.stock_code}",use_secret=True)
    data={"user_id":uid,"stock_code":body.stock_code,"signal":body.signal,"updated_at":datetime.now().isoformat()}
    if ex: db("signals",method="PATCH",data=data,params=f"?user_id=eq.{uid}&stock_code=eq.{body.stock_code}",use_secret=True)
    else: db("signals",method="POST",data=data,use_secret=True)
    return {"status":"saved"}

@app.get("/api/analyse/{code}")
def analyse(code:str):
    code=code.upper()
    s=db_one("stocks",f"?code=eq.{code}") or db_one("picks",f"?date=eq.{date.today().isoformat()}&code=eq.{code}")
    if not s: s={"code":code,"cat":"A","ltp":0,"pct":0,"vol":0,"avg_vol":0,"rsi":50}
    m=db_one("market_summary",f"?date=eq.{date.today().isoformat()}")
    dc=float(m["dsex_change"]) if m else 0.66
    ph=db("price_history",params=f"?code=eq.{code}&order=date.asc&limit=120")
    prices=[float(r["close"]) for r in ph] if ph else []
    if len(prices)<9:
        ltp=float(s.get("ltp",100)); pct=float(s.get("pct",0))
        prev=ltp/(1+pct/100) if pct!=-100 else ltp
        prices=[prev*(1+i*0.001) for i in range(88)]+[ltp]
    wma=calc_wma_signals(prices); macd=calc_macd(prices); rsi=calc_rsi(prices); base=score_stock(s,dc)
    bull=sum([wma["signal"] in ["STRONG_BUY","BUY"],macd["cross"] in ["BULLISH","BULLISH_CROSS"],30<=rsi<=60,(float(s.get("vol",0))/float(s.get("avg_vol",1)))>=1.2 if s.get("avg_vol") else False])
    verdict="STRONG BUY" if bull>=3 and base["signal"]=="BUY" else "BUY" if bull>=2 else "AVOID" if bull<=1 else "WATCH"
    card=build_card(code) or {}
    return {"status":"ok","code":code,"verdict":verdict,"confluence":f"{bull}/4 indicators bullish","wma":wma,"macd":macd,"rsi":rsi,"rsi_signal":"OVERSOLD" if rsi<30 else "OVERBOUGHT" if rsi>70 else "NEUTRAL",**base,"as_of":datetime.now().strftime("%d %b %Y %H:%M"),"indicators":"WMA(9,34,89) + MACD(12,26,9) + RSI(14)",**card}

@app.get("/api/calculator")
def calculator(code:str,capital:float,user=Depends(get_user)):
    code=code.upper()
    s=db_one("stocks",f"?code=eq.{code}") or db_one("picks",f"?date=eq.{date.today().isoformat()}&code=eq.{code}")
    if not s: raise HTTPException(status_code=404,detail=f"Stock {code} not found")
    m=db_one("market_summary",f"?date=eq.{date.today().isoformat()}")
    a=score_stock(s,float(m["dsex_change"]) if m else 0.66)
    entry=a["entry"]; shares=int(capital/entry) if entry>0 else 0
    return {"code":code,"entry":entry,"shares":shares,"cost":round(shares*entry,2),"l1":{"price":a["l1"],"profit":round((a["l1"]-entry)*shares*0.4,2)},"l2":{"price":a["l2"],"profit":round((a["l2"]-entry)*shares*0.4,2)},"l3":{"price":a["l3"],"profit":round((a["l3"]-entry)*shares*0.2,2)},"sl":{"price":a["sl"],"loss":round((a["sl"]-entry)*shares,2)},"rr":a["rr"]}

@app.post("/api/admin/picks")
def admin_picks(body:AdminPicks,_=Depends(get_admin)):
    today=body.date or date.today().isoformat()
    db("picks",method="DELETE",params=f"?date=eq.{today}",use_secret=True)
    cols={"rank","code","cat","ltp","pct","bz","l1","l2","l3","sl","rr","score","vol","consec"}
    saved=0
    for p in body.picks:
        row={k:v for k,v in p.items() if k in cols}
        row["date"]=today; row["created_at"]=datetime.now().isoformat()
        r=db("picks",method="POST",data=row,use_secret=True)
        if r: saved+=1
    return {"status":"saved","date":today,"attempted":len(body.picks),"saved":saved}

@app.post("/api/admin/history")
def admin_history(body:AdminHistory,_=Depends(get_admin)):
    for code,out in body.outcomes.items():
        ex=db("pick_history",params=f"?date=eq.{body.date}&code=eq.{code}",use_secret=True)
        data={"date":body.date,"code":code,"outcome":out.get("outcome","OPEN"),"pl":out.get("pl",""),"updated_at":datetime.now().isoformat()}
        if ex: db("pick_history",method="PATCH",data=data,params=f"?date=eq.{body.date}&code=eq.{code}",use_secret=True)
        else: db("pick_history",method="POST",data=data,use_secret=True)
    return {"status":"saved"}

@app.post("/api/admin/pricing")
def admin_pricing(body:AdminPricing,_=Depends(get_admin)):
    pricing={"monthly":{"free":0,"premium":body.monthly_premium,"pro":body.monthly_pro},"quarterly":{"free":0,"premium":body.quarterly_premium,"pro":body.quarterly_pro,"label":"Save 10%"},"annual":{"free":0,"premium":body.annual_premium,"pro":body.annual_pro,"label":"Save 20%"},"trial_days":body.trial_days}
    ex=db_one("config","?key=eq.pricing")
    data={"key":"pricing","value":json.dumps(pricing),"updated_at":datetime.now().isoformat()}
    if ex: db("config",method="PATCH",data=data,params="?key=eq.pricing",use_secret=True)
    else: db("config",method="POST",data=data,use_secret=True)
    return {"status":"saved"}

@app.post("/api/admin/features")
def admin_features(body:AdminFeatures,_=Depends(get_admin)):
    ex=db_one("config","?key=eq.features")
    data={"key":"features","value":json.dumps(body.gates),"updated_at":datetime.now().isoformat()}
    if ex: db("config",method="PATCH",data=data,params="?key=eq.features",use_secret=True)
    else: db("config",method="POST",data=data,use_secret=True)
    return {"status":"saved"}

@app.post("/api/admin/blog")
def admin_blog(body:AdminBlog,_=Depends(get_admin)):
    db("articles",method="POST",data={"title":body.title,"category":body.category,"plan_required":body.plan_required,"content":body.content,"excerpt":body.excerpt,"read_time":body.read_time,"status":body.status,"created_at":datetime.now().isoformat()},use_secret=True)
    return {"status":"published"}

@app.get("/api/admin/users")
def admin_users(_=Depends(get_admin)):
    users=db("users",params="?order=created_at.desc&limit=200",use_secret=True) or []
    return {"users":[{k:v for k,v in u.items() if k!="password_hash"} for u in users],"count":len(users)}

@app.post("/api/admin/user/plan")
def admin_plan(body:PlanChange,_=Depends(get_admin)):
    data={"plan":body.plan,"updated_at":datetime.now().isoformat()}
    if body.expires_at: data["plan_expires_at"]=body.expires_at
    db("users",method="PATCH",data=data,params=f"?id=eq.{body.user_id}",use_secret=True)
    return {"status":"updated"}

@app.post("/api/admin/user/ban")
def admin_ban(body:dict,_=Depends(get_admin)):
    status="banned" if body.get("ban") else "active"
    db("users",method="PATCH",data={"status":status},params=f"?id=eq.{body['user_id']}",use_secret=True)
    return {"status":status}

@app.get("/api/admin/stats")
def admin_stats(_=Depends(get_admin)):
    users=db("users",params="?select=plan,status",use_secret=True) or []
    prem=sum(1 for u in users if u.get("plan")=="premium")
    pro=sum(1 for u in users if u.get("plan")=="pro")
    return {"total":len(users),"premium":prem,"pro":pro,"free":sum(1 for u in users if u.get("plan")=="free"),"mrr":prem*499+pro*999}

@app.post("/api/admin/market")
def admin_market(data:dict,_=Depends(get_admin)):
    today=data.get("date",date.today().isoformat())
    md={"date":today,"dsex":data.get("dsex",0),"dsex_change":data.get("dsex_change",0),"mood":"GREEN" if float(data.get("dsex_change",0))>0.5 else "RED" if float(data.get("dsex_change",0))<-0.5 else "NEUTRAL","gainers":data.get("gainers",0),"losers":data.get("losers",0),"neutral":data.get("neutral",0),"updated_at":datetime.now().isoformat()}
    ex=db_one("market_summary",f"?date=eq.{today}")
    if ex: db("market_summary",method="PATCH",data=md,params=f"?date=eq.{today}",use_secret=True)
    else: db("market_summary",method="POST",data=md,use_secret=True)
    return {"status":"saved"}

@app.post("/api/admin/stocks/bulk")
def admin_stocks(data:dict,_=Depends(get_admin)):
    stocks=data.get("stocks",[])
    cols={"code","cat","ltp","pct","rsi","score","updated_at"}
    now=datetime.now().isoformat()
    rows=[]; codes=[]
    for s in stocks:
        code=str(s.get("code","")).upper()
        if not code: continue
        r={k:v for k,v in s.items() if k in cols}
        r["code"]=code; r["updated_at"]=now
        rows.append(r); codes.append(code)
    if not rows: return {"status":"saved","count":0}
    # Upsert as two bulk requests instead of ~2×N: delete these codes, then bulk insert.
    for i in range(0,len(codes),100):
        chunk=codes[i:i+100]
        db("stocks",method="DELETE",params=f"?code=in.({','.join(chunk)})",use_secret=True)
    db("stocks",method="POST",data=rows,use_secret=True,prefer="return=minimal")
    return {"status":"saved","count":len(rows)}

@app.post("/api/payment/success")
async def payment_success(request:Request):
    form=await request.form()
    uid=form.get("value_a",""); plan=form.get("value_b","premium"); period=form.get("value_c","monthly")
    expires=(datetime.now()+timedelta(days=30 if period=="monthly" else 90 if period=="quarterly" else 365)).isoformat()
    db("users",method="PATCH",data={"plan":plan,"plan_expires_at":expires},params=f"?id=eq.{uid}",use_secret=True)
    return RedirectResponse(f"{os.getenv('SITE_URL','https://dsepulse.com')}?payment=success")

@app.post("/api/payment/fail")
async def payment_fail(request:Request):
    return RedirectResponse(f"{os.getenv('SITE_URL','https://dsepulse.com')}?payment=failed")

# ── DSE PULSE TOOL INTEGRATION (uploads from desktop tools + public reads) ──────
@app.post("/api/admin/wma-upload")
def admin_wma_upload(body: WMAUpload, _=Depends(get_admin)):
    """Receive WMA results from the desktop tool and write to Supabase."""
    td  = body.trade_date or date.today().isoformat()
    now = datetime.now().isoformat()
    # replace any existing rows for this trade date
    db("wma_signals", method="DELETE", params=f"?trade_date=eq.{td}", use_secret=True)
    rows = []
    for s in body.stocks:
        code = str(s.get("code", "")).upper()
        if not code:
            continue
        rows.append({
            "trade_date": td, "code": code, "cat": s.get("cat", ""),
            "ltp": s.get("ltp"), "pct": s.get("pct"),
            "wma9": s.get("wma9"), "wma34": s.get("wma34"), "wma89": s.get("wma89"),
            "wma9_trend": s.get("wma9_trend", ""), "signal": s.get("signal", ""),
            "fresh": s.get("fresh", ""), "volume": s.get("volume"),
            "value": s.get("value"), "data_days": s.get("data_days"),
            "created_at": now,
        })
    if rows:
        db("wma_signals", method="POST", data=rows, use_secret=True)   # bulk insert
    # cache a small summary for quick reads
    summ = body.summary or {}
    summ.update({"trade_date": td, "generated_at": body.generated_at or now})
    cdata = {"key": "wma_summary", "value": json.dumps(summ), "updated_at": now}
    if db_one("config", "?key=eq.wma_summary"):
        db("config", method="PATCH", data=cdata, params="?key=eq.wma_summary", use_secret=True)
    else:
        db("config", method="POST", data=cdata, use_secret=True)
    return {"status": "saved", "trade_date": td, "count": len(rows)}

@app.get("/api/wma/today")
def wma_today():
    """Public: latest WMA signals for the site (STRONG BUY first, by value)."""
    latest = db_one("wma_signals", "?order=trade_date.desc&limit=1")
    if not latest:
        return []          # frontend falls back to its sample data
    td = latest["trade_date"]
    rows = db("wma_signals", params=f"?trade_date=eq.{td}&limit=500") or []
    rank = {"STRONG BUY": 0, "BUY": 1, "NEUTRAL": 2, "SELL": 3, "STRONG SELL": 4}
    rows.sort(key=lambda r: (rank.get(r.get("signal", ""), 5), -float(r.get("value") or 0)))
    return [{
        "code": r.get("code"), "cat": r.get("cat"),
        "ltp": float(r.get("ltp") or 0),
        "wma9": float(r.get("wma9") or 0), "wma34": float(r.get("wma34") or 0),
        "wma89": float(r.get("wma89") or 0),
        "signal": r.get("signal", ""), "fresh": r.get("fresh", ""),
    } for r in rows[:60]]

@app.post("/api/admin/tech-upload")
def admin_tech_upload(body: TechUpload, _=Depends(get_admin)):
    """Receive Tech Analysis (/100) results from the desktop tool."""
    td  = body.trade_date or date.today().isoformat()
    now = datetime.now().isoformat()
    db("tech_signals", method="DELETE", params=f"?trade_date=eq.{td}", use_secret=True)
    cols = {"code","cat","ltp","pct","score","rsi","signal",
            "wma_score","macd_score","rsi_score","vol_score","bb_score","value"}
    rows = []
    for s in body.stocks:
        code = str(s.get("code","")).upper()
        if not code: continue
        r = {k: v for k, v in s.items() if k in cols}
        r["code"] = code; r["trade_date"] = td; r["created_at"] = now
        rows.append(r)
    if rows:
        db("tech_signals", method="POST", data=rows, use_secret=True, prefer="return=minimal")
    return {"status": "saved", "trade_date": td, "count": len(rows)}

@app.get("/api/tech/today")
def tech_today():
    """Public: latest Tech /100 scores, highest first."""
    latest = db_one("tech_signals", "?order=trade_date.desc&limit=1")
    if not latest:
        return []
    td = latest["trade_date"]
    rows = db("tech_signals", params=f"?trade_date=eq.{td}&limit=500") or []
    rows.sort(key=lambda r: -float(r.get("score") or 0))
    return [{
        "code": r.get("code"), "cat": r.get("cat"),
        "ltp": float(r.get("ltp") or 0), "pct": float(r.get("pct") or 0),
        "score": float(r.get("score") or 0), "rsi": float(r.get("rsi") or 0),
        "signal": r.get("signal", ""),
        "sub": {"wma": r.get("wma_score"), "macd": r.get("macd_score"),
                "rsi": r.get("rsi_score"), "vol": r.get("vol_score"), "bb": r.get("bb_score")},
    } for r in rows[:100]]

@app.get("/api/ticker")
def ticker():
    """Public: scrolling ticker — DSEX + top movers. Empty list → frontend sample."""
    out = []
    m = db_one("market_summary", f"?date=eq.{date.today().isoformat()}") or db_one("market_summary", "?order=date.desc&limit=1")
    if m:
        ch = float(m.get("dsex_change", 0) or 0)
        out.append({"s": "DSEX", "p": f'{float(m.get("dsex", 0) or 0):,.1f}', "c": f'{ch:+.2f}%', "u": 1 if ch >= 0 else 0})
    for s in (db("stocks", params="?order=pct.desc&limit=12") or []):
        pct = float(s.get("pct", 0) or 0)
        out.append({"s": s.get("code", ""), "p": f'৳{float(s.get("ltp", 0) or 0):.2f}', "c": f'{pct:+.2f}%', "u": 1 if pct >= 0 else 0})
    return out

@app.get("/api/sectors/today")
def sectors_today():
    """Public: sector mood table. Empty list → frontend sample."""
    rows = db("sector_mood", params="?order=score.desc&limit=20") or []
    return [{"n": r.get("sector", ""), "s": r.get("count", 0), "sig": r.get("signal", "MIXED"),
             "sc": r.get("score", 50), "b": r.get("best", "")} for r in rows]

@app.get("/api/scan/{code}")
def scan(code: str):
    """Public: Daily Picker scan card. 404 → frontend sample."""
    card = build_card(code)
    if not card:
        raise HTTPException(status_code=404, detail=f"{code.upper()} not found")
    return card

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT",8000)))
