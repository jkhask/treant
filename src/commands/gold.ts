import { InteractionResponseType } from 'discord-interactions'
import { getG2GGoldPrice } from '../services/g2g'
import { recordGoldPrice, getGoldPriceHistory } from '../db/price-history'
import { generateGoldChartUrl } from '../lib/chart'
import { sendVoiceCommand } from '../services/sqs'
import { DiscordCommandOption, DiscordInteraction } from '../types/discord'

export const handleGoldCommand = async (
  subcommand: DiscordCommandOption,
  interaction: DiscordInteraction,
) => {
  try {
    // Check for amount option
    const options = subcommand.options
    const amountOption = options?.find((o) => o.name === 'amount')
    const amount = (amountOption?.value as number) || 1000

    const unitPrice = await getG2GGoldPrice()
    const totalPrice = (unitPrice * amount).toFixed(2)

    // Record price asynchronously (don't block response but ensure it fires)
    await recordGoldPrice(unitPrice)

    // Generate Chart
    const history = await getGoldPriceHistory(24) // Last 24 records (12 hours if every 30 mins)
    const chartUrl = generateGoldChartUrl(history, amount)

    // Send to Voice Worker
    const guildId = interaction.guild_id
    const userId = interaction.member?.user?.id
    if (guildId && userId) {
      const voiceText = `The current gold price is ${unitPrice.toFixed(
        4,
      )} per gold. For ${amount.toLocaleString()} gold, it will cost ${totalPrice} dollars.`
      await sendVoiceCommand(guildId, userId, voiceText).catch((err) =>
        console.error('Failed to send gold voice command:', err),
      )
    }

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
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
      },
    }
  } catch (error) {
    console.error('Error fetching G2G price:', error)
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `❌ **Error:** Failed to fetch G2G gold price.`,
      },
    }
  }
}
