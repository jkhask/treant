import { InteractionResponseType } from 'discord-interactions'
import {
  getBlizzardCredentials,
  getBlizzardToken,
  getCharacterEquipment,
} from '../services/blizzard'
import { analyzeGear } from '../services/gemini'
import { CommandPayload, sendCommandToQueue } from '../services/sqs'
import { DiscordCommandOption, DiscordInteraction } from '../types/discord'

// SYNC HANDLER: Called by API Gateway
// Returns DEFERRED response immediately and queues the work
export const handleJudgeCommand = async (
  subcommand: DiscordCommandOption,
  interaction: DiscordInteraction,
) => {
  try {
    const characterOption = subcommand.options?.find((o) => o.name === 'character')
    const characterName = characterOption?.value as string

    if (!characterName) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ **Error:** Please provide a character name.',
        },
      }
    }

    // Push to SQS
    await sendCommandToQueue({
      command: 'judge',
      applicationId: interaction.application_id,
      interactionToken: interaction.token,
      options: subcommand.options || [],
    })

    // Return "Thinking..." (Deferred)
    return {
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    }
  } catch (error) {
    console.error('Error queuing judge command:', error)
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ **Error:** Failed to queue command.',
      },
    }
  }
}

// ASYNC HANDLER: Called by SQS Trigger
// Performs the actual work and edits the original message
export const processJudgeCommandAsync = async (payload: CommandPayload) => {
  const { applicationId, interactionToken, options } = payload
  const characterOption = options.find((o: any) => o.name === 'character')
  const characterName = characterOption?.value as string

  try {
    console.log('Fetching Blizzard credentials...')
    const credentials = await getBlizzardCredentials()
    if (!credentials) throw new Error('Blizzard credentials missing')

    console.log('Fetched credentials. Fetching token...')
    const token = await getBlizzardToken(credentials.clientId, credentials.clientSecret)

    console.log(`Fetched token. Fetching equipment for ${characterName}...`)
    const equipment = await getCharacterEquipment(token, 'dreamscythe', characterName)
    console.log('Equipment received. Count:', equipment.equipped_items.length)

    const itemsList = equipment.equipped_items
      .map((item) => {
        // Use < > to suppress embeds
        const itemLink = `[${item.name}](<https://www.wowhead.com/classic/item=${item.item.id}>)`
        return `**${item.slot.name}:** ${itemLink}`
      })
      .join('\n')

    console.log('Formatted items list.')

    // Gemini Analysis
    let aiAnalysis = ''
    try {
      aiAnalysis = await analyzeGear(characterName, equipment.equipped_items)
    } catch (aiErr) {
      console.error('Gemini Error', aiErr)
      aiAnalysis = '⚠️ AI Analysis timed out or failed.'
    }

    // Construct Embed
    const embed: any = {
      title: `⚖️ Judgment for ${characterName} (Dreamscythe)`,
      color: 0xffd700, // Gold color
      description: itemsList, // Limit: 4096 chars
      fields: [],
    }

    if (aiAnalysis) {
      // Field value limit is 1024 characters
      if (aiAnalysis.length > 1024) {
        embed.fields.push({
          name: '🔮 AI Analysis',
          value: aiAnalysis.substring(0, 1021) + '...',
        })
      } else {
        embed.fields.push({
          name: '🔮 AI Analysis',
          value: aiAnalysis,
        })
      }
    }

    await editOriginalResponse(applicationId, interactionToken, { embeds: [embed] })
  } catch (error) {
    console.error('Error processing async judge command:', error)
    const isNotFound = error instanceof Error && error.message.includes('not found')
    const errorMessage = isNotFound
      ? `❌ **Error:** Character "${characterName}" not found on Dreamscythe.`
      : `❌ **Error:** Failed to fetch character equipment: ${error instanceof Error ? error.message : String(error)}`

    await editOriginalResponse(applicationId, interactionToken, { content: errorMessage })
  }
}

const editOriginalResponse = async (
  applicationId: string,
  token: string,
  payload: { content?: string; embeds?: any[] },
) => {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`
  console.log('Sending response to Discord...')
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    console.log(`Discord response status: ${response.status}`)
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Discord Error Body:', errorText)
    }
  } catch (error) {
    console.error('Failed to send response to Discord:', error)
  }
}
