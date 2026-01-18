import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

const sqsClient = new SQSClient({})
const VOICE_QUEUE_URL = process.env.VOICE_QUEUE_URL

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
