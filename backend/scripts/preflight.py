"""
scripts/preflight.py

OWNER: B2 (integration duty).

One command that turns "did you finish day 0?" into evidence you can paste
into chat. Run it before your first commit, and again any morning something
feels wrong.

    python scripts/preflight.py B1
    python scripts/preflight.py B2
    python scripts/preflight.py B3

Shared checks run for everyone; role checks only for the role you pass.
Exit code is 0 only if every HARD check passed, so this is safe to wire into
a hook later.

WHAT THIS CANNOT CHECK, and you must confirm by eye:
  * whether your git email is actually REGISTERED on your GitHub account
    (git cannot see GitHub's side -- open Settings -> Emails)
  * whether `main` is branch-protected (a server-side setting)
  * whether CMEMS / ERA5 registration has cleared (email, not code)
A green report is necessary, not sufficient.
"""

import importlib
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

HARD, SOFT = "HARD", "SOFT"
results = []


def record(level, name, ok, detail=""):
    results.append((level, name, ok, detail))
    mark = "PASS" if ok else ("FAIL" if level == HARD else "WARN")
    print(f"  [{mark}] {name}" + (f"  -- {detail}" if detail else ""))


def git(*args):
    """Run a git command, return stripped stdout or None."""
    try:
        out = subprocess.run(["git", *args], cwd=ROOT, capture_output=True,
                             text=True, timeout=15)
        return out.stdout.strip() if out.returncode == 0 else None
    except Exception:
        return None


def check_identity():
    name, email = git("config", "--get", "user.name"), git("config", "--get", "user.email")
    record(HARD, "git user.name set", bool(name), name or "unset -- run: git config user.name \"Your Name\"")
    record(HARD, "git user.email set", bool(email),
           email or "unset -- run: git config user.email \"your-github-email\"")
    if email:
        record(SOFT, "email is registered on GitHub", False,
               "CANNOT be verified from git -- confirm at GitHub Settings -> Emails, "
               "or your commits will not link to you")


def check_deps():
    needed = ["numpy", "pandas", "pyproj", "shapely", "pydantic",
              "rasterio", "skimage", "scipy", "fastapi"]
    missing = []
    for mod in needed:
        try:
            importlib.import_module(mod)
        except ImportError:
            missing.append(mod)
    record(HARD, f"dependencies importable ({len(needed) - len(missing)}/{len(needed)})",
           not missing,
           "missing: " + ", ".join(missing) + " -- run: pip install -r requirements.txt"
           if missing else "")
    return not missing


def check_chain():
    """Runs the exact command B2 demonstrates at standup."""
    try:
        out = subprocess.run([sys.executable, str(ROOT / "scripts" / "run_chain.py"), "synthetic"],
                             cwd=ROOT, capture_output=True, text=True, timeout=300)
    except Exception as exc:
        record(HARD, "full chain runs on synthetic", False, f"{type(exc).__name__}: {exc}")
        return
    ok = out.returncode == 0
    tail = (out.stdout or out.stderr).strip().splitlines()
    record(HARD, "full chain runs on synthetic", ok,
           tail[-1] if tail else f"exit {out.returncode}")


def check_gitignore():
    """The venv rule that already failed once. Verify it holds."""
    probes = {
        "venv/pyvenv.cfg": True,
        "backend/cache/demo/suspects.json": True,
        ".env": True,
        "backend/cache/.gitkeep": False,      # must NOT be ignored
    }
    bad = []
    for rel, should_ignore in probes.items():
        r = subprocess.run(["git", "check-ignore", "-q", rel], cwd=ROOT.parent,
                           capture_output=True)
        is_ignored = r.returncode == 0
        if is_ignored != should_ignore:
            bad.append(f"{rel} (ignored={is_ignored}, want {should_ignore})")
    record(HARD, "gitignore protects venv/cache/.env", not bad, "; ".join(bad))


def check_env_file(role):
    """B3's aisstream key. Never print the value."""
    path = ROOT / ".env"
    if not path.exists():
        record(HARD if role == "B3" else SOFT, ".env exists", False,
               "copy .env.example to .env" +
               ("  <-- B3: the collector cannot run without this" if role == "B3" else
                "  (only B3 strictly needs it)"))
        return
    key_set = False
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.strip().startswith("AISSTREAM_KEY="):
            key_set = bool(line.split("=", 1)[1].strip())
    record(HARD if role == "B3" else SOFT, "AISSTREAM_KEY has a value", key_set,
           "" if key_set else "empty -- get a free key at aisstream.io (GitHub sign-in)")


def check_safe_product(role):
    """B1's one task with NO fallback."""
    candidates = list((ROOT / "data").glob("*.SAFE")) if (ROOT / "data").is_dir() else []
    candidates += list((ROOT / "data").glob("*.zip")) if (ROOT / "data").is_dir() else []
    record(HARD if role == "B1" else SOFT, "a real Sentinel-1 product is on disk",
           bool(candidates),
           f"found {candidates[0].name}" if candidates else
           "none in backend/data/ -- every other stage has a fallback; this one does not")


def main():
    role = (sys.argv[1] if len(sys.argv) > 1 else "").upper()
    if role not in {"B1", "B2", "B3"}:
        print(__doc__)
        print("  ERROR: pass your role -- B1, B2 or B3\n")
        return 2

    print(f"\nPreflight for {role}\n" + "=" * 52)
    print("\nShared:")
    check_identity()
    check_gitignore()
    deps_ok = check_deps()
    if deps_ok:
        check_chain()
    else:
        record(HARD, "full chain runs on synthetic", False, "skipped -- install deps first")

    print(f"\nRole ({role}):")
    check_env_file(role)
    check_safe_product(role)

    hard_fail = [n for lvl, n, ok, _ in results if lvl == HARD and not ok]
    soft_fail = [n for lvl, n, ok, _ in results if lvl == SOFT and not ok]

    print("\n" + "=" * 52)
    if hard_fail:
        print(f"NOT READY -- {len(hard_fail)} hard check(s) failed:")
        for n in hard_fail:
            print(f"    - {n}")
    else:
        print("All hard checks passed.")
    if soft_fail:
        print(f"\n{len(soft_fail)} item(s) need your own eyes (git cannot verify these):")
        for n in soft_fail:
            print(f"    - {n}")
    print()
    return 1 if hard_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
