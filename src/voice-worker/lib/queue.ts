import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { Client } from 'discord.js'
import { playTTS } from './tts'

const QUEUE_URL = process.env.QUEUE_URL
const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' })

export const pollQueue = async (client: Client) => {
  if (!QUEUE_URL) {
    console.error('QUEUE_URL NOT SET')
    return
  }

  try {
    const data = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
      }),
    )

    if (data.Messages && data.Messages.length > 0) {
      const message = data.Messages[0]
      const body = JSON.parse(message.Body || '{}')

      console.log('Received task:', body)

      const { guildId, userId, text } = body

      if (!client.isReady()) {
        console.warn('Client not ready yet')
        return
      }

      let guild = client.guilds.cache.get(guildId)
      if (!guild) {
        console.log(`Guild ${guildId} not in cache, fetching...`)
        guild = await client.guilds.fetch(guildId).catch(() => undefined)
      }

      if (guild) {
        console.log(`Found guild: ${guild.name}`)
        const member = await guild.members.fetch(userId).catch((err) => {
          console.error(`Error fetching member ${userId}:`, err)
          return null
        })

        if (member && member.voice.channelId) {
          console.log(`User ${userId} is in channel ${member.voice.channelId}`)
          await playTTS(member.voice.channelId, guild.id, text, guild.voiceAdapterCreator)
        } else {
          console.log(`User ${userId} not in voice channel`)
        }
      }

      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle,
        }),
      )
    }
  } catch (error) {
    console.error('Error polling SQS:', error)
  }

  setImmediate(() => pollQueue(client))
}
