import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime'

const client = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION })

export const analyzeGear = async (characterName: string, realm: string): Promise<string> => {
  const agentId = process.env.BEDROCK_AGENT_ID
  const agentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID

  if (!agentId || !agentAliasId) {
    console.error('Bedrock Agent ID or Alias ID not set')
    return '❌ AI Analysis Unavailable: Configuration missing.'
  }

  const prompt = `Please judge the gear for the character "${characterName}" on realm "${realm}".
First, YOU MUST list the visible equipment you find. Format each item as a Markdown link to WowHead Classic: [Item Name](https://www.wowhead.com/classic/item=ITEM_ID).
Then, provide:
- Estimated Average Item Level
- Quality Analysis
- Upgrade Suggestions
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
      enableTrace: false,
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
    return `❌ AI Analysis Failed: ${error instanceof Error ? error.message : String(error)}`
  }
}
