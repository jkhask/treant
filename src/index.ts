import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { InteractionType, InteractionResponseType } from 'discord-interactions'
import { getPublicKey, verifyDiscordSignature } from './lib/discord/auth'
import { dispatchCommand } from './commands'

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
    const isValidRequest = await verifyDiscordSignature(body, signature, timestamp, publicKey)

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

    // Dispatch Command
    const response = await dispatchCommand(interaction)
    if (response) {
      return {
        statusCode: 200,
        body: JSON.stringify(response),
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
