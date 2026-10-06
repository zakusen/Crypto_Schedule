"""event_impact_probe.py の動作確認(偽の通信で試す。インターネット不要)。  python3 -m unittest tools/test_event_impact_probe.py"""
import contextlib
import io
import json
import os
import sys
import tempfile
import time
import unittest
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
import event_impact_probe as P  # noqa: E402

M5 = 300_000
H = 3600_000
NOW = int(time.time() * 1000)
DAY = 86400_000


def day0(ms):
    return (ms // DAY) * DAY


# 12回分のCPI(月ごとに約30日おき・12:30 UTC)。i=0 が最も古い。
CPI_T = [day0(NOW - (13 - i) * 30 * DAY) + 12 * H + 30 * 60_000 for i in range(12)]
FUTURE_T = day0(NOW) + 12 * H + 30 * 60_000 + 2 * DAY          # まだ先の発表(使われないこと)
RECENT_T = NOW - 3 * H                                         # 24時間たっていない発表(使われないこと)
RECENT_T = (RECENT_T // M5) * M5


def f_for(i, delta):
    return {5 * 60_000: 0.001 * (i + 1), 15 * 60_000: 0.002 * (i + 1), H: (0.01 if i % 2 == 0 else -0.005), 4 * H: 0.02, 24 * H: -0.01}.get(delta)


def price_close(t_close, events=CPI_T):
    for i, T in enumerate(events):
        f = f_for(i, t_close - T)
        if f is not None:
            return 100 * (1 + f)
    return 100.0


def candles(a, b, drop=()):
    out, t = [], ((a + M5 - 1) // M5) * M5
    while t <= b:
        if t not in drop:
            c = price_close(t + M5)
            out.append({"t": t, "o": 100.0, "h": c + 1, "l": c - 1, "c": c})
        t += M5
    return out


def tv_result(frm, to, fail_chunk_from=None):
    res = []
    def add(i, title, T, **kw):
        res.append({"id": f"{title}-{T}", "title": title, "country": "US", "date": P.iso(T), "importance": 1, **kw})
    for i, T in enumerate(CPI_T):
        add(i, "Inflation Rate YoY", T, actual=3.0 + (0.2 if i % 2 == 0 else -0.2), forecast=3.0, previous=3.1)
        add(i, "Inflation Rate MoM", T, actual=0.3, forecast=0.3, previous=0.3)       # 同時刻のMoM(除外される)
        add(i, "Core Inflation Rate YoY", T + 0, actual=3.1, forecast=3.1, previous=3.2)  # コア(除外される)
    add(99, "Inflation Rate YoY", FUTURE_T)
    add(98, "Inflation Rate YoY", RECENT_T, actual=3.0, forecast=3.0)
    return [e for e in res if frm <= P.parse_iso_ms(e["date"]) < to]


class Net:
    """偽の通信。sources は取得元ごとの挙動を差し替えられる。"""
    def __init__(self, binance="451", bitstamp="ok", drop=(), tv_fail_from=None, all_fail=False):
        self.binance, self.bitstamp, self.drop, self.tv_fail_from, self.all_fail = binance, bitstamp, set(drop), tv_fail_from, all_fail
        self.calls = []

    def __call__(self, url, body=None, headers=None, timeout=25, retries=2):
        self.calls.append(url)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        if "economic-calendar.tradingview.com" in url:
            frm, to = P.parse_iso_ms(q["from"][0]), P.parse_iso_ms(q["to"][0])
            if self.tv_fail_from is not None and frm >= self.tv_fail_from:
                raise RuntimeError("HTTP 429")
            return {"status": "ok", "result": tv_result(frm, to)}
        if self.all_fail:
            raise RuntimeError("HTTP 403")
        if "binance.vision" in url:
            if self.binance != "ok":
                raise RuntimeError("HTTP 451")
            a, b = int(q["startTime"][0]), int(q["endTime"][0])
            return [[r["t"], r["o"], r["h"], r["l"], r["c"]] for r in candles(a, b, self.drop)]
        if "bitstamp" in url:
            a, b = int(q["start"][0]) * 1000, int(q["end"][0]) * 1000
            return {"data": {"ohlc": [{"timestamp": str(r["t"] // 1000), "open": r["o"], "high": r["h"], "low": r["l"], "close": r["c"]} for r in candles(a, b, self.drop)]}}
        raise RuntimeError("HTTP 404")           # coinbase / hyperliquid は使えない扱い


def run(net, **kw):
    P.http_json = net
    P.time.sleep = lambda s: None
    out = io.StringIO()
    with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(out):
        path = os.path.join(d, "o.json")
        code = P.main(["--groups", kw.get("groups", "cpi"), "--out", path, "--days", "400"])
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    return code, out.getvalue(), data


class T(unittest.TestCase):
    def test_stats_and_fallback(self):
        net = Net()
        code, text, data = run(net)
        r = data["results"][0]
        self.assertEqual(code, 0)
        self.assertEqual(len(r["used"]), 12)                          # 未来・24時間未満・MoM・コアは入らない
        s = r["stats"]["1時間"]
        self.assertEqual((s["n"], s["up"], s["down"]), (12, 6, 6))
        self.assertAlmostEqual(s["mean"], 0.25, places=2)
        self.assertAlmostEqual(s["median"], 0.25, places=2)
        self.assertEqual((s["max"], s["min"]), (1.0, -0.5))
        self.assertAlmostEqual(r["stats"]["4時間"]["mean"], 2.0, places=2)
        self.assertAlmostEqual(r["stats"]["24時間"]["mean"], -1.0, places=2)
        self.assertAlmostEqual(r["stats"]["5分"]["mean"], 0.65, places=2)   # 0.1%*(1..12)の平均
        self.assertTrue(all(u["source"] == "Bitstamp" for u in r["used"]))
        b = [c for c in net.calls if "binance" in c]
        self.assertEqual(len(b), 1)                                    # 取れた取得元が先頭に移り、Binanceは1回で見切る
        self.assertIn("成功12", text)

    def test_surprise_split(self):
        _, _, data = run(Net())
        sp = data["results"][0]["by_surprise_1h"]
        self.assertEqual(sp["予想より上"]["n"], 6)
        self.assertEqual(sp["予想より下"]["n"], 6)
        self.assertAlmostEqual(sp["予想より上"]["mean"], 1.0, places=2)
        self.assertAlmostEqual(sp["予想より下"]["mean"], -0.5, places=2)
        self.assertEqual(data["results"][0]["has_forecast"], 12)

    def test_missing_candle_skips_one_event(self):
        T = CPI_T[3]
        miss = ((T // M5) * M5 + H - M5)                              # 3回目の1時間後の足が欠けている
        code, text, data = run(Net(drop=[miss]))
        r = data["results"][0]
        self.assertEqual(len(r["used"]), 11)
        self.assertEqual(len(r["skipped"]), 1)
        self.assertEqual(code, 0)

    def test_all_sources_fail(self):
        code, text, data = run(Net(all_fail=True))
        self.assertEqual(code, 1)
        self.assertEqual(len(data["results"][0]["used"]), 0)
        self.assertIn("NG", text)
        self.assertIn("統計を出せませんでした", text)

    def test_calendar_chunk_failure_is_reported(self):
        code, text, data = run(Net(tv_fail_from=NOW - 100 * DAY))
        fails = [c for c in data["calendar_chunks"] if c["error"]]
        self.assertTrue(fails)
        self.assertIn("失敗:", text)
        self.assertTrue(data["results"][0]["used"])                    # 取れた分だけで計算は続く

    def test_binance_preferred_when_available(self):
        net = Net(binance="ok")
        _, _, data = run(net)
        self.assertTrue(all(u["source"].startswith("Binance") for u in data["results"][0]["used"]))
        self.assertFalse([c for c in net.calls if "bitstamp" in c])

    def test_reactions_unit(self):
        T = 12 * H + 30 * 60_000
        rows = [{"t": t, "o": 1, "h": 1, "l": 1, "c": 100.0 if t < T else 101.0} for t in range((T // M5) * M5 - 3 * M5, T + 25 * H, M5)]
        r, why = P.reactions(rows, T)
        self.assertAlmostEqual(r["1時間"], 1.0, places=3)
        self.assertIsNone(why)
        r2, why2 = P.reactions([x for x in rows if x["t"] != T - M5], T)
        self.assertIsNone(r2)
        self.assertIn("直前", why2)

    def test_summarize_edge(self):
        self.assertEqual(P.summarize([]), {"n": 0})
        self.assertEqual(P.summarize([None, None]), {"n": 0})
        s = P.summarize([1.0])
        self.assertIsNone(s["stdev"])


if __name__ == "__main__":
    unittest.main()
