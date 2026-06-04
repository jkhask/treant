import { InteractionResponseType } from 'discord-interactions'
import { DiscordCommandOption, DiscordInteraction } from '../types/discord'
import { editOriginalResponse } from '../lib/discord/response'
import { sendCommandToQueue, CommandPayload } from '../services/sqs'
import { getBlizzardCredentials, getBlizzardToken, getCharacterProfileSummary } from '../services/blizzard'
import { getWarcraftLogsCredentials, getWarcraftLogsToken, getCharacterParses } from '../services/warcraftlogs'
// SYNC HANDLER: Called by API Gateway
// Returns DEFERRED response immediately and queues the work
export const handleAnalyzeCommand = async (
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
      command: 'analyze',
      applicationId: interaction.application_id,
      interactionToken: interaction.token,
      options: subcommand.options || [],
    })

    // Return "Thinking..." (Deferred)
    return {
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    }
  } catch (error) {
    console.error('Error queuing analyze command:', error)
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
export const processAnalyzeCommandAsync = async (payload: CommandPayload) => {
  const { applicationId, interactionToken, options } = payload
  const characterOption = options.find((o: any) => o.name === 'character')
  const characterName = characterOption?.value as string

  if (!characterName) {
    await editOriginalResponse(applicationId, interactionToken, {
      content: '❌ **Error:** Character name not found in options.',
    })
    return
  }

  try {
    console.log('Fetching Blizzard and WCL credentials...')
    const [blizzardCreds, wclCreds] = await Promise.all([
      getBlizzardCredentials(),
      getWarcraftLogsCredentials()
    ])
    
    if (!blizzardCreds) throw new Error('Blizzard credentials missing')

    console.log('Fetched credentials. Fetching tokens...')
    const tokenPromises = [
      getBlizzardToken(blizzardCreds.clientId, blizzardCreds.clientSecret)
    ]
    if (wclCreds) {
      tokenPromises.push(getWarcraftLogsToken(wclCreds.clientId, wclCreds.clientSecret))
    }

    const tokens = await Promise.all(tokenPromises)
    const blizzardToken = tokens[0]
    const wclToken = wclCreds ? tokens[1] : null

    console.log(`Fetched tokens. Fetching profile summary and parses for ${characterName}...`)
    const fetchPromises: Promise<any>[] = [
      getCharacterProfileSummary(blizzardToken, 'dreamscythe', characterName)
    ]
    if (wclToken) {
      fetchPromises.push(getCharacterParses(wclToken, 'dreamscythe', characterName))
    }

    const fetchResults = await Promise.allSettled(fetchPromises)
    
    const profileResult = fetchResults[0]
    if (profileResult.status === 'rejected') {
      throw profileResult.reason
    }
    const profile = profileResult.value
    
    const parsesResult = wclToken && fetchResults.length > 1 ? fetchResults[1] : null
    const parses = parsesResult?.status === 'fulfilled' ? parsesResult.value : null
    
    // Build Embed
    const level = profile.level
    const raceName = profile.race?.name
    const className = profile.character_class?.name
    const guildName = profile.guild?.name
    const avgItemLevel = profile.average_item_level
    const equippedItemLevel = profile.equipped_item_level

    const title = `${profile.name} - Level ${level} ${raceName} ${className}`
    const ifLink = `https://ironforge.pro/anniversary/player/Dreamscythe/${characterName.toLowerCase()}`

    const embed: any = {
      title,
      url: ifLink,
      color: 0x3498db,
      fields: [],
    }

    if (guildName) {
      embed.description = `**Guild:** \<${guildName}\>`
    }

    if (avgItemLevel || equippedItemLevel) {
      embed.fields.push({
        name: '📈 Item Level',
        value: `${equippedItemLevel || avgItemLevel || '?'}`,
        inline: true,
      })
    }

    if (parses && parses.length > 0) {
      for (const zone of parses) {
        let valueStr = ''
        if (typeof zone.dpsParse === 'number' && zone.dpsParse > 0) {
          valueStr += `⚔️ DPS: ${zone.dpsParse.toFixed(1)}\n`
        }
        if (typeof zone.hpsParse === 'number' && zone.hpsParse > 0) {
          valueStr += `💚 HPS: ${zone.hpsParse.toFixed(1)}\n`
        }
        if (typeof zone.tankParse === 'number' && zone.tankParse > 0) {
          valueStr += `🛡️ Tank: ${zone.tankParse.toFixed(1)}\n`
        }
        if (valueStr.length > 0) {
          embed.fields.push({
            name: `📊 ${zone.name} Parses`,
            value: valueStr.trim(),
            inline: true,
          })
        }
      }
    }

    await editOriginalResponse(applicationId, interactionToken, { embeds: [embed] })
  } catch (error) {
    console.error('Error processing async analyze command:', error)
    const isNotFound = error instanceof Error && error.message.includes('not found')
    const errorMessage = isNotFound
      ? `❌ **Error:** Character "${characterName}" not found on Dreamscythe.`
      : `❌ **Error:** Failed to fetch character data: ${error instanceof Error ? error.message : String(error)}`

    await editOriginalResponse(applicationId, interactionToken, { content: errorMessage })
  }
}
