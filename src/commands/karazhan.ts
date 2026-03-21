import { InteractionResponseType } from 'discord-interactions'
import { editOriginalResponse } from '../lib/discord/response'
import { optimizeKarazhanRoster } from '../services/optimizer'
import { CommandPayload, sendCommandToQueue } from '../services/sqs'
import { DiscordInteraction } from '../types/discord'

// SYNC HANDLER: Called by API Gateway
// Returns DEFERRED response immediately and queues the work
export const handleKarazhanCommand = async (interaction: DiscordInteraction) => {
  try {
    // Push to SQS
    await sendCommandToQueue({
      command: 'karazhan',
      applicationId: interaction.application_id,
      interactionToken: interaction.token,
      options: [],
    })

    // Return "Thinking..." (Deferred)
    return {
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    }
  } catch (error) {
    console.error('Error queuing karazhan command:', error)
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
export const processKarazhanCommandAsync = async (payload: CommandPayload) => {
  const { applicationId, interactionToken } = payload

  try {
    console.log('Starting Karazhan roster optimization...')

    let aiAnalysis = ''
    try {
      aiAnalysis = await optimizeKarazhanRoster()
    } catch (aiErr) {
      console.error('Gemini Error', aiErr)
      aiAnalysis = '⚠️ AI Optimization timed out or failed.'
    }

    const embed: any = {
      title: '🗡️ Karazhan Roster Optimization',
      color: 0x9b59b6, // Purple
      description: aiAnalysis.length > 4096 ? aiAnalysis.substring(0, 4093) + '...' : aiAnalysis,
    }

    await editOriginalResponse(applicationId, interactionToken, { embeds: [embed] })
  } catch (error) {
    console.error('Error processing async karazhan command:', error)
    const errorMessage = `❌ **Error:** Failed to compute groups: ${error instanceof Error ? error.message : String(error)}`

    await editOriginalResponse(applicationId, interactionToken, { content: errorMessage })
  }
}
