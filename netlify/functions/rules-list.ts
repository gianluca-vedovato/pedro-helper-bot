import { connectLambda } from '@netlify/blobs'
import { rulesGetAll } from './services/rules'

export async function handler(event: any) {
  if ((event?.httpMethod || event?.method || 'GET') !== 'GET') {
    return { statusCode: 405, headers: { Allow: 'GET' }, body: 'Method Not Allowed' }
  }

  try {
    if (event?.blobs) connectLambda(event)
    const rules = await rulesGetAll()
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rules)
    }
  } catch (error) {
    console.error('Errore rules-list:', error)
    return { statusCode: 500, headers: { 'content-type': 'text/plain' }, body: 'Errore interno' }
  }
}
