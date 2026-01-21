import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime'
import { EquippedItem } from './blizzard'

const client = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION })

export const analyzeGear = async (
  characterName: string,
  items: EquippedItem[],
): Promise<string> => {
  const agentId = process.env.BEDROCK_AGENT_ID
  const agentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID

  if (!agentId || !agentAliasId) {
    console.error('Bedrock Agent ID or Alias ID not set')
    return '❌ AI Analysis Unavailable: Configuration missing.'
  }

  const itemListString = items
    .map((item) => `- [${item.slot.name}]: ${item.name} (${item.quality.name})`)
    .join('\n')

  const prompt = `Character: ${characterName}
Equipped Gear:
${itemListString}
`

  // Session ID must be alphanumeric/underscores/hyphens, max 100 chars
  // sanitize character name
  const sessionId = `judge-${characterName.replace(/[^a-zA-Z0-9]/g, '_')}`.slice(0, 99)

  try {
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: prompt,
    })

    const response = await client.send(command)

    let completion = ''

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk && event.chunk.bytes) {
          completion += new TextDecoder('utf-8').decode(event.chunk.bytes)
        }
      }
    }

    return completion
  } catch (error) {
    console.error('Bedrock Agent invocation failed:', error)
    return '❌ AI Analysis Failed.'
  }
}
