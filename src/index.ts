import { APIGatewayProxyEvent, APIGatewayProxyResult, SQSEvent } from 'aws-lambda'
import { InteractionType, InteractionResponseType } from 'discord-interactions'
import { getPublicKey, verifyDiscordSignature } from './lib/discord/auth'
import { dispatchCommand } from './commands'
import { CommandPayload } from './services/sqs'
import { processJudgeCommandAsync } from './commands/judge'

export const handler = async (
  event: APIGatewayProxyEvent | SQSEvent,
): Promise<APIGatewayProxyResult | void> => {
  // Check for SQS Event
  if ('Records' in event) {
    console.log('Received SQS Event:', JSON.stringify(event, null, 2))
    for (const record of event.Records) {
      try {
        const payload = JSON.parse(record.body) as CommandPayload
        console.log('Processing SQS Message:', payload)

        if (payload.command === 'judge') {
          await processJudgeCommandAsync(payload)
        }
      } catch (error) {
        console.error('Error processing SQS record:', error)
      }
    }
    return
  }

  // API Gateway Event
  console.log('Received API Gateway Event:', JSON.stringify(event, null, 2))

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
