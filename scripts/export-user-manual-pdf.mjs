import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { marked } from 'marked'
import { pathToFileURL } from 'url'
import { join, dirname, resolve, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = join(root, 'docs')
const mdPath = join(docsDir, '使用说明书-用户版.md')
const htmlPath = join(docsDir, '_user-manual-print.html')
const pdfPath = join(docsDir, '使用说明书-用户版.pdf')

const md = readFileSync(mdPath, 'utf8')
marked.setOptions({ gfm: true })

const renderer = new marked.Renderer()
const originalImage = renderer.image.bind(renderer)
renderer.image = function ({ href, title, text }) {
  let resolvedHref = href
  if (href && !/^https?:\/\//i.test(href) && !href.startsWith('data:')) {
    const abs = isAbsolute(href) ? href : resolve(docsDir, href)
    resolvedHref = pathToFileURL(abs).href
  }
  return originalImage({ href: resolvedHref, title, text })
}

let body = marked.parse(md, { renderer })

// 紧跟图片后的斜体图注转为 figure caption 风格
body = body.replace(
  /(<img[\s\S]*?>)\s*<p><em>(.*?)<\/em><\/p>/g,
  '<figure class="manual-figure">$1<figcaption>$2</figcaption></figure>'
)

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>轻量化三维示教系统 使用说明书（用户版）</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #1a1a22;
    max-width: 780px;
    margin: 0 auto;
    padding: 8px 4px 28px;
  }
  h1 { font-size: 20pt; margin: 0 0 8px; line-height: 1.3; }
  h2 {
    font-size: 13.5pt;
    margin: 24px 0 10px;
    padding-bottom: 5px;
    border-bottom: 1.5px solid #d0d4dc;
    page-break-after: avoid;
  }
  h3 { font-size: 11.5pt; margin: 16px 0 8px; page-break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 12px 0 6px; }
  p, ul, ol { margin: 0 0 9px; }
  ul, ol { padding-left: 1.4em; }
  li { margin: 2px 0; }
  blockquote {
    margin: 10px 0;
    padding: 8px 12px;
    background: #f4f6fa;
    border-left: 3px solid #4a7fd4;
    color: #333;
  }
  blockquote p { margin: 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 14px;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #c8ccd4;
    padding: 5px 7px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #eef1f6; font-weight: 600; }
  hr { border: none; border-top: 1px solid #e0e3ea; margin: 18px 0; }
  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 9pt;
    background: #f0f2f6;
    padding: 1px 4px;
    border-radius: 3px;
  }
  strong { font-weight: 600; }
  .manual-figure {
    margin: 12px 0 18px;
    text-align: center;
    page-break-inside: avoid;
  }
  .manual-figure img {
    display: block;
    max-width: 100%;
    max-height: 340px;
    width: auto;
    height: auto;
    margin: 0 auto;
    border: 1px solid #d8dce4;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(20, 24, 40, 0.08);
  }
  .manual-figure figcaption {
    margin-top: 8px;
    font-size: 9.5pt;
    color: #5a5f6c;
  }
  @media print {
    body { padding: 0; max-width: none; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`

writeFileSync(htmlPath, html, 'utf8')

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
]
const browser = chromeCandidates.find((p) => existsSync(p))
if (!browser) {
  console.error('未找到 Chrome / Edge，无法导出 PDF')
  process.exit(1)
}

const result = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href
  ],
  { encoding: 'utf8' }
)

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'PDF 导出失败')
  process.exit(result.status ?? 1)
}

try {
  unlinkSync(htmlPath)
} catch {
  /* ignore */
}

console.log(`已生成: ${pdfPath}`)
