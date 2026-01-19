import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

export const sqsClient = new SQSClient({})
const COMMAND_QUEUE_URL = process.env.COMMAND_QUEUE_URL
const VOICE_QUEUE_URL = process.env.VOICE_QUEUE_URL

export interface CommandPayload {
  command: 'judge'
  applicationId: string
  interactionToken: string
  options: any[]
}

export const sendCommandToQueue = async (payload: CommandPayload) => {
  if (!COMMAND_QUEUE_URL) {
    throw new Error('COMMAND_QUEUE_URL is not defined')
  }

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: COMMAND_QUEUE_URL,
      MessageBody: JSON.stringify(payload),
    }),
  )
}

export const sendVoiceCommand = async (guildId: string, userId: string, text: string) => {
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
