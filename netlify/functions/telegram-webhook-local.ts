import 'dotenv/config'
import http from 'http'
import handler from './telegram-webhook'

const port = Number(process.env.PORT || 8787)
const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    return res.end('ok')
  }
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', async () => {
    try {
      const result = await handler({ body, method: 'POST', url: req.url }, res)
      if (result) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(result))
      }
    } catch (error) {
      console.error('Error in local handler:', error)
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })
})

server.listen(port, () => {
  console.log(`Local webhook listening on http://localhost:${port}`)
  console.log('Environment variables loaded:', {
    BOT_TOKEN: process.env.BOT_TOKEN ? '✅ Set' : '❌ Missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing',
    SUPABASE_URL: process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'
  })
})


