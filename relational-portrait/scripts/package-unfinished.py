"""Ship the current full-stack source and build, without credentials or dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent
out=root.parent/'downloads'/'unfinished-portrait-windows.zip'
assert (root/'dist/index.html').exists(), 'Run npm run build first'
out.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    for folder in ['dist','src/unfinished','server','public-portrait','tests/unfinished','docs/unfinished']:
        for p in (root/folder).rglob('*'):
            if p.is_file():z.write(p,'unfinished-portrait/'+str(p.relative_to(root)))
    for name in ['src/main.tsx','tests/browser/unfinished.spec.ts','package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html','README.md','.env.example','.gitignore','scripts/package-unfinished.py']:
        z.write(root/name,'unfinished-portrait/'+name)
    for name in ['start-demo-windows.bat','start-ai-windows.bat']:
        z.write(root/'desktop'/name,'unfinished-portrait/'+name)
    z.writestr('unfinished-portrait/先读我.txt','未完成的肖像\n\n全部解压。\n体验示例：双击 start-demo-windows.bat，无需 Node.js。保持窗口打开，在页面选择「体验示例」。\n真实生成：安装 Node.js 22.12+，配置 .env 后运行 start-ai-windows.bat，首次需要联网安装依赖。\n原始照片默认不存入档案；真实图像请求发送给 OpenAI。\n档案由用户主动下载，可在首页重新打开。\n详细启动、密钥配置、提示词位置与实测范围见 README.md。\n'.encode('utf-8-sig'))
with ZipFile(out) as z:
    assert z.testzip() is None
    assert not any(n.endswith('/.env') or '/node_modules/' in n for n in z.namelist())
print(f'{out} ({out.stat().st_size:,} bytes)')
