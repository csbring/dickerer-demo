"""Build the installable demo extension from the shared sidebar UI; no secrets."""
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "dickerer_demo/static"
DEST = ROOT / "dist/dickerer-sidebar"


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    files = [(ROOT/"extension"/name, name) for name in ("manifest.json", "background.js", "bridge.js")]
    files += [(STATIC/name, name) for name in ("panel.html", "panel.js", "panel.css")]
    for source, name in files:
        shutil.copyfile(source, DEST/name)
    archive = STATIC / "dickerer-sidebar.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for _, name in files:
            output.write(DEST/name, name)
    print("Built demo extension (six source files, no runtime data).")


if __name__ == "__main__":
    main()
