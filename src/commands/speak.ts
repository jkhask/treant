import { InteractionResponseType } from 'discord-interactions'
import { sendVoiceCommand } from '../services/sqs'

import { DiscordCommandOption, DiscordInteraction } from '../types/discord'

export const handleSpeakCommand = async (
  subcommand: DiscordCommandOption,
  interaction: DiscordInteraction,
) => {
  const textOption = subcommand.options?.find((o) => o.name === 'text')
  const text = textOption?.value as string
  const guildId = interaction.guild_id
  const userId = interaction.member?.user?.id

  if (!text || !guildId || !userId) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `❌ **Error:** Missing required information (text: ${!!text}, guild: ${!!guildId}, user: ${!!userId})`,
      },
    }
  }

  try {
    await sendVoiceCommand(guildId, userId, text)
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `🗣️ **Treant says:** "${text}" (queued for voice worker)`,
      },
    }
  } catch (error) {
    console.error('Error queuing voice command:', error)
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `❌ **Error:** Failed to queue voice command.`,
      },
    }
  }
}
