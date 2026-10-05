"""公開中のサイトのAPIを確認する(check.yml から呼ばれる。SITE_URL 環境変数、または第1引数にURL)。"""
import json
import os
import sys
import urllib.error
import urllib.request

SYMS = ["BTC", "ETH", "SOL", "BNB"]
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


def stale_note(j):
    # 取得元に断られて控えを返した時は、何分前の控えかを添える(表示できているのでOK扱い)
    if not j.get("stale"):
        return ""
    return f"(控え {round((j.get('age_s') or 0) / 60)}分前 / {j.get('reason') or ''})"


def health(base, bad):
    try:
        h = get(f"{base}/api/health")
    except Exception as e:  # noqa: BLE001
        print(f"--  /api/health: {e}(古い版では未対応)")
        return
    print(f"-- 状態: Pacifica待機 {h.get('pacifica_cooldown_s')}秒")
    for sym, p in (h.get("prices") or {}).items():
        ages = p.get("age_min") or {}
        lc = p.get("last_cron") or {}
        warm = {k: ages.get(k) for k in ("15m", "1h", "4h", "1d", "1w", "1M")}
        print(f"   {sym} 控えの古さ(分): {warm} / 最後の定時取得: {lc.get('min_ago')}分前 成功{lc.get('ok')}本 {lc.get('ng') or ''}")
        a1h = ages.get("1h")
        if a1h is None or a1h > 6 * 60:   # 1時間足の控えが6時間より古い=定時取得が長く失敗している
            print(f"NG  {sym}: 1時間足の控えが {a1h}分前 です(定時取得が続けて失敗している可能性)")
            bad.append(f"{sym} 控え")
    print(f"   指標: {h.get('macro')} / チェーン控え: {h.get('chain')}")
    print(f"   ETH記録: {h.get('ethqueue')} / ステーク記録: {h.get('stake')}")


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
            print(f"{'OK ' if ok else 'NG '} BTC {tf}: {len(bars)}本{stale_note(j)}")
            if not ok:
                bad.append(f"BTC {tf}")
        except Exception as e:  # noqa: BLE001
            print(f"NG  BTC {tf}: {e}")
            bad.append(f"BTC {tf}")
    for sym in SYMS[1:]:
        try:
            j = get(f"{base}/api/candles?sym={sym}&tf=1h")
            n = len(j.get("bars") or [])
            print(f"{'OK ' if n else 'NG '} {sym} 1h: {n}本{stale_note(j)}")
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
        if not any(k and k.startswith("チェーン") for k in srcs):
            print("注意: チェーン直読み(BTC半減期など)のイベントが0件です。読み取りに失敗している可能性があります")
        print(f"{'OK ' if evs else 'NG '} events: {len(evs)}件 / 国別: {by} / 警告: {errs or 'なし'}")
        for n in j.get("notes") or []:
            print(f"--  注記: {n}")
        if not evs or errs:
            bad.append("events")
        missing = [c for c in ("US", "JP", "EU") if not by.get(c)]
        if evs and missing:
            print(f"NG  日米欧のうち取得できていない地域: {missing}(予備のForex Factoryに切り替わっている可能性)")
            bad.append("events:" + ",".join(missing))
    except Exception as e:  # noqa: BLE001
        print(f"NG  events: {e}")
        bad.append("events")
    try:
        q = get(f"{base}/api/ethqueue")
        smp = q.get("samples") or []
        print(f"{'OK ' if smp else 'NG '} ETH出口待ち: 記録{len(smp)}件 / 最新 {smp[-1] if smp else '-'}")
        if smp:
            print(f"{'OK ' if len(smp[-1]) > 4 and smp[-1][4] is not None else '-- '}ETH入口待ち: 最新 {smp[-1][3:5] if len(smp[-1]) > 4 else '(未記録)'}")
            print(f"{'OK ' if len(smp[-1]) > 5 and smp[-1][5] is not None else '-- '}ETHステーク量(稼働バリデータ数): {smp[-1][5] if len(smp[-1]) > 5 else '(未記録)'}")
        if not smp:
            bad.append("ethqueue")
    except Exception as e:  # noqa: BLE001
        print(f"NG  ETH出口待ち: {e}")
        bad.append("ethqueue")
    for sym in ("SOL", "BNB"):
        try:
            q = get(f"{base}/api/stake?sym={sym}")
            smp = q.get("samples") or []
            print(f"{'OK ' if smp else 'NG '} {sym}ステーク量: 記録{len(smp)}件 / 最新 {smp[-1] if smp else '-'}")
            if not smp:
                bad.append(f"stake-{sym}")
        except Exception as e:  # noqa: BLE001
            print(f"NG  {sym}ステーク量: {e}")
            bad.append(f"stake-{sym}")
    health(base, bad)
    if bad:
        print("::error::確認で問題が出ました: " + ", ".join(bad))
        return 1
    print("すべて正常です")
    return 0


if __name__ == "__main__":
    sys.exit(main())
