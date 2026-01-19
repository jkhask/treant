import { InteractionResponseType } from 'discord-interactions'
import { TREE_QUOTES } from '../constants/TREE_QUOTES'
import { sendVoiceCommand } from '../services/sqs'
import { DiscordInteraction } from '../types/discord'

export const handlePunCommand = async (interaction: DiscordInteraction) => {
  const randomQuote = TREE_QUOTES[Math.floor(Math.random() * TREE_QUOTES.length)]

  // Send to Voice Worker
  const guildId = interaction.guild_id
  const userId = interaction.member?.user?.id

  if (guildId && userId) {
    await sendVoiceCommand(guildId, userId, randomQuote).catch((err) =>
      console.error('Failed to send pun voice command:', err),
    )
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `🌲 **Treant says:** ${randomQuote}`,
    },
  }
}
