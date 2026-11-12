import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';

const mdPath = 'C:/Users/adity/.gemini/antigravity/brain/4edb32c3-e392-495b-b832-8939b441d274/master-technical-manual.md';
const tempHtmlPath = 'C:/Users/adity/LogStay-Mobile/Docs/LogStay_Master_Architecture_Technical_Manual.html';
const pdfDestDocs = 'C:/Users/adity/LogStay-Mobile/Docs/LogStay_Master_Architecture_Technical_Manual.pdf';
const pdfDestBrain = 'C:/Users/adity/.gemini/antigravity/brain/4edb32c3-e392-495b-b832-8939b441d274/master-technical-manual.pdf';

console.log('1. Reading markdown source...');
const mdContent = fs.readFileSync(mdPath, 'utf8');

// Temporary markdown file in current directory to avoid CLI path issues
const tempMd = path.resolve('temp_manual.md');
fs.writeFileSync(tempMd, mdContent, 'utf8');

console.log('2. Converting markdown to HTML using marked...');
const bodyHtml = execSync(`npx marked -i "${tempMd}"`, { maxBuffer: 10 * 1024 * 1024 }).toString();
fs.unlinkSync(tempMd);

console.log('3. Injecting publication-grade styling and typography...');
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LogStay-Mobile: Master Architecture, Technical Manual & Blueprint</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

    @page {
      size: A4;
      margin: 18mm 14mm 18mm 14mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11.5px;
      line-height: 1.55;
      color: #1e293b;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }

    /* Cover / Document Header */
    .doc-header {
      border-bottom: 3px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .doc-badge {
      display: inline-block;
      background-color: #eff6ff;
      color: #1d4ed8;
      font-weight: 700;
      font-size: 9.5px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 8px;
      border: 1px solid #bfdbfe;
    }

    h1 {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      margin: 8px 0 6px 0;
      line-height: 1.25;
      letter-spacing: -0.4px;
    }

    h2 {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 5px;
      margin-top: 26px;
      margin-bottom: 12px;
      page-break-after: avoid;
      letter-spacing: -0.2px;
    }

    h3 {
      font-size: 13px;
      font-weight: 700;
      color: #1e293b;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }

    h4 {
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }

    p {
      margin: 0 0 10px 0;
    }

    ul, ol {
      margin: 0 0 12px 0;
      padding-left: 20px;
    }

    li {
      margin-bottom: 4px;
    }

    strong {
      color: #0f172a;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 18px 0;
      font-size: 10px;
      line-height: 1.4;
      page-break-inside: auto;
    }

    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background-color: #f1f5f9;
      font-weight: 700;
      color: #0f172a;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
    }

    /* Code Blocks & ASCII Art */
    pre {
      background-color: #0f172a;
      color: #f1f5f9;
      border-radius: 6px;
      padding: 10px 12px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
      font-size: 9.5px;
      line-height: 1.38;
      margin: 10px 0 14px 0;
      border: 1px solid #1e293b;
      page-break-inside: avoid;
      white-space: pre;
    }

    code {
      font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
      font-size: 10px;
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 1.5px 4px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
    }

    pre code {
      background-color: transparent;
      color: inherit;
      padding: 0;
      border: none;
      font-size: 9.5px;
    }

    /* Callout & Quotes */
    blockquote {
      border-left: 3.5px solid #2563eb;
      background-color: #f8fafc;
      padding: 8px 14px;
      margin: 10px 0 14px 0;
      color: #334155;
      font-style: italic;
      border-radius: 0 4px 4px 0;
    }

    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }

    a {
      color: #2563eb;
      text-decoration: none;
    }

    /* Print Break Utilities */
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <div class="doc-badge">LogStay Systems Engineering • Core Technical Specification</div>
  </div>
  ${bodyHtml}
</body>
</html>`;

fs.writeFileSync(tempHtmlPath, fullHtml, 'utf8');
console.log('4. HTML written to:', tempHtmlPath);

console.log('5. Rendering PDF via Headless Chrome...');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

execFileSync(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  '--print-to-pdf=' + pdfDestDocs,
  tempHtmlPath
]);

console.log('✅ PDF generated in Docs:', pdfDestDocs, 'Size:', fs.statSync(pdfDestDocs).size);

// Copy to brain artifact directory as well
fs.copyFileSync(pdfDestDocs, pdfDestBrain);
console.log('✅ PDF mirrored to brain directory:', pdfDestBrain);

