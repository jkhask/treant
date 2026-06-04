import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { secretsClient } from './secrets'

const WARCRAFT_LOGS_SECRET_NAME = process.env.WARCRAFT_LOGS_SECRET_NAME

export interface WarcraftLogsCredentials {
  clientId: string
  clientSecret: string
}

let cachedCredentials: WarcraftLogsCredentials | null = null
let cachedToken: string | null = null
let tokenExpiration: number = 0

export const getWarcraftLogsCredentials = async (): Promise<WarcraftLogsCredentials | null> => {
  if (cachedCredentials) return cachedCredentials
  if (!WARCRAFT_LOGS_SECRET_NAME) {
    console.error('WARCRAFT_LOGS_SECRET_NAME not defined')
    return null
  }
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: WARCRAFT_LOGS_SECRET_NAME }),
    )
    if (response.SecretString) {
      cachedCredentials = JSON.parse(response.SecretString) as WarcraftLogsCredentials
      return cachedCredentials
    }
  } catch (e) {
    console.error('Failed to fetch Warcraft Logs secret', e)
  }
  return null
}

export const getWarcraftLogsToken = async (clientId: string, clientSecret: string): Promise<string> => {
  if (cachedToken && Date.now() < tokenExpiration) return cachedToken

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  
  // WCL v2 oauth token endpoint
  const response = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Warcraft Logs token: ${response.statusText}`)
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  cachedToken = data.access_token
  tokenExpiration = Date.now() + (data.expires_in - 60) * 1000
  return data.access_token
}

export interface ZoneParse {
  name: string
  dpsParse?: number
  hpsParse?: number
  tankParse?: number
}

export type CharacterParses = ZoneParse[]

export const getCharacterParses = async (
  accessToken: string,
  realmSlug: string,
  characterName: string,
): Promise<CharacterParses | null> => {
  const query = `
    query($name: String!, $serverSlug: String!, $serverRegion: String!) {
      characterData {
        character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          sscDps: zoneRankings(zoneID: 1056, metric: dps)
          sscHps: zoneRankings(zoneID: 1056, metric: hps)
          sscTank: zoneRankings(zoneID: 1056, metric: tankhps)
          gruulDps: zoneRankings(zoneID: 1048, metric: dps)
          gruulHps: zoneRankings(zoneID: 1048, metric: hps)
          gruulTank: zoneRankings(zoneID: 1048, metric: tankhps)
          karaDps: zoneRankings(zoneID: 1047, metric: dps)
          karaHps: zoneRankings(zoneID: 1047, metric: hps)
          karaTank: zoneRankings(zoneID: 1047, metric: tankhps)
        }
      }
    }
  `

  const variables = {
    name: characterName,
    serverSlug: realmSlug, // e.g. "dreamscythe"
    serverRegion: "us"
  }

  // Use the fresh (Anniversary) endpoint
  const url = 'https://fresh.warcraftlogs.com/api/v2/client'

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    })

    if (!response.ok) {
      console.error(`WCL API Error: ${response.status} ${response.statusText}`)
      return null
    }

    const json = (await response.json()) as any
    if (json.errors) {
      console.error('WCL GraphQL Errors:', json.errors)
      return null
    }

    const character = json.data?.characterData?.character
    if (!character) return null

    const zones: CharacterParses = []
    
    const zonesToParse = [
      { id: 'ssc', name: 'SSC / TK' },
      { id: 'gruul', name: 'Gruul / Magtheridon' },
      { id: 'kara', name: 'Karazhan' }
    ]

    for (const z of zonesToParse) {
      const dps = character[`${z.id}Dps`]?.bestPerformanceAverage
      const hps = character[`${z.id}Hps`]?.bestPerformanceAverage
      const tank = character[`${z.id}Tank`]?.bestPerformanceAverage

      if (typeof dps === 'number' || typeof hps === 'number' || typeof tank === 'number') {
        zones.push({
          name: z.name,
          dpsParse: typeof dps === 'number' ? dps : undefined,
          hpsParse: typeof hps === 'number' ? hps : undefined,
          tankParse: typeof tank === 'number' ? tank : undefined,
        })
      }
    }

    return zones.length > 0 ? zones : null
  } catch (error) {
    console.error('Failed to fetch Warcraft Logs parses:', error)
    return null
  }
}
