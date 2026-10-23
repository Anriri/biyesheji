"""Package the white creature as a single, dependency-free HTML plus editable sources."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from shutil import copyfile

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
        '未名生物收容所 · 白色团子生命感与塑形\n\n'
        '全部解压后，双击“打开动画.html”。\n'
        '不需要安装、不需要命令、不需要联网、不需要摄像头。\n'
        '动画自动播放，白色团子保留浮动、摇晃、眨眼。\n'
        '增强塑形：鼠标按住轮廓向外拉，可明显拉长；顶部下压可压扁并摊宽。\n'
        '每次局部修改可以叠加，最大拉伸约为旧版的 2—3 倍。\n'
        '连续塑形修正版：先向两边拉宽，再抓顶部向上拉；拉宽不会用尽向上拉的额度。\n'
        '局部揉捏修正版：凸出的小角可往身体内收，也可以再次往外拉。\n'
        '新增自由肢体：点击“长出肢体”，按住身体边缘向外拖，松手保留。\n'
        '点击肢体选中；末端圆点调整长短方向，中间圆点调整弯曲，滑块调整粗细。\n'
        '可添加多个肢体；点击“删除肢体”或按 Delete 删除选中肢体。\n'
        '点击“揉捏身体”回到原有身体塑形；所有身体和肢体操作共用撤销历史。\n'
        '节外生枝：在“长出肢体”模式，从已有肢体边缘再向外拖，可以连续长多级分支。\n'
        '单击已有肢体仍可选中，拖圆点进行编辑；删除会连同子分支删除，撤销可恢复整支。\n'
        '自由回弯：末端圆点可以往身体方向拖，越过根部朝向；中间圆点可拉出更深的内弯。\n'
        '自由涂色：点击“自由涂色”，选颜色和粗细，按住拖动绘画，点按画圆点；支持触屏。\n'
        '橡皮擦只擦笔迹；可独立修改身体、所选肢体或全身底色，不会抹掉涂鸦。\n'
        '支持重做：Ctrl+Shift+Z 或 Ctrl+Y。重置会清空当前作品，但可以撤销。\n'
        '自动保存到此浏览器；点击“保存作品”下载 JSON，用“打开作品”恢复完整形态和涂色。\n'
        '松开后会有自然的 Q 弹晃动，最后保留塑形结果，不会恢复原状。\n'
        '点击撤销或按 Ctrl+Z 回退，点击重置恢复初始形状。重置也能撤销。\n'
        '推荐 Chrome、Edge、Firefox 或 Safari。\n'
        'source 文件夹包含可编辑的 HTML、CSS、JavaScript 与说明。\n'
    ).encode('utf-8-sig'))
    for name in ['index.html', 'style.css', 'creature.js', 'README.md']:
        archive.write(source / name, f'unnamed-creature-life/source/{name}')
with ZipFile(destination) as archive:
    assert archive.testzip() is None
copyfile(destination, destination.with_name('unnamed-creature-life-sculpt.zip'))
copyfile(destination, destination.with_name('unnamed-creature-life-sculpt-v2.zip'))
copyfile(destination, destination.with_name('unnamed-creature-life-sculpt-v3.zip'))
copyfile(destination, destination.with_name('unnamed-creature-life-sculpt-v4.zip'))
copyfile(destination, destination.with_name('unnamed-creature-life-limbs-v1.zip'))
copyfile(destination, destination.with_name('unnamed-creature-life-branches-v1.zip'))
copyfile(destination, destination.with_name('unnamed-creature-life-branches-v2.zip'))
copyfile(destination, destination.with_name('unnamed-creature-life-paint-v1.zip'))
print(f'Standalone HTML and ZIP prepared: {destination} ({destination.stat().st_size:,} bytes)')
