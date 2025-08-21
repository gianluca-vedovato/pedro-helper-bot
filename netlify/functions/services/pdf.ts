import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { rulesGetAll, getSupabase } from './db'

export async function rebuildAndUploadRulesPdf(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const rules = await rulesGetAll()
    if (!rules.length) return { ok: false, error: 'Nessuna regola presente' }
    // Prefer HTML-to-PDF for migliore qualità
    const buffer = await tryGenerateRulesPdfHtml(rules as any[]) || await generateRulesPdfBuffer(rules as any[])
    const client = getSupabase()
    if (!client) return { ok: false, error: 'Supabase non configurato' }
    const bucket = 'assets'
    const path = 'regolamento.pdf'
    const { error } = await client.storage.from(bucket).upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true
    })
    if (error) return { ok: false, error: error.message }
    const { data } = client.storage.from(bucket).getPublicUrl(path)
    return { ok: true, url: data.publicUrl }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Errore sconosciuto' }
  }
}

export async function generateRulesPdfBuffer(rules: { rule_number: number; content: string }[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)

  const A4 = { width: 595.28, height: 841.89 }
  const margin = { top: 64, bottom: 64, left: 56, right: 56 }

  const header = (page: any, _pageNo: number) => {
    const { width, height } = page.getSize()
    const y = height - margin.top + 28
    page.drawLine({ start: { x: margin.left, y: y - 14 }, end: { x: width - margin.right, y: y - 14 }, thickness: 0.5, color: rgb(0.87, 0.87, 0.87) })
    page.drawText('Regolamento', { x: margin.left, y, size: 10, font: serifBold, color: rgb(0.2, 0.2, 0.2) })
  }
  const footer = (page: any, pageNo: number) => {
    const { width } = page.getSize()
    const y = margin.bottom - 28
    page.drawLine({ start: { x: margin.left, y: y + 14 }, end: { x: width - margin.right, y: y + 14 }, thickness: 0.5, color: rgb(0.93, 0.93, 0.93) })
    const text = `Pagina ${pageNo}`
    const textWidth = serif.widthOfTextAtSize(text, 9)
    page.drawText(text, { x: width - margin.right - textWidth, y, size: 9, font: serif, color: rgb(0.4, 0.4, 0.4) })
  }

  let page = pdf.addPage([A4.width, A4.height])
  let pageNo = 1
  header(page, pageNo)
  footer(page, pageNo)

  let cursorY = A4.height - margin.top
  const maxWidth = A4.width - margin.left - margin.right

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < margin.bottom) {
      page = pdf.addPage([A4.width, A4.height])
      pageNo += 1
      header(page, pageNo)
      footer(page, pageNo)
      cursorY = A4.height - margin.top
    }
  }

  const drawTitle = (text: string) => {
    const size = 16
    const height = serifBold.heightAtSize(size)
    ensureSpace(height + 16)
    page.drawText(text, { x: margin.left, y: cursorY, size, font: serifBold, color: rgb(0.07, 0.07, 0.07) })
    cursorY -= height + 8
  }

  const drawParagraph = (text: string, size = 12, lineGap = 2, font = serif) => {
    const words = text.replace(/\s+/g, ' ').trim().split(' ')
    let line = ''
    const lineHeight = font.heightAtSize(size) + lineGap
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      const w = font.widthOfTextAtSize(test, size)
      if (w > maxWidth) {
        ensureSpace(lineHeight)
        page.drawText(line, { x: margin.left, y: cursorY, size, font, color: rgb(0.07, 0.07, 0.07) })
        cursorY -= lineHeight
        line = word
      } else {
        line = test
      }
    }
    if (line) {
      ensureSpace(lineHeight)
      page.drawText(line, { x: margin.left, y: cursorY, size, font, color: rgb(0.07, 0.07, 0.07) })
      cursorY -= lineHeight
    }
    cursorY -= lineGap
  }

  // Frontespizio formale
  drawTitle('Regolamento')
  drawParagraph('Il presente regolamento disciplina in modo organico e completo le disposizioni applicabili. Ogni articolo ha valore vincolante. Versione generata automaticamente.')

  // Sezione regole
  page = pdf.addPage([A4.width, A4.height])
  pageNo += 1
  header(page, pageNo)
  footer(page, pageNo)
  cursorY = A4.height - margin.top

  for (const r of rules) {
    ensureSpace(24)
    const title = `Art. ${r.rule_number} — ${firstSentence(r.content)}`
    page.drawText(title, { x: margin.left, y: cursorY, size: 14, font: serifBold, color: rgb(0.07, 0.07, 0.07) })
    cursorY -= 18
    drawParagraph(cleanContent(r.content), 12, 3, serif)
    cursorY -= 4
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

async function tryGenerateRulesPdfHtml(rules: { rule_number: number; content: string }[]): Promise<Buffer | null> {
  try {
    const executablePath = await chromium.executablePath()
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless
    })
    const page = await browser.newPage()
    const html = buildHtml(rules)
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      printBackground: true,
      format: 'A4',
      margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: htmlHeaderFooter('header'),
      footerTemplate: htmlHeaderFooter('footer')
    })
    await browser.close()
    return Buffer.from(pdf)
  } catch {
    return null
  }
}

function buildHtml(rules: { rule_number: number; content: string }[]): string {
  const now = new Date().toLocaleString('it-IT')
  const sections = rules
    .map(
      (r) => `
      <section class="rule">
        <h2>Art. ${r.rule_number} — ${escapeHtml(firstSentence(r.content))}</h2>
        <div class="content">${escapeHtml(cleanContent(r.content)).replace(/\n/g, '<br/>')}</div>
      </section>`
    )
    .join('')
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { size: A4; margin: 20mm 18mm; }
    body { font-family: 'Times New Roman', Times, serif; color: #111; }
    .title { text-align: center; font-size: 20px; font-weight: 700; margin: 0 0 8px; letter-spacing: 0.2px; }
    .subtitle { text-align: center; font-size: 12px; color: #666; margin: 0 0 18px; }
    .hr { height: 1px; background: #e5e5e5; margin: 12px 0 22px; }
    h2 { font-size: 14px; margin: 18px 0 8px; font-weight: 700; }
    .num { color: #111; font-weight: 700; }
    .rule .content { line-height: 1.5; text-align: justify; }
  </style>
  <title>Regolamento</title>
  </head>
<body>
  <div class="title">Regolamento</div>
  <div class="subtitle">Versione aggiornata • Generato il ${now}</div>
  <div class="hr"></div>
  ${sections}
</body>
</html>`
}

function htmlHeaderFooter(kind: 'header'|'footer'): string {
  if (kind === 'header') {
    return `<div style="width: 100%; font-size: 9px; color: #333; padding: 4px 10px; border-bottom: 1px solid #e2e2e2;">
      Regolamento Fantacalcio
    </div>`
  }
  return `<div style="width: 100%; font-size: 9px; color: #666; padding: 4px 10px; border-top: 1px solid #eee; text-align: right;">
    Pagina <span class="pageNumber"></span>
  </div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanContent(content: string): string {
  return String(content || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
}

function firstSentence(content: string): string {
  const text = cleanContent(content).trim()
  const m = text.match(/^[^.?!\n]{3,}([.?!]|\n)/)
  return m ? m[0].replace(/[\n]+/g, ' ').trim() : truncateLine(text, 120)
}

function truncateLine(text: string, max: number): string {
  const t = String(text || '').replace(/[\n\r]+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}


