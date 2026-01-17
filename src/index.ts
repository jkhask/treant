import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions'

const secretsClient = new SecretsManagerClient({})
const SECRET_NAME = process.env.DISCORD_PUBLIC_KEY_SECRET_NAME

const getPublicKey = async () => {
  if (!SECRET_NAME) throw new Error('Secret name not defined')
  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }))
  return response.SecretString
}

// Tree puns/jokes
const TREE_QUOTES = [
  "I'm rooting for you!",
  "Leaf me alone, I'm bushing!",
  "You're un-be-leaf-able!",
  'Branching out, are we?',
  "I'm stumped.",
  'Wood you like to hear a joke?',
  'Stay grounded.',
  "That's tree-mendous!",
  'Barking up the wrong tree?',
  'Turn over a new leaf.',
]

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

// Blizzard Helpers
const BLIZZARD_SECRET_NAME = process.env.BLIZZARD_SECRET_NAME

interface BlizzardCredentials {
  clientId: string
  clientSecret: string
}

const getBlizzardCredentials = async (): Promise<BlizzardCredentials | null> => {
  if (!BLIZZARD_SECRET_NAME) {
    console.error('BLIZZARD_SECRET_NAME not defined')
    return null
  }
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: BLIZZARD_SECRET_NAME }),
    )
    if (response.SecretString) {
      return JSON.parse(response.SecretString) as BlizzardCredentials
    }
  } catch (e) {
    console.error('Failed to fetch Blizzard secret', e)
  }
  return null
}

const getBlizzardToken = async (clientId: string, clientSecret: string): Promise<string> => {
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

  const data = (await response.json()) as { access_token: string }
  return data.access_token
}

const getWoWTokenPrice = async (accessToken: string): Promise<number> => {
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
