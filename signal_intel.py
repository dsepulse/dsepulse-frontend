"""
DSE Pulse — SIGNAL INTELLIGENCE                              close-only V1
============================================================================
An evaluation layer over the EXISTING signal engines. It reads what they
published, reads what the market did next, and records the two side by side.

WHAT IT DOES NOT DO
  It does not calculate a signal, change a formula, or write to any engine
  table. The only table it writes is signal_outcomes. Everything else it
  touches, it reads.

WHY THIS IS ITS OWN FILE
  main.py is around 8,300 lines and every change to it reaches the repository
  as a whole-file paste. Keeping this here means a Signal Intelligence change
  is a paste of THIS file — which cannot touch payments, authentication or the
  daily uploads even by accident.

  It also bounds the blast radius at runtime. main.py imports this inside a
  try/except, so a fault in here means the Signal Intelligence endpoints are
  absent, not that the live API fails to start.

HOW IT CONNECTS
  This module never imports main. main hands it what it needs through init():

      import signal_intel
      signal_intel.init(db=db, get_admin=get_admin, cron_secret=CRON_SECRET)
      app.include_router(signal_intel.router)

  No circular import, and this file can be tested on its own with a fake db.
============================================================================
"""
from fastapi import APIRouter, Depends, Header, HTTPException
from typing import Optional
from datetime import datetime
import time as _t

router = APIRouter()

#  Filled in by init(). Kept private so a caller cannot half-configure the
#  module by reaching in and setting one of them.
_db = None
_get_admin = None
_cron_secret = ""


def init(db, get_admin, cron_secret=""):
    """Receive the three things this module needs from the host application."""
    global _db, _get_admin, _cron_secret
    _db = db
    _get_admin = get_admin
    _cron_secret = cron_secret or ""


def _require_admin(x_admin_key: Optional[str] = Header(None)):
    """The host's own admin check, reached at REQUEST time rather than import
    time.

    Depends(get_admin) cannot be written directly in the decorator here,
    because decorators run when this file is imported and init() has not been
    called yet. Delegating keeps one definition of what "admin" means — this
    module never decides that for itself.
    """
    if _get_admin is None:
        raise HTTPException(status_code=503,
                            detail="signal_intel is not initialised")
    return _get_admin(x_admin_key)


# ══════════════════════════════════════════════════════════════════════════════
#  THE OUTCOME RULE
# ──────────────────────────────────────────────────────────────────────────────
#  Answers, for a signal given on day D: did a CLOSING price reach the target
#  before a CLOSING price reached the stop?
#
#  WHY CLOSE-ONLY, STATED ONCE HERE SO IT IS NEVER FORGOTTEN
#    price_history stores code, date and close. There is no high, no low, no
#    open. So the question above is the only one the data can answer, and it is
#    NOT the same question as "did the price touch the target intraday".
#
#    A stock that spiked through the target at 11am and closed below it is not
#    counted as a target hit here. A stock that dipped through the stop and
#    recovered by close is not counted as a stop hit. Both directions are
#    understated, and neither is a bug — it is the limit of the data.
#
#    Every row is written with basis='close'. When intraday high and low exist,
#    those outcomes arrive as basis='intraday' BESIDE these, never on top, so
#    the two can be compared instead of quietly merged.
#
#  ONE THING CLOSE-ONLY GETS RIGHT THAT INTRADAY CANNOT
#    A single closing price cannot be both at-or-above the target and
#    at-or-below the stop, because target > entry > stop. So there is never an
#    ordering ambiguity. With daily high and low there is: a day that touched
#    both needs a convention. Close-only has no such guesswork.
#
#  TRADING DAYS, NOT THE STOCK'S OWN TRADED DAYS
#    The horizon counts MARKET trading days — the distinct dates the exchange
#    published — not the days this particular stock happened to trade. A stock
#    suspended for a week would otherwise have its "+5 day" outcome measured
#    five weeks later and quietly compared against stocks measured in one.
#    A day the stock did not trade counts toward the horizon and contributes no
#    price.
# ══════════════════════════════════════════════════════════════════════════════

SI_HORIZONS = (1, 2, 3, 5, 10)
SI_MAX_HORIZON = max(SI_HORIZONS)

#  Every value `outcome` may take. Kept as a set so a typo becomes an error
#  rather than a row nobody ever queries again.
SI_OUTCOMES = {
    "target_first",       # a close reached the target before any close hit the stop
    "stop_first",         # the reverse
    "timeout",            # the horizon elapsed with neither reached
    "pending",            # the horizon has not elapsed yet — not a result
    "insufficient_data",  # the horizon elapsed but the closes are not there
    "not_traded",         # no usable entry price on the signal day
    "no_levels",          # the engine published no target and no stop
    "invalid_levels",     # levels that cannot be tested: target <= entry, etc.
}

#  An engine can be evaluated only if it published a target and a stop.
#  bd_signals and combined_signals do. tech_signals, wma_signals and
#  activity_signals publish a score and a signal word but no levels, so "did
#  target come before stop" is not a question their data can answer — they are
#  excluded rather than scored against invented levels.
SI_ENGINES = {
    "bd":       {"table": "bd_signals",       "datecol": "trade_date"},
    "combined": {"table": "combined_signals", "datecol": "trade_date"},
}


def _si_num(v):
    """float, or None. A missing level must stay missing — turning it into 0
    would make every stop look hit and every target unreachable."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except Exception:
        return None
    if f != f:                       # NaN
        return None
    return f


def si_evaluate(closes_after, entry, target, stop, horizon):
    """The whole close-only rule, as one pure function.

    closes_after: the next MARKET trading days after the signal, ascending, as
                  [(date, close_or_None)]. None means the stock did not trade
                  that day; the day still counts toward the horizon.
    Returns a dict ready to be written as a signal_outcomes row.
    """
    entry  = _si_num(entry)
    target = _si_num(target)
    stop   = _si_num(stop)

    out = {
        "horizon": horizon, "basis": "close",
        "entry": entry, "target": target, "stop": stop,
        "eval_date": None, "close_at": None, "ret_pct": None,
        "best_close": None, "worst_close": None,
        "best_pct": None, "worst_pct": None,
        "days_to_target": None, "days_to_stop": None,
        "days_available": 0, "outcome": "pending",
    }

    if not entry or entry <= 0:
        out["outcome"] = "not_traded"
        return out

    #  Only the days inside this horizon. A later horizon sees more of them.
    window = list(closes_after or [])[:horizon]
    out["days_available"] = len(window)

    priced = [(d, c) for d, c in window if _si_num(c) is not None and _si_num(c) > 0]

    #  Excursion across whatever actually traded. Named best/worst, never
    #  MFE/MAE — those are intraday measures and this is not one of them.
    if priced:
        vals = [_si_num(c) for _, c in priced]
        out["best_close"]  = max(vals)
        out["worst_close"] = min(vals)
        out["best_pct"]    = round((max(vals) - entry) / entry * 100, 4)
        out["worst_pct"]   = round((min(vals) - entry) / entry * 100, 4)

    #  The return at the horizon itself, only once the horizon has elapsed.
    if len(window) >= horizon:
        d, c = window[horizon - 1]
        cv = _si_num(c)
        out["eval_date"] = d
        if cv is not None and cv > 0:
            out["close_at"] = cv
            out["ret_pct"] = round((cv - entry) / entry * 100, 4)

    #  ── levels ────────────────────────────────────────────────────────────
    if target is None and stop is None:
        out["outcome"] = "no_levels" if len(window) >= horizon else "pending"
        return out

    #  A target at or below the entry, or a stop at or above it, cannot be
    #  tested — whichever way the price moves the answer is predetermined.
    #  Saying so is the only honest option; scoring it would poison the totals.
    if (target is not None and target <= entry) or \
       (stop is not None and stop >= entry):
        out["outcome"] = "invalid_levels"
        return out

    for i, (_d, c) in enumerate(window, start=1):
        cv = _si_num(c)
        if cv is None or cv <= 0:
            continue                              # did not trade; day still counts
        if target is not None and out["days_to_target"] is None and cv >= target:
            out["days_to_target"] = i
        if stop is not None and out["days_to_stop"] is None and cv <= stop:
            out["days_to_stop"] = i
        if out["days_to_target"] is not None or out["days_to_stop"] is not None:
            break                                 # first crossing decides it

    dt, ds = out["days_to_target"], out["days_to_stop"]

    #  Decide BEFORE asking whether the horizon elapsed. A target reached on
    #  day 2 of a 5-day horizon is a target hit, whatever day 5 does — calling
    #  it pending would lose a resolved result and bias the sample toward
    #  whatever resolves late.
    if dt is not None and ds is not None:
        #  Unreachable on closes, since target > entry > stop. Handled anyway,
        #  and resolved AGAINST the signal, because a rule that breaks ties in
        #  its own favour is how a backtest flatters itself.
        out["outcome"] = "target_first" if dt < ds else "stop_first"
    elif dt is not None:
        out["outcome"] = "target_first"
    elif ds is not None:
        out["outcome"] = "stop_first"
    elif len(window) < horizon:
        out["outcome"] = "pending"
    elif not priced:
        out["outcome"] = "insufficient_data"
    else:
        out["outcome"] = "timeout"

    return out


# ══════════════════════════════════════════════════════════════════════════════
#  THE EVALUATION JOB
# ──────────────────────────────────────────────────────────────────────────────
#  THE TRADING-DAY CALENDAR
#    market_summary carries exactly one row per trading day the exchange
#    published, which makes it the honest calendar. Deriving one from
#    price_history instead would mean paging thousands of rows to recover a
#    handful of dates, and using a stock's OWN traded days would stretch the
#    horizon for anything suspended.
#
#    If the calendar runs out, the affected outcomes stay `pending`. They are
#    never quietly resolved against a shorter window.
#
#  IDEMPOTENT BY DESIGN
#    Re-running a date recomputes and upserts. A `pending` row becomes resolved
#    once the days exist; a resolved row recomputes to the same verdict, since
#    si_evaluate() is a pure function of prices that no longer change.
# ══════════════════════════════════════════════════════════════════════════════

def _si_calendar(after, n):
    """The next n market trading days strictly after `after`, ascending."""
    rows = _db("market_summary",
               params=f"?select=date&date=gt.{after}&order=date.asc&limit={int(n)}") or []
    return [r.get("date") for r in rows if r.get("date")]


def _si_prices(d_from, d_to):
    """{CODE: {date: close}} for every stock across a date range.

    Paged deliberately. Supabase caps an unlimited query at about 1000 rows and
    a ten-day window is roughly 4000, so a single request would silently return
    a truncated market and every outcome computed from it would be wrong in a
    way nothing would flag.
    """
    out, offset, PAGE = {}, 0, 1000
    while True:
        rows = _db("price_history",
                   params=(f"?select=code,date,close&date=gte.{d_from}&date=lte.{d_to}"
                           f"&order=date.asc&limit={PAGE}&offset={offset}")) or []
        for r in rows:
            c = str(r.get("code") or "").upper()
            if not c:
                continue
            out.setdefault(c, {})[r.get("date")] = r.get("close")
        if len(rows) < PAGE:
            break
        offset += PAGE
        if offset > 200000:                  # a runaway guard, never expected
            break
    return out


def _si_signal_rows(engine, snap_date):
    """Every signal an engine published on one date."""
    cfg = SI_ENGINES.get(engine)
    if not cfg:
        return []
    return _db(cfg["table"],
               params=f"?{cfg['datecol']}=eq.{snap_date}&limit=1000") or []


def si_evaluate_date(engine, snap_date):
    """Evaluate one engine's signals for one date, across every horizon.

    Returns a summary dict. Writes to signal_outcomes; touches nothing else.
    """
    cal = _si_calendar(snap_date, SI_MAX_HORIZON)
    rows = _si_signal_rows(engine, snap_date)
    if not rows:
        return {"engine": engine, "snap_date": snap_date, "signals": 0,
                "written": 0, "calendar_days": len(cal),
                "note": "no signals published on this date"}

    prices = _si_prices(cal[0], cal[-1]) if cal else {}

    payload, counts = [], {}
    for r in rows:
        code = str(r.get("code") or "").upper()
        if not code:
            continue
        by_date = prices.get(code, {})
        future = [(d, by_date.get(d)) for d in cal]

        for h in SI_HORIZONS:
            o = si_evaluate(future, r.get("entry") or r.get("ltp"),
                            r.get("target"), r.get("sl"), h)
            counts[o["outcome"]] = counts.get(o["outcome"], 0) + 1
            payload.append({
                "snap_date": snap_date, "code": code, "engine": engine,
                "horizon": h, "basis": "close",
                "entry": o["entry"], "target": o["target"], "stop": o["stop"],
                "score": _si_num(r.get("score")) or _si_num(r.get("picker")),
                "rank": r.get("rank"),
                "signal": r.get("signal"),
                "eval_date": o["eval_date"], "close_at": o["close_at"],
                "ret_pct": o["ret_pct"],
                "best_close": o["best_close"], "worst_close": o["worst_close"],
                "best_pct": o["best_pct"], "worst_pct": o["worst_pct"],
                "days_to_target": o["days_to_target"],
                "days_to_stop": o["days_to_stop"],
                "outcome": o["outcome"], "days_available": o["days_available"],
                "price_source": "amarstock",     # what price_history actually is
                "computed_at": datetime.now().isoformat(),
            })

    #  Upsert on the unique key, in chunks. merge-duplicates is what makes a
    #  re-run update rather than collide.
    written = 0
    for i in range(0, len(payload), 500):
        chunk = payload[i:i + 500]
        res = _db("signal_outcomes", method="POST", data=chunk, use_secret=True,
                  prefer="resolution=merge-duplicates,return=representation")
        written += len(res) if isinstance(res, list) else 0

    return {"engine": engine, "snap_date": snap_date, "signals": len(rows),
            "written": written, "calendar_days": len(cal), "outcomes": counts}


def si_run(engines=None, lookback=15, only_date=None):
    """Evaluate recent dates. Safe to run repeatedly."""
    engines = engines or list(SI_ENGINES.keys())
    out, t0 = [], _t.time()

    for engine in engines:
        cfg = SI_ENGINES.get(engine)
        if not cfg:
            out.append({"engine": engine, "error": "unknown engine"})
            continue
        if only_date:
            dates = [only_date]
        else:
            #  The dates that could have matured. Ordered newest first by the
            #  API, reversed so the report reads oldest to newest.
            seen, dates = set(), []
            rows = _db(cfg["table"],
                       params=(f"?select={cfg['datecol']}"
                               f"&order={cfg['datecol']}.desc&limit=1000")) or []
            for r in rows:
                d = r.get(cfg["datecol"])
                if d and d not in seen:
                    seen.add(d)
                    dates.append(d)
                if len(dates) >= lookback:
                    break
            dates.reverse()
        for d in dates:
            try:
                out.append(si_evaluate_date(engine, d))
            except Exception as e:
                out.append({"engine": engine, "snap_date": d,
                            "error": f"{type(e).__name__}: {e}"})

    tot = {}
    for r in out:
        for k, v in (r.get("outcomes") or {}).items():
            tot[k] = tot.get(k, 0) + v
    return {"ok": True, "dates_processed": len(out),
            "rows_written": sum(r.get("written", 0) for r in out),
            "outcomes": tot,
            "duration_ms": int((_t.time() - t0) * 1000),
            "basis": "close",
            "note": ("Close-only. A stock that touched the target intraday and "
                     "closed below it is not counted as a hit."),
            "detail": out}


# ── endpoints ───────────────────────────────────────────────────────────────

@router.post("/api/cron/si-evaluate")
def cron_si_evaluate(x_cron_key: Optional[str] = Header(None), lookback: int = 15):
    """Daily. Same X-Cron-Key pattern as /api/cron/winback and
    /api/cron/collect-ohlc. Idempotent: it resolves whatever has matured and
    leaves the rest pending, so a missed day self-heals on the next run."""
    if not _cron_secret or x_cron_key != _cron_secret:
        raise HTTPException(status_code=401, detail="bad cron key")
    return si_run(lookback=max(1, min(int(lookback), 60)))


@router.post("/api/admin/si-evaluate")
def admin_si_evaluate(lookback: int = 15, engine: Optional[str] = None,
                      snap_date: Optional[str] = None,
                      _=Depends(_require_admin)):
    """The same job, by hand. Pass snap_date to redo exactly one day."""
    engines = [engine] if engine else None
    return si_run(engines=engines, lookback=max(1, min(int(lookback), 60)),
                  only_date=snap_date)


@router.get("/api/admin/si/status")
def si_status(_=Depends(_require_admin)):
    """Is the module wired up, and what does it believe it can evaluate?

    Deliberately cheap — no table scans. It exists so that after a deploy you
    can confirm in one call that signal_intel loaded and received its
    dependencies, rather than discovering it silently did not.
    """
    return {
        "loaded": True,
        "db_wired": _db is not None,
        "admin_wired": _get_admin is not None,
        "cron_key_set": bool(_cron_secret),
        "basis": "close",
        "horizons": list(SI_HORIZONS),
        "engines_evaluated": sorted(SI_ENGINES.keys()),
        "engines_excluded": ["tech", "wma", "activity", "picks"],
        "why_excluded": ("These publish a score and a signal word but no "
                         "entry/target/stop, so target-before-stop is not a "
                         "question their stored data can answer."),
    }
