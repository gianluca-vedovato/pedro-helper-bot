import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { rulesGetAll } from './services/db'

export async function handler(event: any) {
  try {
    if ((event?.httpMethod || event?.method || 'GET') !== 'GET') {
      return { statusCode: 405, headers: { Allow: 'GET' }, body: 'Method Not Allowed' }
    }

    const rules = await rulesGetAll()
    if (!rules.length) {
      return { statusCode: 404, headers: { 'content-type': 'text/plain' }, body: 'Nessuna regola disponibile' }
    }

    const buffer = await generateRulesPdfBuffer(rules as any[])
    const fileName = `Regolamento_Fantacalcio_${new Date().toISOString().slice(0, 10)}.pdf`

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${fileName}"`
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    }
  } catch (error) {
    console.error('Errore generazione PDF:', error)
    return { statusCode: 500, headers: { 'content-type': 'text/plain' }, body: 'Errore interno' }
  }
}

async function generateRulesPdfBuffer(rules: { rule_number: number; content: string }[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const A4 = { width: 595.28, height: 841.89 }
  const margin = { top: 64, bottom: 64, left: 56, right: 56 }

  const header = (page: any, _pageNo: number) => {
    const { width, height } = page.getSize()
    const y = height - margin.top + 28
    page.drawLine({ start: { x: margin.left, y: y - 14 }, end: { x: width - margin.right, y: y - 14 }, thickness: 0.5, color: rgb(0.87, 0.87, 0.87) })
    page.drawText('Regolamento Fantacalcio', { x: margin.left, y, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  }
  const footer = (page: any, pageNo: number) => {
    const { width } = page.getSize()
    const y = margin.bottom - 28
    page.drawLine({ start: { x: margin.left, y: y + 14 }, end: { x: width - margin.right, y: y + 14 }, thickness: 0.5, color: rgb(0.93, 0.93, 0.93) })
    const text = `Pagina ${pageNo}`
    const textWidth = helvetica.widthOfTextAtSize(text, 9)
    page.drawText(text, { x: width - margin.right - textWidth, y, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
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
    const height = helveticaBold.heightAtSize(size)
    ensureSpace(height + 16)
    page.drawText(text, { x: margin.left, y: cursorY, size, font: helveticaBold, color: rgb(0.07, 0.07, 0.07) })
    cursorY -= height + 8
  }

  const drawParagraph = (text: string, size = 12, lineGap = 2, font = helvetica) => {
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

  // Indice
  drawTitle('Indice')
  for (const r of rules) {
    const preview = `${r.rule_number}. ${truncateLine(firstSentence(r.content), 90)}`
    drawParagraph(preview, 11, 1, helvetica)
  }

  // Sezione regole
  page = pdf.addPage([A4.width, A4.height])
  pageNo += 1
  header(page, pageNo)
  footer(page, pageNo)
  cursorY = A4.height - margin.top

  for (const r of rules) {
    // Titolo box
    ensureSpace(30)
    const title = `${r.rule_number}. ${firstSentence(r.content)}`
    // background bar
    page.drawRectangle({ x: margin.left - 6, y: cursorY - 6, width: maxWidth + 12, height: 24, color: rgb(0.97, 0.97, 0.97) })
    page.drawText(title, { x: margin.left, y: cursorY, size: 14, font: helveticaBold, color: rgb(0.07, 0.07, 0.07) })
    cursorY -= 28
    // contenuto
    drawParagraph(cleanContent(r.content), 12, 2, helvetica)
    cursorY -= 6
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
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


