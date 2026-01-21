import { InteractionResponseType } from 'discord-interactions'
import {
  getBlizzardCredentials,
  getBlizzardToken,
  getCharacterEquipment,
} from '../services/blizzard'
import { analyzeGear } from '../services/bedrock'
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
        return `**${item.slot.name}:** ${item.name}`
      })
      .join('\n')

    console.log('Formatted items list.')

    const baseMessage = `⚖️ **Judgment for ${characterName} (Dreamscythe):**\n\n${itemsList}`

    // Gemini Analysis
    let aiAnalysis = ''
    try {
      aiAnalysis = await analyzeGear(characterName, equipment.equipped_items)
    } catch (aiErr) {
      console.error('Gemini Error', aiErr)
      aiAnalysis = '\n\n⚠️ AI Analysis timed out or failed.'
    }

    const finalContent = `${baseMessage}\n\n${aiAnalysis}`

    // Check for length limit (2000 characters)
    if (finalContent.length > 2000) {
      console.warn(`Message too long (${finalContent.length}). Truncating...`)
      const availableSpace = 2000 - baseMessage.length - 20 // 20 chars buffer for newline and suffix
      if (availableSpace > 0) {
        aiAnalysis = aiAnalysis.substring(0, availableSpace) + '... (truncated)'
      } else {
        // Edge case: Base message itself is too long (unlikely with just gear list, but possible if user has massive names?)
        aiAnalysis = ''
        console.error('Base message too long, omitting AI analysis.')
      }
    }

    const truncatedContent = `${baseMessage}\n\n${aiAnalysis}`
    await editOriginalResponse(applicationId, interactionToken, truncatedContent)
  } catch (error) {
    console.error('Error processing async judge command:', error)
    const isNotFound = error instanceof Error && error.message.includes('not found')
    const errorMessage = isNotFound
      ? `❌ **Error:** Character "${characterName}" not found on Dreamscythe.`
      : `❌ **Error:** Failed to fetch character equipment: ${error instanceof Error ? error.message : String(error)}`

    await editOriginalResponse(applicationId, interactionToken, errorMessage)
  }
}

const editOriginalResponse = async (applicationId: string, token: string, content: string) => {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`
  console.log('Sending response to Discord...')
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: content,
      }),
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
