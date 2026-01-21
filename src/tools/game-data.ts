import {
  getBlizzardCredentials,
  getBlizzardToken,
  getCharacterEquipment,
} from '../services/blizzard'

interface ActionGroupEvent {
  messageVersion: string
  agent: {
    name: string
    id: string
    alias: string
    version: string
  }
  inputText: string
  sessionId: string
  actionGroup: string
  function: string
  parameters: {
    name: string
    type: string
    value: string
  }[]
}

interface ActionGroupResponse {
  messageVersion: string
  response: {
    actionGroup: string
    function: string
    functionResponse: {
      responseBody: {
        TEXT: {
          body: string
        }
      }
    }
  }
}

export const handler = async (event: ActionGroupEvent): Promise<ActionGroupResponse> => {
  console.log('Received event:', JSON.stringify(event, null, 2))

  const actionGroup = event.actionGroup
  const functionName = event.function
  const parameters = event.parameters || []

  // Helper to get param value
  const getParam = (name: string): string | undefined => {
    return parameters.find((p) => p.name === name)?.value
  }

  let responseBody = ''

  try {
    if (functionName === 'get_character_equipment') {
      const characterName = getParam('character')
      const realm = getParam('realm') || 'dreamscythe'
      // region is currently hardcoded to 'us' in blizzard service, but we could pass it if needed

      if (!characterName) {
        throw new Error('Character name is required')
      }

      console.log(`Fetching equipment for ${characterName} on ${realm}`)

      const credentials = await getBlizzardCredentials()
      if (!credentials) throw new Error('Blizzard credentials missing')

      const token = await getBlizzardToken(credentials.clientId, credentials.clientSecret)
      const equipment = await getCharacterEquipment(token, realm, characterName)

      // Format simple list for the agent
      const itemList = equipment.equipped_items
        .map(
          (item) =>
            `- [${item.slot.name}]: ${item.name} (Quality: ${item.quality.name}, ID: ${item.item.id})`,
        )
        .join('\n')

      responseBody = JSON.stringify({
        character: characterName,
        realm: realm,
        equipment_list: itemList,
      })
    } else {
      throw new Error(`Unknown function: ${functionName}`)
    }
  } catch (error) {
    console.error('Tool execution failed:', error)
    responseBody = `Error: ${error instanceof Error ? error.message : String(error)}`
  }

  const response: ActionGroupResponse = {
    messageVersion: event.messageVersion,
    response: {
      actionGroup,
      function: functionName,
      functionResponse: {
        responseBody: {
          TEXT: {
            body: responseBody,
          },
        },
      },
    },
  }

  console.log('Sending response:', JSON.stringify(response, null, 2))
  return response
}
