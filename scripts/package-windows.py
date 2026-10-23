"""Run after npm run build; produces the self-contained Windows download."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
if not (dist / 'index.html').is_file():
    raise SystemExit('Run npm run build first.')
output = root / 'downloads' / 'unnamed-creature-windows.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for name in ['start-windows.bat', '先读我.txt']:
        archive.write(root / 'desktop' / name, Path('unnamed-creature') / name)
    for path in sorted(dist.rglob('*')):
        if path.is_file():
            archive.write(path, Path('unnamed-creature/app') / path.relative_to(dist))
with ZipFile(output) as archive:
    assert archive.testzip() is None
print(f'Windows package: {output} ({output.stat().st_size / 1024 / 1024:.1f} MB)')
