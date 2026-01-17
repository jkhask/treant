import { REST, Routes } from 'discord.js'
import 'dotenv/config'
// Usage: node register-commands.mjs

const commands = [
  {
    name: 'treant',
    description: 'Get a tree pun!',
  },
  {
    name: 'wow-token',
    description: 'Get the current WoW Token price (NA)',
  },
  {
    name: 'classic-ah',
    description: 'Get Classic AA Index for Dreamscythe',
  },
]

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)

try {
  console.log('Started refreshing application (/) commands.')

  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands })

  console.log('Successfully reloaded application (/) commands.')
} catch (error) {
  console.error(error)
}
