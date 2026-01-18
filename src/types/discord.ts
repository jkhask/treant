import { InteractionType } from 'discord-interactions'

export interface DiscordUser {
  id: string
  username: string
  discriminator: string
}

export interface DiscordGuildMember {
  user: DiscordUser
}

export interface DiscordCommandOption {
  name: string
  value?: string | number | boolean
  type: number
  options?: DiscordCommandOption[]
}

export interface DiscordInteractionData {
  id: string
  name: string
  options?: DiscordCommandOption[]
}

export interface DiscordInteraction {
  id: string
  application_id: string
  type: InteractionType
  data: DiscordInteractionData
  guild_id?: string
  channel_id?: string
  member?: DiscordGuildMember
  token: string
  version: number
}
