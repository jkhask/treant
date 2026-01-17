import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import {
  getBlizzardCredentials,
  getBlizzardToken,
  getWoWTokenPrice,
  getClassicAuctionHouseIndex,
  getAuctionHouseData,
} from './blizzard'
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions'
import { secretsClient } from './clients'

const SECRET_NAME = process.env.DISCORD_PUBLIC_KEY_SECRET_NAME
let cachedPublicKey: string | undefined

const getPublicKey = async () => {
  if (cachedPublicKey) return cachedPublicKey
  if (!SECRET_NAME) throw new Error('Secret name not defined')
  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }))
  cachedPublicKey = response.SecretString
  return response.SecretString
}

// Tree puns/jokes
import { TREE_QUOTES } from './constants/TREE_QUOTES'

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Received event:', JSON.stringify(event, null, 2))

  try {
    const publicKey = await getPublicKey()
    if (!publicKey) throw new Error('Could not retrieve public key')

    const signature = event.headers?.['x-signature-ed25519']
    const timestamp = event.headers?.['x-signature-timestamp']
    const body = event.body

    if (!body || !signature || !timestamp) {
      console.log('Missing body, signature, or timestamp')
      return {
        statusCode: 401,
        body: 'Missing signature or body',
      }
    }

    // Verify the request
    const isValidRequest = await verifyKey(body, signature, timestamp, publicKey)

    if (!isValidRequest) {
      console.log('Invalid signature')
      return {
        statusCode: 401,
        body: JSON.stringify('Bad request signature'),
      }
    }

    const interaction = JSON.parse(body)
    console.log('Interaction Type:', interaction.type)

    // Handle Discord PING (Required)
    if (interaction.type === InteractionType.PING) {
      console.log('Handling PING')
      return {
        statusCode: 200,
        body: JSON.stringify({
          type: InteractionResponseType.PONG,
        }),
      }
    }

    // Handle Slash Commands
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { name } = interaction.data

      if (name === 'treant') {
        const randomQuote = TREE_QUOTES[Math.floor(Math.random() * TREE_QUOTES.length)]
        return {
          statusCode: 200,
          body: JSON.stringify({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `🌲 **Treant says:** ${randomQuote}`,
            },
          }),
        }
      }

      if (name === 'wow-token') {
        try {
          // 1. Get Credentials
          const credentials = await getBlizzardCredentials()
          if (!credentials) throw new Error('Could not retrieve Blizzard credentials')

          // 2. Get Access Token
          const accessToken = await getBlizzardToken(credentials.clientId, credentials.clientSecret)

          // 3. Get WoW Token Price
          const tokenPrice = await getWoWTokenPrice(accessToken)
          const formattedPrice = Math.floor(tokenPrice / 10000).toLocaleString() // Gold is in copper

          return {
            statusCode: 200,
            body: JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `💰 **Current WoW Token Price:** ${formattedPrice} Gold`,
              },
            }),
          }
        } catch (error) {
          console.error('Error fetching WoW Token price:', error)
          return {
            statusCode: 200,
            body: JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content: `❌ **Error:** Failed to fetch WoW Token price. Check logs.`,
              },
            }),
          }
        }
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify('Unknown command'),
    }
  } catch (error) {
    console.error('Error handling request:', error)
    return {
      statusCode: 500,
      body: JSON.stringify('Internal Server Error'),
    }
  }
}
