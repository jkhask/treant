import { InteractionResponseType } from 'discord-interactions'
import {
  getBlizzardCredentials,
  getBlizzardToken,
  getCharacterEquipment,
} from '../services/blizzard'
import { DiscordCommandOption, DiscordInteraction } from '../types/discord'

export const handleJudgeCommand = async (
  subcommand: DiscordCommandOption,
  _interaction: DiscordInteraction,
) => {
  try {
    const options = subcommand.options
    const characterOption = options?.find((o) => o.name === 'character')
    const characterName = characterOption?.value as string

    if (!characterName) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ **Error:** Please provide a character name.',
        },
      }
    }

    const credentials = await getBlizzardCredentials()
    if (!credentials) {
      console.error('Blizzard credentials missing')
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ **Error:** Internal configuration error.',
        },
      }
    }

    const token = await getBlizzardToken(credentials.clientId, credentials.clientSecret)
    const equipment = await getCharacterEquipment(token, 'dreamscythe', characterName)

    const itemsList = equipment.equipped_items
      .map((item) => {
        return `**${item.slot.name}:** ${item.name}`
      })
      .join('\n')

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `⚖️ **Judgment for ${characterName} (Dreamscythe):**\n\n${itemsList}`,
      },
    }
  } catch (error) {
    console.error('Error fetching character equipment:', error)
    const isNotFound = error instanceof Error && error.message.includes('not found')
    const errorMessage = isNotFound
      ? `❌ **Error:** Character "${subcommand.options?.find((o) => o.name === 'character')?.value}" not found on Dreamscythe.`
      : `❌ **Error:** Failed to fetch character equipment: ${error instanceof Error ? error.message : String(error)}`

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: errorMessage,
      },
    }
  }
}
