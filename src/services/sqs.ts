import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

export const sqsClient = new SQSClient({})
const COMMAND_QUEUE_URL = process.env.COMMAND_QUEUE_URL

export interface CommandPayload {
  command: 'judge' | 'gold'
  applicationId: string
  interactionToken: string
  guildId?: string
  userId?: string
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
