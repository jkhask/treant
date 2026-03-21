import { GoogleGenerativeAI, SchemaType, FunctionDeclaration } from '@google/generative-ai'
import {
  getBlizzardCredentials,
  getBlizzardToken,
  getCharacterEquipment,
} from './blizzard'
import * as fs from 'fs'
import * as path from 'path'

// Assume process.env.GEMINI_API_KEY or process.env.GOOGLE_API_KEY is available in the lambda environment
const getApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY

const getCharacterGearDeclaration: FunctionDeclaration = {
  name: 'getCharacterGear',
  description:
    'Fetches the currently equipped gear for a given World of Warcraft character. Use this to determine if a character already possesses a Best-in-Slot (BIS) item so they do not need it anymore.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      characterName: {
        type: SchemaType.STRING,
        description: 'The name of the character (e.g., Rauun).',
      },
    },
    required: ['characterName'],
  },
}

const getBisListDeclaration: FunctionDeclaration = {
  name: 'getBisList',
  description:
    'Retrieves the Best-in-Slot (BIS) items from Karazhan for a specific class and specialization combination. Use this to understand what high-value items a character might compete for.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      className: {
        type: SchemaType.STRING,
        description: 'The class of the character (e.g., Priest, Druid, Warrior).',
      },
      specName: {
        type: SchemaType.STRING,
        description: 'The specialization of the character (e.g., Holy, Restoration, Protection).',
      },
    },
    required: ['className', 'specName'],
  },
}

const getBisList = async (className: string, specName: string) => {
  const dataPath = path.join(__dirname, '../data/bis_data.json')
  const bisData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
  const key = `${className}-${specName}`
  const items = bisData[key]
  if (items) {
    return items
  }
  return { error: `No BIS data found for ${className} ${specName}` }
}

const getCharacterGear = async (characterName: string) => {
  const realmSlug = 'dreamscythe'
  try {
    const creds = await getBlizzardCredentials()
    if (!creds) {
      return {
        error:
          'Could not fetch Blizzard credentials. Assume character has pre-raid gear and needs all BIS items.',
      }
    }
    const token = await getBlizzardToken(creds.clientId, creds.clientSecret)
    const equipment = await getCharacterEquipment(token, realmSlug, characterName)

    const equippedItems = equipment.equipped_items.map((item: any) => ({
      slot: item.slot.name,
      name: item.name,
    }))
    return { equippedItems }
  } catch (error: any) {
    console.warn(
      `WARNING: Could not fetch gear for ${characterName}-${realmSlug}: ${error.message}`,
    )
    return {
      error: `Character ${characterName} on ${realmSlug} not found or API failed. Assume they need all BIS items.`,
    }
  }
}

const functions: { [key: string]: (...args: any[]) => any } = {
  getCharacterGear,
  getBisList,
}

export const optimizeKarazhanRoster = async (): Promise<string> => {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API key (GEMINI_API_KEY or GOOGLE_API_KEY) is not set.')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    tools: [
      {
        functionDeclarations: [getCharacterGearDeclaration, getBisListDeclaration],
      },
    ],
  })

  const membersPath = path.join(__dirname, '../data/roster.json')
  const membersData = fs.readFileSync(membersPath, 'utf-8')

  const prompt = `
You are an expert World of Warcraft raid leader. I have a list of guild members who are attending Karazhan this week. I need to form 3 simultaneous 10-man raid groups from these 30 players.

Each Karazhan group ideally needs:
- 2 Tanks
- 1-2 Healers
- 5-7 DPS

Your primarily goal is to MINIMIZE loot competition for high-value Best-in-Slot (BIS) items within each group.
1. Use the 'getBisList' tool to figure out what items each class/spec wants from Karazhan.
2. Use the 'getCharacterGear' tool to check what gear players are CURRENTLY wearing. If they already have their BIS item from Karazhan, they won't compete for it!

Here is the list of 30 players in JSON format:
${membersData}

Please analyze the players, use the tools provided to assess their BIS needs and current gear, and then assign them to Group 1, Group 2, or Group 3.
Ensure that players who need the SAME highly contested item (such as Light's Justice, Nathrezim Mindblade, Dragonspine Trophy) are placed in DIFFERENT groups as much as possible.

Present your final output clearly, showing the 3 groups, their composition by role, and a brief explanation of the key loot-based decisions you made.
`

  const chat = model.startChat()
  let result = await chat.sendMessage(prompt)

  while (true) {
    const calls = result.response.functionCalls()
    if (!calls || calls.length === 0) {
      break
    }

    const functionResponses = []

    for (const call of calls) {
      const fn = functions[call.name]
      if (fn) {
        const apiResponse = await fn(...Object.values(call.args))
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: apiResponse,
          },
        })
      }
    }

    result = await chat.sendMessage(functionResponses)
  }

  return result.response.text()
}
