import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { secretsClient } from './secrets'
import { EquippedItem } from './blizzard'

const GOOGLE_API_KEY_SECRET_NAME = process.env.GOOGLE_API_KEY_SECRET_NAME

let cachedApiKey: string | null = null

export const getGeminiApiKey = async (): Promise<string | null> => {
  if (cachedApiKey) return cachedApiKey
  if (!GOOGLE_API_KEY_SECRET_NAME) {
    console.error('GOOGLE_API_KEY_SECRET_NAME not defined')
    return null
  }
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: GOOGLE_API_KEY_SECRET_NAME }),
    )
    if (response.SecretString) {
      cachedApiKey = response.SecretString
      return cachedApiKey
    }
  } catch (e) {
    console.error('Failed to fetch Google API Key secret', e)
  }
  return null
}

export const analyzeGear = async (
  characterName: string,
  items: EquippedItem[],
): Promise<string> => {
  console.log('Starting Gemini analysis...')
  const apiKey = await getGeminiApiKey()
  if (!apiKey) {
    console.error('API Key missing')
    return '❌ AI Analysis Unavailable: API Key missing.'
  }
  console.log('API Key fetched. Initializing model...')

  const genAI = new GoogleGenerativeAI(apiKey)
  // Using Gemini 3 Flash Preview as requested
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

  const itemListString = items
    .map((item) => `- [${item.slot.name}]: ${item.name} (${item.quality.name})`)
    .join('\n')

  const prompt = `
You are a World of Warcraft Classic expert. Analyze the gear for a character named "${characterName}".
Here is their equipped gear:
${itemListString}

Please provide a concise analysis in the following format:
**Estimated Avg Item Level**: [Calculate a rough average item level based on WoW Classic item knowledge]
**Analysis**: Brief summary of their gear quality (e.g., leveling greens, pre-raid BIS, raid gear).
**Suggestions**: a few specific recommendations for upgrades or missing slot optimizations as bullet points

Keep the tone constructive but slightly judgmental like a raid leader. You are an ancient treant. Old and wise, but still a raid leader.

IMPORTANT: Your response must be strictly under 1000 characters. Be concise.
`

  try {
    console.log('Generating content with Gemini...')
    const result = await model.generateContent(prompt)
    console.log('Gemini response received. getting text...')
    const response = await result.response
    return response.text()
  } catch (error) {
    console.error('Gemini Analysis Failed:', error)
    return '❌ AI Analysis Failed.'
  }
}
