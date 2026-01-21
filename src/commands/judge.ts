import { InteractionResponseType } from 'discord-interactions'
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

  const realmOption = options.find((o: any) => o.name === 'realm')
  const realm = (realmOption?.value as string) || 'dreamscythe'

  try {
    console.log(`Starting judgement for ${characterName} on ${realm}...`)

    const baseMessage = `⚖️ **Judgment for ${characterName}:**\n\n`

    // Bedrock Agent Analysis (Auto-fetches gear via tools)
    let aiAnalysis = ''
    try {
      aiAnalysis = await analyzeGear(characterName, realm)
    } catch (aiErr) {
      console.error('Bedrock Agent Error', aiErr)
      aiAnalysis = '⚠️ AI Analysis timed out or failed.'
    }

    const finalContent = `${baseMessage}${aiAnalysis}`

    // Check for length limit (2000 characters)
    let contentToSend = finalContent
    if (finalContent.length > 2000) {
      console.warn(`Message too long (${finalContent.length}). Truncating...`)
      contentToSend = finalContent.substring(0, 1990) + '... (truncated)'
    }

    await editOriginalResponse(applicationId, interactionToken, contentToSend)
  } catch (error) {
    console.error('Error processing async judge command:', error)
    const errorMessage = `❌ **Error:** Judge command failed: ${error instanceof Error ? error.message : String(error)}`
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
    // Don't throw here to avoid SQS retry loops if it's just a network blip writing the response
  }
}
