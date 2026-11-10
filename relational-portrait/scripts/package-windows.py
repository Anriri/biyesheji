"""Package the verified Vite build with the existing repository's Windows local server."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent
output=root.parent/'downloads'/'relational-portrait-windows-v1.zip'
assert (root/'dist/index.html').exists(), 'Run npm run build first'
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output,'w',ZIP_DEFLATED) as z:
    for p in (root/'dist').rglob('*'):
        if p.is_file(): z.write(p,'relational-portrait/app/'+str(p.relative_to(root/'dist')))
    z.write(root/'desktop/start-windows.bat','relational-portrait/start-windows.bat')
    z.write(root/'README.md','relational-portrait/README.md')
    for p in (root/'docs').rglob('*'):
        if p.is_file(): z.write(p,'relational-portrait/docs/'+str(p.relative_to(root/'docs')))
    z.writestr('relational-portrait/先读我.txt', 'RELATIONAL PORTRAIT · Windows 10 / 11\n\n全部解压，双击 start-windows.bat。保持窗口打开。\n无需安装 Node.js 或 Python，模型与素材已包含。\n先点击 Generate portrait，再进入 Live interaction。\n默认 Manual 模式，无摄像头也能体验。Use camera 需要允许摄像头。\n不要直接双击 app/index.html，模块和 WASM 需要通过本机服务加载。\n保存作品用 Final portrait 中的 PNG、JSON 与 Text & motifs。\nJSON 可通过 Open portrait 重新打开，并回放变化过程。\nsource 中是独立的完整源代码，旧版生物项目没有被覆盖。\n'.encode('utf-8-sig'))
    for name in ['src','scripts','tests','public/models','docs','desktop']:
        for p in (root/name).rglob('*'):
            if p.is_file():z.write(p,'relational-portrait/source/'+str(p.relative_to(root)))
    for name in ['.gitignore','.gitattributes','package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html','README.md']:
        z.write(root/name,'relational-portrait/source/'+name)
    z.write(root/'public/THIRD_PARTY_NOTICES.txt','relational-portrait/source/public/THIRD_PARTY_NOTICES.txt')
with ZipFile(output) as z: assert z.testzip() is None
print(f'Packaged: {output} ({output.stat().st_size:,} bytes)')
