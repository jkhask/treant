import { InteractionType } from 'discord-interactions'
import { handleGoldCommand } from './gold'
import { handleSpeakCommand } from './speak'
import { handlePunCommand } from './pun'

export const dispatchCommand = async (interaction: any) => {
  if (interaction.type !== InteractionType.APPLICATION_COMMAND) return null

  const { name } = interaction.data
  if (name !== 'treant') return null

  const subcommand = interaction.data.options?.[0]

  // Default to pun if no subcommand
  if (!subcommand || subcommand.name === 'pun') {
    return await handlePunCommand()
  }

  if (subcommand.name === 'gold') {
    return await handleGoldCommand(subcommand, interaction)
  }

  if (subcommand.name === 'speak') {
    return await handleSpeakCommand(subcommand, interaction)
  }

  return null
}
