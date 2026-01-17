import { REST, Routes } from 'discord.js'
import 'dotenv/config'
// Usage: node register-commands.js

const commands = [
  {
    name: 'treant',
    description: 'Get a funny tree-related quote!',
  },
  {
    name: 'wow-token',
    description: 'Get current WoW Token price',
  },
]

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)

;(async () => {
  try {
    console.log('Started refreshing application (/) commands.')

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands })

    console.log('Successfully reloaded application (/) commands.')
  } catch (error) {
    console.error(error)
  }
})()
