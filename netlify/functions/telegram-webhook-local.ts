import http from 'http'
import { handler } from './telegram-webhook'

const port = Number(process.env.PORT || 8787)
const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    return res.end('ok')
  }
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', async () => {
    const result = await handler({ body })
    res.writeHead(result.statusCode || 200, { 'content-type': 'application/json' })
    res.end(result.body || '{}')
  })
})

server.listen(port, () => {
  console.log(`Local webhook listening on http://localhost:${port}`)
})


