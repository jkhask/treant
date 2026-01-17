import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { getG2GGoldPrice } from './g2g'
import { recordGoldPrice, getGoldPriceHistory } from './price-history'
import { generateGoldChartUrl } from './chart'
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions'
import { secretsClient } from './clients'

const sqsClient = new SQSClient({})
const VOICE_QUEUE_URL = process.env.VOICE_QUEUE_URL

async function sendVoiceCommand(guildId: string, userId: string, text: string) {
  if (!VOICE_QUEUE_URL) {
    console.warn('VOICE_QUEUE_URL not set')
    return
  }
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: VOICE_QUEUE_URL,
      MessageBody: JSON.stringify({ guildId, userId, text }),
    }),
  )
}

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
        const subcommand = interaction.data.options?.[0]

        // Default to pun if no subcommand (shouldn't happen with new registration but good fallback)
        if (!subcommand || subcommand.name === 'pun') {
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

        if (subcommand.name === 'gold') {
          try {
            // Check for amount option
            const amountOption = subcommand.options?.find(
              (o: { name: string; value: number }) => o.name === 'amount',
            )
            const amount = amountOption?.value || 1000

            const unitPrice = await getG2GGoldPrice()
            const totalPrice = (unitPrice * amount).toFixed(2)

            // Record price asynchronously (don't block response but ensure it fires)
            await recordGoldPrice(unitPrice)

            // Generate Chart
            const history = await getGoldPriceHistory(24) // Last 24 records (12 hours if every 30 mins)
            const chartUrl = generateGoldChartUrl(history, amount)

            return {
              statusCode: 200,
              body: JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `💰 **Kang17 Gold Price:** $${totalPrice} for ${amount.toLocaleString()} gold ($${unitPrice.toFixed(
                    4,
                  )}/gold)`,
                  embeds: [
                    {
                      image: {
                        url: chartUrl,
                      },
                    },
                  ],
                },
              }),
            }
          } catch (error) {
            console.error('Error fetching G2G price:', error)
            return {
              statusCode: 200,
              body: JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `❌ **Error:** Failed to fetch G2G gold price.`,
                },
              }),
            }
          }
        }

        if (subcommand.name === 'speak') {
          const textOption = subcommand.options?.find(
            (o: { name: string; value: string }) => o.name === 'text',
          )
          const text = textOption?.value
          const guildId = interaction.guild_id
          const userId = interaction.member?.user?.id

          if (!text || !guildId || !userId) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `❌ **Error:** Missing required information (text: ${!!text}, guild: ${!!guildId}, user: ${!!userId})`,
                },
              }),
            }
          }

          try {
            await sendVoiceCommand(guildId, userId, text)
            return {
              statusCode: 200,
              body: JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `🗣️ **Treant says:** "${text}" (queued for voice worker)`,
                },
              }),
            }
          } catch (error) {
            console.error('Error queuing voice command:', error)
            return {
              statusCode: 200,
              body: JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `❌ **Error:** Failed to queue voice command.`,
                },
              }),
            }
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
