import { REST, Routes } from 'discord.js'
import 'dotenv/config'
// Usage: node register-commands.mjs

const commands = [
  {
    name: 'treant',
    description: 'Treant commands',
    options: [
      {
        name: 'pun',
        description: 'Get a tree pun!',
        type: 1, // SUB_COMMAND
      },
      {
        name: 'gold',
        description: 'Get current G2G gold price',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'amount',
            description: 'Amount of gold to check price for (default 1000)',
            type: 4, // INTEGER
            required: false,
          },
        ],
      },
      {
        name: 'speak',
        description: 'Speak text in voice channel',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'text',
            description: 'Text to speak',
            type: 3, // STRING
            required: true,
          },
        ],
      },
    ],
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
