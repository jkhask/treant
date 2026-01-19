import { InteractionType } from 'discord-interactions'
import { handleGoldCommand } from './gold'
import { handleSpeakCommand } from './speak'
import { handlePunCommand } from './pun'
import { handleJudgeCommand } from './judge'
import { DiscordInteraction } from '../types/discord'

export const dispatchCommand = async (interaction: DiscordInteraction) => {
  if (interaction.type !== InteractionType.APPLICATION_COMMAND) return null

  const { name } = interaction.data
  if (name !== 'treant') return null

  if (!process.env.DISCORD_PUBLIC_KEY_SECRET_NAME) return null // Quick exit if env not set, though handler checks this too

  // Explicit check for options existence
  const subcommand = interaction.data.options?.[0]

  // Default to pun if no subcommand
  if (!subcommand || subcommand.name === 'pun') {
    return await handlePunCommand(interaction)
  }

  if (subcommand.name === 'gold') {
    return await handleGoldCommand(subcommand, interaction)
  }

  if (subcommand.name === 'speak') {
    return await handleSpeakCommand(subcommand, interaction)
  }

  if (subcommand.name === 'judge') {
    return await handleJudgeCommand(subcommand, interaction)
  }

  return null
}
