import PDFDocument from 'pdfkit'
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
  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 56, right: 56 } })
      const chunks: Buffer[] = []
      doc.on('data', (d: Buffer) => chunks.push(d))
      doc.on('error', reject)
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      const generatedAt = new Date()
      doc.info = {
        Title: 'Regolamento Fantacalcio',
        Author: 'Pedro Bot',
        Subject: 'Regolamento ufficiale del Fantacalcio del gruppo',
        Keywords: 'fantacalcio, regolamento, regole, pedro bot',
        CreationDate: generatedAt as unknown as Date,
        ModDate: generatedAt as unknown as Date
      } as any

      const drawHeader = () => {
        const top = doc.page.margins.top - 36
        doc.save()
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333')
        doc.text('Regolamento Fantacalcio', doc.page.margins.left, top, { align: 'left' })
        doc.moveTo(doc.page.margins.left, top + 16).lineTo(doc.page.width - doc.page.margins.right, top + 16).lineWidth(0.5).stroke('#DDDDDD')
        doc.restore()
      }
      const drawFooter = () => {
        const y = doc.page.height - doc.page.margins.bottom + 24
        doc.save()
        doc.moveTo(doc.page.margins.left, y - 10).lineTo(doc.page.width - doc.page.margins.right, y - 10).lineWidth(0.5).stroke('#EEEEEE')
        doc.font('Helvetica').fontSize(9).fillColor('#666666')
        const pageNo = (doc as any)._pageBuffer?.length ? (doc as any)._pageBuffer.length + 1 : 1
        doc.text(`Pagina ${pageNo}`, doc.page.margins.left, y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'right' })
        doc.restore()
      }
      const onPage = () => {
        drawHeader()
        drawFooter()
      }
      doc.on('pageAdded', onPage)

      // Prima pagina: Indice
      onPage()
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#111111').text('Indice', { align: 'left' })
      doc.moveDown(0.75)
      doc.font('Helvetica').fontSize(11).fillColor('#000000')
      for (const r of rules) {
        doc.text(`${r.rule_number}. ${truncateLine(firstSentence(r.content), 90)}`)
      }

      // Sezione regole
      doc.addPage()
      onPage()
      for (const r of rules) {
        doc.save()
        doc.roundedRect(doc.page.margins.left - 6, doc.y - 6, doc.page.width - doc.page.margins.left - doc.page.margins.right + 12, 28, 6).fill('#F7F7F7')
        doc.restore()
        doc.moveDown(-1.2)
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(`${r.rule_number}. ${firstSentence(r.content)}`)
        doc.moveDown(0.2)
        doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).lineWidth(0.5).stroke('#E6E6E6')
        doc.moveDown(0.6)
        doc.font('Helvetica').fontSize(12).fillColor('#111111').text(cleanContent(r.content), { align: 'justify', lineGap: 2 })
        doc.moveDown(0.8)
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
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


