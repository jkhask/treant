import { InteractionResponseType } from 'discord-interactions'
import { TREE_QUOTES } from '../constants/TREE_QUOTES'

export const handlePunCommand = async () => {
  const randomQuote = TREE_QUOTES[Math.floor(Math.random() * TREE_QUOTES.length)]
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `🌲 **Treant says:** ${randomQuote}`,
    },
  }
}
