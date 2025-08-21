import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
// Rimosso Chrome per compatibilità Netlify; usiamo markdown-it + pdf-lib
import { rulesGetAll, getSupabase } from './db'
import MarkdownIt from 'markdown-it'

export async function rebuildAndUploadRulesPdf(options?: { force?: 'html' | 'fallback' }): Promise<{ ok: boolean; url?: string; error?: string; renderer?: 'html' | 'fallback' }> {
  try {
    const rules = await rulesGetAll()
    if (!rules.length) return { ok: false, error: 'Nessuna regola presente' }
    // Genera Markdown e renderizza con pdf-lib (compatibile serverless)
    const md = await (await import('./ai')).buildRegulationMarkdown(rules as any[])
    const buffer = await generateRulesPdfBufferFromMarkdown(md)
    const renderer: 'html' | 'fallback' = 'fallback'
    const client = getSupabase()
    if (!client) return { ok: false, error: 'Supabase non configurato' }
    const bucket = process.env.SUPABASE_BUCKET || 'assets'
    const path = process.env.SUPABASE_RULES_PDF_PATH || 'regolamento.pdf'
    // Assicura che il bucket esista ed è pubblico
    const { error: bucketCreateError } = await (client as any).storage.createBucket(bucket, { public: true })
    if (bucketCreateError && !String(bucketCreateError.message || '').toLowerCase().includes('already exists')) {
      return { ok: false, error: `Bucket error: ${bucketCreateError.message}` }
    }
    const { error } = await client.storage.from(bucket).upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true
    })
    if (error) return { ok: false, error: error.message }
    const { data } = client.storage.from(bucket).getPublicUrl(path)
    return { ok: true, url: data.publicUrl, renderer }
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

// Parser minimale Markdown → blocchi per pdf-lib (titoli, liste, paragrafi)
async function generateRulesPdfBufferFromMarkdown(markdown: string): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const A4 = { width: 595.28, height: 841.89 }
  const margin = { top: 64, bottom: 64, left: 56, right: 56 }

  let page = pdf.addPage([A4.width, A4.height])
  let cursorY = A4.height - margin.top
  const maxWidth = A4.width - margin.left - margin.right

  const ensure = (h: number) => {
    if (cursorY - h < margin.bottom) {
      page = pdf.addPage([A4.width, A4.height])
      cursorY = A4.height - margin.top
    }
  }
  const drawLine = (text: string, size: number, font: any, extraGap = 0) => {
    const words = text.split(/\s+/)
    let line = ''
    const lh = font.heightAtSize(size) + 4 // interlinea maggiore
    for (const w of words) {
      const t = line ? line + ' ' + w : w
      if (font.widthOfTextAtSize(t, size) > maxWidth) {
        ensure(lh)
        page.drawText(line, { x: margin.left, y: cursorY, size, font })
        cursorY -= lh
        line = w
      } else {
        line = t
      }
    }
    if (line) {
      ensure(lh)
      page.drawText(line, { x: margin.left, y: cursorY, size, font })
      cursorY -= lh
    }
    if (extraGap) cursorY -= extraGap
  }

  const lines = markdown.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trimEnd()
    if (!line.trim()) {
      cursorY -= 4
      i++
      continue
    }
    // H1 / H2
    if (line.startsWith('# ')) {
      const text = line.replace(/^#\s+/, '')
      ensure(22)
      drawLine(text, 18, serifBold, 4)
      i++
      continue
    }
    if (line.startsWith('## ')) {
      const text = line.replace(/^##\s+/, '')
      cursorY -= 8
      drawLine(text, 14, serifBold, 2)
      cursorY -= 4
      i++
      continue
    }
    // Liste puntate
    if (line.match(/^[-*]\s+/)) {
      let block: string[] = []
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        block.push(lines[i])
        i++
      }
      for (const item of block) {
        const text = item.replace(/^[-*]\s+/, '• ')
        drawLine(text, 12, serif)
      }
      cursorY -= 4
      continue
    }
    // Liste numerate
    if (line.match(/^\d+\.\s+/)) {
      let block: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        block.push(lines[i])
        i++
      }
      for (const item of block) {
        drawLine(item, 12, serif)
      }
      cursorY -= 4
      continue
    }
    // Paragrafo
    drawLine(line, 12, serif, 2)
    cursorY -= 2
    i++
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
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


