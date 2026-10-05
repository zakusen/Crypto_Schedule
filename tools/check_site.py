"""公開中のサイトのAPIを確認する(check.yml から呼ばれる。SITE_URL 環境変数、または第1引数にURL)。"""
import json
import os
import sys
import urllib.error
import urllib.request

SYMS = ["BTC", "ETH", "SOL", "SUI", "BNB"]
TFS = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "crypto-schedule-check/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:  # 失敗の理由(サイトが返す1行)も出す
        try:
            msg = e.read().decode("utf-8")[:200]
        except Exception:  # noqa: BLE001
            msg = ""
        raise RuntimeError(f"HTTP {e.code} {msg}") from None


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SITE_URL", "")).rstrip("/")
    if not base.startswith("http"):
        print("URLを指定してください")
        return 2
    bad = []
    for tf in TFS:
        try:
            j = get(f"{base}/api/candles?sym=BTC&tf={tf}")
            bars = j.get("bars") or []
            ok = bool(bars) and all(len(b) == 6 and b[2] >= b[3] for b in bars)
            print(f"{'OK ' if ok else 'NG '} BTC {tf}: {len(bars)}本")
            if not ok:
                bad.append(f"BTC {tf}")
        except Exception as e:  # noqa: BLE001
            print(f"NG  BTC {tf}: {e}")
            bad.append(f"BTC {tf}")
    for sym in SYMS[1:]:
        try:
            n = len(get(f"{base}/api/candles?sym={sym}&tf=1h").get("bars") or [])
            print(f"{'OK ' if n else 'NG '} {sym} 1h: {n}本")
            if not n:
                bad.append(f"{sym} 1h")
        except Exception as e:  # noqa: BLE001
            print(f"NG  {sym} 1h: {e}")
            bad.append(f"{sym} 1h")
    try:
        j = get(f"{base}/api/events")
        evs = j.get("events") or []
        errs = j.get("errors") or []
        by = {}
        for e in evs:
            by[e.get("c") or "-"] = by.get(e.get("c") or "-", 0) + 1
        layers = {}
        for e in evs:
            layers[e.get("l")] = layers.get(e.get("l"), 0) + 1
        srcs = {}
        for e in evs:
            if e.get("l") == "asset":
                srcs[e.get("src")] = srcs.get(e.get("src"), 0) + 1
        print(f"版: {j.get('version') or '(古い版)'}")
        print(f"層別: {layers} / 銘柄層の取得元別: {srcs}")
        if not srcs.get("CoinMarketCal"):
            print("注意: CoinMarketCalのイベントが0件です(無料枠は7日先まで。0件でも異常とは限りません)")
        print(f"{'OK ' if evs else 'NG '} events: {len(evs)}件 / 国別: {by} / 警告: {errs or 'なし'}")
        if not evs or errs:
            bad.append("events")
        missing = [c for c in ("US", "JP", "EU") if not by.get(c)]
        if evs and missing:
            print(f"NG  日米欧のうち取得できていない地域: {missing}(予備のForex Factoryに切り替わっている可能性)")
            bad.append("events:" + ",".join(missing))
    except Exception as e:  # noqa: BLE001
        print(f"NG  events: {e}")
        bad.append("events")
    if bad:
        print("::error::確認で問題が出ました: " + ", ".join(bad))
        return 1
    print("すべて正常です")
    return 0


if __name__ == "__main__":
    sys.exit(main())
