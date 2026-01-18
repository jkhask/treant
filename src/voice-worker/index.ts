import { Client, GatewayIntentBits } from 'discord.js'
import { getDiscordToken } from './lib/secrets'
import { pollQueue } from './lib/queue'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
})

client.on('ready', () => {
  console.log(`Logged in as ${client.user?.tag}!`)
  console.log(`Bot is in ${client.guilds.cache.size} guilds:`)
  client.guilds.cache.forEach((g) => console.log(` - ${g.name} (${g.id})`))

  // Start polling when client is ready
  pollQueue(client)
})
;(async () => {
  try {
    const token = await getDiscordToken()
    await client.login(token)
  } catch (err) {
    console.error('Startup error:', err)
    process.exit(1)
  }
})()
