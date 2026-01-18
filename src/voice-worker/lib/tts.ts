import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly'
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} from '@discordjs/voice'
import { InternalDiscordGatewayAdapterCreator } from 'discord.js'
import { Readable } from 'stream'

const polly = new PollyClient({ region: process.env.AWS_REGION || 'us-east-1' })

export const playTTS = async (
  channelId: string,
  guildId: string,
  text: string,
  adapterCreator: InternalDiscordGatewayAdapterCreator,
) => {
  try {
    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator,
      selfDeaf: false,
    })

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000)

    const command = new SynthesizeSpeechCommand({
      Text: `<speak><prosody rate="slow" pitch="x-low">${text}</prosody></speak>`,
      OutputFormat: 'mp3',
      VoiceId: 'Brian',
      Engine: 'neural',
      TextType: 'ssml',
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

    connection.destroy()
  } catch (error) {
    console.error('Error playing TTS:', error)
  }
}
