import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { secretsClient } from './secrets'

const BLIZZARD_SECRET_NAME = process.env.BLIZZARD_SECRET_NAME

export interface BlizzardCredentials {
  clientId: string
  clientSecret: string
}

let cachedCredentials: BlizzardCredentials | null = null
let cachedToken: string | null = null
let tokenExpiration: number = 0
export interface AuctionHouseIndex {
  auctions: string
}
export const getBlizzardCredentials = async (): Promise<BlizzardCredentials | null> => {
  if (cachedCredentials) return cachedCredentials
  if (!BLIZZARD_SECRET_NAME) {
    console.error('BLIZZARD_SECRET_NAME not defined')
    return null
  }
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: BLIZZARD_SECRET_NAME }),
    )
    if (response.SecretString) {
      cachedCredentials = JSON.parse(response.SecretString) as BlizzardCredentials
      return cachedCredentials
    }
  } catch (e) {
    console.error('Failed to fetch Blizzard secret', e)
  }
  return null
}

export const getBlizzardToken = async (clientId: string, clientSecret: string): Promise<string> => {
  if (cachedToken && Date.now() < tokenExpiration) return cachedToken

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Blizzard token: ${response.statusText}`)
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  cachedToken = data.access_token
  // Buffer expiration by 60 seconds
  tokenExpiration = Date.now() + (data.expires_in - 60) * 1000
  return data.access_token
}

export const getWoWTokenPrice = async (accessToken: string): Promise<number> => {
  // US Region, Static Namespace
  const url = 'https://us.api.blizzard.com/data/wow/token/index?namespace=dynamic-us&locale=en_US'
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch WoW Token price: ${response.statusText}`)
  }

  const data = (await response.json()) as { price: number }
  return data.price
}

export const getClassicAuctionHouseIndex = async (
  accessToken: string,
  connectedRealmId: number,
): Promise<AuctionHouseIndex> => {
  // Classic Namespace: dynamic-classic-us for Anniversary
  const url = `https://us.api.blizzard.com/data/wow/connected-realm/${connectedRealmId}/auctions/index?namespace=dynamic-classic-us&locale=en_US`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Classic AH Index: ${response.statusText}`)
  }

  return (await response.json()) as AuctionHouseIndex
}

export interface AuctionHouseData {
  id: number
  item: { id: number }
  buyout: number
  quantity: number
  time_left: string
}

export const getAuctionHouseData = async (
  accessToken: string,
  connectedRealmId: number,
  auctionHouseId: number,
): Promise<AuctionHouseData[]> => {
  const url = `https://us.api.blizzard.com/data/wow/connected-realm/${connectedRealmId}/auctions/${auctionHouseId}?namespace=dynamic-classic-us&locale=en_US`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Auction House Data: ${response.statusText}`)
  }

  return (await response.json()) as AuctionHouseData[]
}

export interface EquippedItem {
  slot: { name: string }
  item: { id: number }
  name: string
  quality: { name: string }
}

export interface CharacterEquipment {
  equipped_items: EquippedItem[]
}

export const getCharacterEquipment = async (
  accessToken: string,
  realmSlug: string,
  characterName: string,
): Promise<CharacterEquipment> => {
  // Classic Era Anniversary Namespace: profile-classic-us (verified via script)
  const url = `https://us.api.blizzard.com/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}/equipment?namespace=profile-classic-us&locale=en_US&t=${Date.now()}`

  console.log(`[Blizzard] Requesting equipment from: ${url}`)

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })

    console.log(`[Blizzard] Response received. Status: ${response.status}`)

    if (!response.ok) {
      console.error(`[Blizzard] Error response: ${response.status} ${response.statusText}`)
      if (response.status === 404) {
        throw new Error(`Character ${characterName} not found on realm ${realmSlug}`)
      }
      throw new Error(`Failed to fetch Character Equipment: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('[Blizzard] JSON parsed successfully')
    return data as CharacterEquipment
  } catch (error) {
    console.error('[Blizzard] Fetch failed:', error)
    throw error
  }
}
