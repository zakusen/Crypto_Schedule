"""
リポジトリに上げられた更新用zip(直下か updates/ に置いた *.zip)を展開して反映し、zipは消す。
.github/workflows/apply_update.yml から呼ばれる。手元でも `python tools/apply_update.py` で試せる。

守っていること:
  - .env / .dev.vars(秘密)、.git/、node_modules/、.wrangler/ は絶対に上書きしない
  - .github/workflows/ は GitHub の仕組み上、自動では書き換えられない(手で上げる必要がある)。
    zipに入っていたら、その旨をログに出して飛ばす
  - zip の中身が「フォルダ1つにまとめて」あっても(Crypto_Schedule-main/public/... など)、その1段を自動で外す
  - リポジトリの外に書き出すような名前(../ や絶対パス)は拒否する
  - 1ファイル20MB超・合計100MB超は拒否する(誤爆と暴走の防止)
"""
import glob
import os
import sys
import zipfile
from pathlib import PurePosixPath

PROTECT_FILES = {".env", ".dev.vars"}
PROTECT_DIRS = (".git/", "node_modules/", ".wrangler/")
ROOT_HINTS = ("public/", "tools/", ".github/", "worker.js", "wrangler.jsonc", "README.md")
MAX_FILE = 20 * 1024 * 1024
MAX_TOTAL = 100 * 1024 * 1024


def members(z):
    infos = [i for i in z.infolist()
             if not i.filename.endswith("/") and "__MACOSX/" not in i.filename and not i.filename.endswith(".DS_Store")]
    names = [i.filename for i in infos]
    tops = {n.split("/", 1)[0] for n in names}
    strip = ""
    if len(tops) == 1 and all("/" in n for n in names):
        top = next(iter(tops)) + "/"
        if any(n[len(top):].startswith(ROOT_HINTS) for n in names):
            strip = top
    return [(i, i.filename[len(strip):]) for i in infos]


def safe_path(rel):
    p = PurePosixPath(rel)
    if not rel or p.is_absolute() or ".." in p.parts:
        return None
    return str(p)


def main():
    zips = sorted(glob.glob("*.zip") + glob.glob("updates/*.zip"))
    if not zips:
        print("反映するzipはありません")
        return 0
    written, skipped_wf, refused = [], [], []
    total = 0
    for zp in zips:
        print(f"== {zp}")
        with zipfile.ZipFile(zp) as z:
            for info, rel in members(z):
                rel = safe_path(rel)
                if rel is None:
                    refused.append(info.filename)
                    continue
                total += info.file_size
                if info.file_size > MAX_FILE or total > MAX_TOTAL:
                    refused.append(rel + "(大きすぎる)")
                    continue
                base = os.path.basename(rel)
                if base in PROTECT_FILES or rel.startswith(PROTECT_DIRS):
                    refused.append(rel)
                    continue
                if rel.startswith(".github/workflows/"):
                    new = z.read(info)
                    old = open(rel, "rb").read() if os.path.exists(rel) else None
                    if old != new:
                        skipped_wf.append(rel)
                    continue
                os.makedirs(os.path.dirname(rel) or ".", exist_ok=True)
                with open(rel, "wb") as dst:
                    dst.write(z.read(info))
                written.append(rel)
        os.remove(zp)
    print(f"反映したファイル({len(written)}):")
    for w in written:
        print("  " + w)
    if refused:
        print(f"守るため反映しなかったファイル({len(refused)}): " + ", ".join(refused))
    if skipped_wf:
        print("::warning::ワークフロー(.github/workflows)の変更は自動では反映できません。手で上げてください: " + ", ".join(skipped_wf))
    with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a", encoding="utf-8") as fp:
        fp.write(f"### 更新zipを反映しました\n\n{len(written)}ファイル\n\n" + "\n".join(f"- `{w}`" for w in written) + "\n")
        if skipped_wf:
            fp.write("\n**手で上げる必要があるワークフロー:** " + ", ".join(f"`{w}`" for w in skipped_wf) + "\n")
        if refused:
            fp.write("\n守るため反映しなかった: " + ", ".join(f"`{r}`" for r in refused) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
