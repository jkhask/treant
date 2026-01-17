import { Client, GatewayIntentBits } from 'discord.js'
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} from '@discordjs/voice'
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { Readable } from 'stream'

const QUEUE_URL = process.env.QUEUE_URL
const DISCORD_TOKEN_SECRET = process.env.DISCORD_TOKEN_SECRET_NAME || 'DiscordToken' // Fallback for testing
const REGION = process.env.AWS_REGION || 'us-east-1'

const sqs = new SQSClient({ region: REGION })
const polly = new PollyClient({ region: REGION })
const secretsClient = new SecretsManagerClient({ region: REGION })

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
})

client.on('clientReady', () => {
  console.log(`Logged in as ${client.user?.tag}!`)
  console.log(`Bot is in ${client.guilds.cache.size} guilds:`)
  client.guilds.cache.forEach((g) => console.log(` - ${g.name} (${g.id})`))
})

async function getDiscordToken(): Promise<string> {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: DISCORD_TOKEN_SECRET }),
  )
  if (!response.SecretString) throw new Error('SecretString is empty')
  // Secret might be JSON '{"token":"..."}' or just plain string
  try {
    const json = JSON.parse(response.SecretString)
    return json.DISCORD_TOKEN || json.token || response.SecretString
  } catch {
    return response.SecretString
  }
}

async function playTTS(channelId: string, guildId: string, text: string, adapterCreator: any) {
  try {
    const connection = joinVoiceChannel({
      channelId: channelId,
      guildId: guildId,
      adapterCreator: adapterCreator,
      selfDeaf: false,
    })

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000)

    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: 'Brian', // British English male
      Engine: 'neural',
    })

    const response = await polly.send(command)
    if (!response.AudioStream) throw new Error('No audio stream returned')

    const audioStream = response.AudioStream as Readable
    const resource = createAudioResource(audioStream, {
      inputType: StreamType.Arbitrary,
    })

    const player = createAudioPlayer()
    connection.subscribe(player)
    player.play(resource)

    await entersState(player, AudioPlayerStatus.Playing, 5_000)
    await entersState(player, AudioPlayerStatus.Idle, 30_000)

    // Optional: Stay connected or disconnect immediately?
    // Usually better to stay for a bit, but for simplicity we disconnect after playing
    connection.destroy()
  } catch (error) {
    console.error('Error playing TTS:', error)
  }
}

async function pollQueue() {
  if (!QUEUE_URL) {
    console.error('QUEUE_URL NOT SET')
    return
  }

  try {
    const data = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20, // Long polling
      }),
    )

    if (data.Messages && data.Messages.length > 0) {
      const message = data.Messages[0]
      const body = JSON.parse(message.Body || '{}')

      console.log('Received task:', body)

      const { guildId, userId, text } = body

      // Verify connection to discord
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
        // Find the user's voice channel
        const member = await guild.members.fetch(userId).catch((err) => {
          console.error(`Error fetching member ${userId}:`, err)
          return null
        })

        if (member && member.voice.channelId) {
          console.log(`User ${userId} is in channel ${member.voice.channelId}`)
          await playTTS(member.voice.channelId, guild.id, text, guild.voiceAdapterCreator)
        } else {
          console.log(`User ${userId} not in voice channel (member found: ${!!member})`)
        }
      } else {
        console.log(`Guild ${guildId} not found even after fetch`)
      }

      // Delete message
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

  // Poll again immediately
  setImmediate(pollQueue)
}

// Start
;(async () => {
  try {
    const token = await getDiscordToken()
    await client.login(token)

    pollQueue()
  } catch (err) {
    console.error('Startup error:', err)
    process.exit(1)
  }
})()
