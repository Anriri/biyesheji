"""Package the white creature as a single, dependency-free HTML plus editable sources."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / 'life-prototype'
html = (source / 'index.html').read_text()
css = (source / 'style.css').read_text()
javascript = (source / 'creature.js').read_text()
html = html.replace('<link rel="stylesheet" href="./style.css" />', '<style>\n' + css + '\n</style>')
html = html.replace('    <script src="./creature.js" defer></script>\n', '')
html = html.replace('  </body>', '    <script>\n' + javascript + '\n</script>\n  </body>')
assert 'src="./' not in html and 'href="./' not in html
(source / 'standalone.html').write_text(html)
destination = root / 'downloads' / 'unnamed-creature-life.zip'
destination.parent.mkdir(exist_ok=True)
with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
    archive.writestr('unnamed-creature-life/打开动画.html', html.encode('utf-8'))
    archive.writestr('unnamed-creature-life/先读我.txt', (
        '未名生物收容所 · 初生动画\n\n'
        '全部解压后，双击“打开动画.html”。\n'
        '不需要安装、不需要命令、不需要联网、不需要摄像头。\n'
        '动画自动播放，画面里只有白色软团子和深色眼睛。\n'
        '推荐 Chrome、Edge、Firefox 或 Safari。\n'
        'source 文件夹包含可编辑的 HTML、CSS、JavaScript 与说明。\n'
    ).encode('utf-8-sig'))
    for name in ['index.html', 'style.css', 'creature.js', 'README.md']:
        archive.write(source / name, f'unnamed-creature-life/source/{name}')
with ZipFile(destination) as archive:
    assert archive.testzip() is None
print(f'Standalone HTML and ZIP prepared: {destination} ({destination.stat().st_size:,} bytes)')
