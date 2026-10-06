"""EVENT IMPACT の実データ確認スクリプト(標準ライブラリだけ。鍵は不要)。

確かめること:
  1. TradingView の公開カレンダーから、過去の同じ指標の発表時刻(と 予想・前回・結果)が取れるか
  2. 発表の前後の5分足が、どの取得元から、どこまで遡って取れるか
  3. 取れた場合の統計(平均・中央値・上昇/下落・最大/最小・ばらつき)

使い方:  python3 tools/event_impact_probe.py [--sym BTC] [--days 400] [--groups cpi,nfp,fomc] [--n 12] [--out event_impact_probe.json]
結果は画面に日本語で出し、JSON にも保存する。何も書き込まない(KVには触らない)。
"""
import argparse
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

UA = "Mozilla/5.0 (compatible; signal-archive-probe/1.0)"
M5 = 300_000
DELTAS = [("5分", 5 * 60_000), ("15分", 15 * 60_000), ("1時間", 60 * 60_000), ("4時間", 4 * 3600_000), ("24時間", 24 * 3600_000)]
HEADLINE = "1時間"

# 指標のグループ(米国)。TradingView の title に対する正規表現。candidates 出力を見て調整する。
GROUPS = {
    "cpi": {"label": "米CPI(前年比)", "country": "US", "re": r"^(inflation rate yoy|consumer price index.*yoy)", "not": r"core"},
    "nfp": {"label": "米雇用統計(非農業部門雇用者数)", "country": "US", "re": r"non[- ]?farm payrolls", "not": r"adp|private|revision"},
    "fomc": {"label": "FOMC政策金利発表", "country": "US", "re": r"interest rate decision", "not": r"minutes"},
}


# ---------------- 通信 ----------------
def http_json(url, body=None, headers=None, timeout=25, retries=2):
    h = {"User-Agent": UA, "Accept": "application/json"}
    h.update(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        h["Content-Type"] = "application/json"
    last = None
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, data=data, headers=h, method="POST" if data is not None else "GET")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = RuntimeError(f"HTTP {e.code}")
            if e.code in (400, 401, 403, 404, 451):
                break
            if e.code == 429:
                time.sleep(2 + 3 * i)
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(0.6)
    raise last


# ---------------- 指標カレンダー(TradingView) ----------------
TV = "https://economic-calendar.tradingview.com/events"


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def parse_iso_ms(s):
    return int(datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp() * 1000)


def tv_events(start_ms, end_ms, country="US"):
    """50日ずつ区切って取る。返り値: (events, per_chunk_report)"""
    out, rep, step = {}, [], 50 * 86400_000
    a = start_ms
    while a < end_ms:
        b = min(a + step, end_ms)
        url = f"{TV}?from={urllib.parse.quote(iso(a))}&to={urllib.parse.quote(iso(b))}&countries={country}"
        try:
            j = http_json(url, headers={"Origin": "https://www.tradingview.com", "Referer": "https://www.tradingview.com/"})
            res = j.get("result") if isinstance(j, dict) else None
            if not isinstance(res, list):
                raise RuntimeError("形式が想定と違います")
            for e in res:
                if e and e.get("id") and e.get("date"):
                    out[e["id"]] = e
            rep.append({"from": iso(a)[:10], "to": iso(b)[:10], "count": len(res), "error": None})
        except Exception as ex:  # noqa: BLE001
            rep.append({"from": iso(a)[:10], "to": iso(b)[:10], "count": 0, "error": str(ex)})
        a = b
        time.sleep(0.4)
    return list(out.values()), rep


def pick_group(events, g):
    rx, nx = re.compile(g["re"], re.I), (re.compile(g["not"], re.I) if g.get("not") else None)
    seen, out = set(), []
    for e in sorted(events, key=lambda x: x["date"]):
        t = str(e.get("title") or e.get("indicator") or "")
        if e.get("country") != g["country"] or not rx.search(t) or (nx and nx.search(t)):
            continue
        if re.search(r"holiday", t, re.I):
            continue
        ms = parse_iso_ms(e["date"])
        if ms in seen:      # 同じ時刻の重複(MoM/YoYなど)は1件にする
            continue
        seen.add(ms)
        out.append({"t": ms, "title": t, "actual": e.get("actual"), "forecast": e.get("forecast"), "previous": e.get("previous"), "id": e.get("id")})
    return out


# ---------------- 価格(5分足)の取得元 ----------------
class Unsupported(Exception):
    pass


def _row(t, o, h, l, c):
    return {"t": int(t), "o": float(o), "h": float(h), "l": float(l), "c": float(c)}


def src_binance(sym, a, b):
    s = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "BNB": "BNBUSDT"}.get(sym)
    if not s:
        raise Unsupported(sym)
    j = http_json(f"https://data-api.binance.vision/api/v3/klines?symbol={s}&interval=5m&startTime={a}&endTime={b}&limit=1000")
    return [_row(r[0], r[1], r[2], r[3], r[4]) for r in j]


def src_bitstamp(sym, a, b):
    p = {"BTC": "btcusd", "ETH": "ethusd", "SOL": "solusd"}.get(sym)
    if not p:
        raise Unsupported(sym)
    j = http_json(f"https://www.bitstamp.net/api/v2/ohlc/{p}/?step=300&limit=1000&start={a // 1000}&end={b // 1000}")
    return [_row(int(r["timestamp"]) * 1000, r["open"], r["high"], r["low"], r["close"]) for r in j["data"]["ohlc"]]


def src_coinbase(sym, a, b):
    p = {"BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"}.get(sym)
    if not p:
        raise Unsupported(sym)
    out, cur = [], a
    while cur < b:                      # 1回300本まで
        end = min(cur + 290 * M5, b)
        j = http_json(f"https://api.exchange.coinbase.com/products/{p}/candles?granularity=300&start={iso(cur)}&end={iso(end)}")
        out += [_row(r[0] * 1000, r[3], r[2], r[1], r[4]) for r in j]
        cur = end
        time.sleep(0.3)
    return sorted(out, key=lambda r: r["t"])


def src_hyperliquid(sym, a, b):
    j = http_json("https://api.hyperliquid.xyz/info", body={"type": "candleSnapshot", "req": {"coin": sym, "interval": "5m", "startTime": a, "endTime": b}})
    return [_row(r["t"], r["o"], r["h"], r["l"], r["c"]) for r in j]


SOURCES = [("Binance(現物・公開データ)", src_binance), ("Bitstamp", src_bitstamp), ("Coinbase", src_coinbase), ("Hyperliquid(直近5000本のみ)", src_hyperliquid)]


def fetch_window(sym, a, b, need, sources, log):
    """a〜b の5分足を、取れた最初の取得元から返す。need は必ず含まれるべき足の開始時刻(ms)の一覧。"""
    for idx, (name, fn) in enumerate(list(sources)):
        try:
            rows = fn(sym, a, b)
            have = {r["t"] for r in rows}
            miss = [t for t in need if t not in have]
            log.setdefault(name, {"ok": 0, "ng": 0, "errors": {}})
            if rows and not miss:
                log[name]["ok"] += 1
                if idx:                        # 取れた取得元を先頭へ(次回から最初に試す)
                    sources.insert(0, sources.pop(idx))
                return name, rows
            log[name]["ng"] += 1
            k = f"必要な足が{len(miss)}本欠けている" if rows else "0本"
            log[name]["errors"][k] = log[name]["errors"].get(k, 0) + 1
        except Unsupported:
            log.setdefault(name, {"ok": 0, "ng": 0, "errors": {}})["errors"]["この銘柄は未対応"] = 1
        except Exception as e:  # noqa: BLE001
            log.setdefault(name, {"ok": 0, "ng": 0, "errors": {}})
            log[name]["ng"] += 1
            log[name]["errors"][str(e)[:60]] = log[name]["errors"].get(str(e)[:60], 0) + 1
        time.sleep(0.3)
    return None, []


# ---------------- 計算 ----------------
def reactions(rows, T):
    """発表時刻 T(ms)の直前の終値を基準に、各経過時間後の変化率(%)を返す。足が無ければ None。"""
    by = {r["t"]: r for r in rows}
    base_open = (T // M5) * M5 - M5             # T の直前に閉じた足
    base = by.get(base_open)
    if not base:
        return None, "発表直前の足がありません"
    out = {}
    for name, d in DELTAS:
        c = by.get(((T // M5) * M5) + d - M5)    # T+d に閉じる足
        out[name] = round((c["c"] / base["c"] - 1) * 100, 4) if c else None
    return out, None


def summarize(vals):
    v = [x for x in vals if x is not None]
    if not v:
        return {"n": 0}
    up = sum(1 for x in v if x > 0)
    return {
        "n": len(v), "mean": round(statistics.fmean(v), 2), "median": round(statistics.median(v), 2),
        "up": up, "down": sum(1 for x in v if x < 0), "up_rate": round(up / len(v) * 100),
        "max": round(max(v), 2), "min": round(min(v), 2), "stdev": round(statistics.stdev(v), 2) if len(v) > 1 else None,
    }


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def run_group(sym, key, g, events, n, now_ms, sources, log):
    allp = pick_group(events, g)
    past = [e for e in allp if e["t"] + 24 * 3600_000 + 2 * M5 < now_ms][-n:]
    res = {"key": key, "label": g["label"], "found_in_range": len(allp), "used": [], "skipped": [],
           "has_actual": sum(1 for e in past if e["actual"] is not None),
           "has_forecast": sum(1 for e in past if e["forecast"] is not None),
           "has_previous": sum(1 for e in past if e["previous"] is not None)}
    for e in past:
        T = e["t"]
        need = [(T // M5) * M5 - M5] + [((T // M5) * M5) + d - M5 for _, d in DELTAS]
        src, rows = fetch_window(sym, (T // M5) * M5 - 3 * M5, (T // M5) * M5 + 24 * 3600_000 + 2 * M5, need, sources, log)
        if not rows:
            res["skipped"].append({"date": iso(T)[:16], "reason": "価格の取得元から必要な足が取れません"})
            continue
        r, why = reactions(rows, T)
        if not r:
            res["skipped"].append({"date": iso(T)[:16], "reason": why})
            continue
        a_, f_ = num(e["actual"]), num(e["forecast"])
        res["used"].append({"date": iso(T)[:16], "title": e["title"], "source": src, "actual": e["actual"], "forecast": e["forecast"], "previous": e["previous"],
                            "surprise": (None if a_ is None or f_ is None else ("above" if a_ > f_ else "below" if a_ < f_ else "inline")), "react": r})
    res["stats"] = {name: summarize([u["react"][name] for u in res["used"]]) for name, _ in DELTAS}
    sp = {}
    for kind, jp in (("above", "予想より上"), ("below", "予想より下"), ("inline", "予想どおり")):
        sp[jp] = summarize([u["react"][HEADLINE] for u in res["used"] if u["surprise"] == kind])
    res["by_surprise_1h"] = sp
    return res


# ---------------- 表示 ----------------
def show(res, sym):
    L = []
    L.append(f"\n=== {res['label']} / {sym} ===")
    L.append(f"カレンダーで見つかった発表: {res['found_in_range']}件 / 計算に使えた: {len(res['used'])}件 / 使えなかった: {len(res['skipped'])}件")
    L.append(f"予想・前回・結果が付いていた数(直近分): 予想{res['has_forecast']} 前回{res['has_previous']} 結果{res['has_actual']}")
    for s in res["skipped"][:5]:
        L.append(f"  使えない: {s['date']} {s['reason']}")
    st = res["stats"][HEADLINE]
    if st.get("n"):
        L.append(f"過去{st['n']}回 {sym} / 1H: 平均 {st['mean']:+.2f}% 中央値 {st['median']:+.2f}% 上昇/下落 {st['up']}/{st['down']} 最大 {st['max']:+.2f}% 最小 {st['min']:+.2f}% ばらつき(標準偏差) {st['stdev']}")
        L.append("発表後: " + "  ".join(f"{k} 平均{v['mean']:+.2f}%" for k, v in res["stats"].items() if v.get("n")))
        for k, v in res["by_surprise_1h"].items():
            if v.get("n"):
                L.append(f"  1H・{k}: n={v['n']} 平均 {v['mean']:+.2f}%")
    else:
        L.append("統計を出せませんでした(上の理由を確認)")
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--sym", default="BTC")
    ap.add_argument("--days", type=int, default=400)
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--groups", default="cpi,nfp,fomc")
    ap.add_argument("--out", default="event_impact_probe.json")
    a = ap.parse_args(argv)
    now = int(time.time() * 1000)
    print(f"[1/3] 指標カレンダー(TradingView)を過去{a.days}日分取得…")
    events, rep = tv_events(now - a.days * 86400_000, now)
    bad = [r for r in rep if r["error"]]
    print(f"  取得できた発表: {len(events)}件 / 区間 {len(rep)}のうち失敗 {len(bad)}")
    for r in bad:
        print(f"  失敗: {r['from']}〜{r['to']}: {r['error']}")
    if rep:
        print("  区間ごとの件数: " + ", ".join(f"{r['from'][5:]}:{r['count']}" for r in rep))
    withf = sum(1 for e in events if e.get("forecast") is not None)
    print(f"  うち 予想値付き {withf}件 / 結果値付き {sum(1 for e in events if e.get('actual') is not None)}件")
    titles = {}
    for e in events:
        if e.get("importance", -1) >= 1:
            titles[e.get("title")] = titles.get(e.get("title"), 0) + 1
    print("  重要度の高い発表のタイトル(上位20・グループ分けの確認用): " + " / ".join(f"{t}×{c}" for t, c in sorted(titles.items(), key=lambda x: -x[1])[:20]))
    print(f"[2/3] 各グループの発表前後の5分足({a.sym})を取得して計算…")
    sources, log, results = list(SOURCES), {}, []
    for k in [x.strip() for x in a.groups.split(",") if x.strip()]:
        if k not in GROUPS:
            print(f"  未知のグループ: {k}")
            continue
        results.append(run_group(a.sym, k, GROUPS[k], events, a.n, now, sources, log))
    print("[3/3] 結果")
    for r in results:
        print(show(r, a.sym))
    print("\n--- 価格の取得元ごとの結果 ---")
    for name, v in log.items():
        print(f"{name}: 成功{v['ok']} 失敗{v['ng']} {v['errors'] or ''}")
    ok = [r for r in results if len(r["used"]) >= max(6, a.n // 2)]
    print("\n--- 判定 ---")
    print("OK: EVENT IMPACT は実データで計算できます" if ok else "NG: 計算できたグループがありません(上の理由を確認)")
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"sym": a.sym, "at": iso(now), "calendar_chunks": rep, "results": results, "source_log": log}, f, ensure_ascii=False, indent=1)
    print(f"詳細は {a.out} に保存しました")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
