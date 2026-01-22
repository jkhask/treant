import { InteractionResponseType } from 'discord-interactions'
import { getG2GGoldPrice } from '../services/g2g'
import { recordGoldPrice, getGoldPriceHistory } from '../db/price-history'
import { generateGoldChartUrl } from '../lib/chart'
import { sendCommandToQueue, sendVoiceCommand } from '../services/sqs'
import { DiscordCommandOption, DiscordInteraction } from '../types/discord'
import { editOriginalResponse } from '../lib/discord/response'

export const handleGoldCommand = async (
  subcommand: DiscordCommandOption,
  interaction: DiscordInteraction,
) => {
  try {
    // Push to SQS
    await sendCommandToQueue({
      command: 'gold',
      applicationId: interaction.application_id,
      interactionToken: interaction.token,
      guildId: interaction.guild_id,
      userId: interaction.member?.user?.id,
      options: subcommand.options || [],
    })

    return {
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    }
  } catch (error) {
    console.error('Error queuing gold command:', error)
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `❌ **Error:** Failed to queue gold command.`,
      },
    }
  }
}

export const processGoldCommandAsync = async (payload: any) => {
  const { applicationId, interactionToken, options } = payload
  const amountOption = options?.find((o: any) => o.name === 'amount')
  const amount = (amountOption?.value as number) || 1000

  try {
    const unitPrice = await getG2GGoldPrice()
    const totalPrice = (unitPrice * amount).toFixed(2)

    // Record price asynchronously
    await recordGoldPrice(unitPrice)

    // Generate Chart
    const history = await getGoldPriceHistory(24)
    const chartUrl = generateGoldChartUrl(history, amount)

    // Send to Voice Worker
    const { guildId, userId } = payload
    if (guildId && userId) {
      const voiceText = `The current gold price is ${unitPrice.toFixed(
        4,
      )} per gold. For ${amount.toLocaleString()} gold, it will cost ${totalPrice} dollars.`

      await sendVoiceCommand(guildId, userId, voiceText).catch((err) =>
        console.error('Failed to send gold voice command:', err),
      )
    }

    await editOriginalResponse(applicationId, interactionToken, {
      content: `💰 **Kang17 Gold Price:** $${totalPrice} for ${amount.toLocaleString()} gold ($${unitPrice.toFixed(
        4,
      )}/gold)`,
      embeds: [
        {
          image: {
            url: chartUrl,
          },
        },
      ],
    })
  } catch (error) {
    console.error('Error processing async gold command:', error)
    await editOriginalResponse(applicationId, interactionToken, {
      content: `❌ **Error:** Failed to fetch gold price.`,
    })
  }
}
