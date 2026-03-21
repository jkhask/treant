import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

config({ path: path.join(__dirname, '../../.env') })

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
if (!apiKey) {
  console.error('API key (GEMINI_API_KEY or GOOGLE_API_KEY) is not set.')
  process.exit(1)
}

const genAI = new GoogleGenerativeAI(apiKey)
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-pro',
  generationConfig: {
    responseMimeType: 'application/json',
  },
})

const getPrompt = (classes: string) => `
You are an expert World of Warcraft TBC Classic theorycrafter. 
Output a JSON object containing the universally accepted Phase 1 Best-in-Slot (BIS) gear for Karazhan/Gruul/Magtheridon for EVERY single specialization of the following classes:
${classes}

The JSON structure MUST map exactly like this:
{
  "ClassName": {
    "SpecName": {
      "Head": "Item Name",
      "Neck": "Item Name",
      "Shoulder": "Item Name",
      "Back": "Item Name",
      "Chest": "Item Name",
      "Wrist": "Item Name",
      "Hands": "Item Name",
      "Waist": "Item Name",
      "Legs": "Item Name",
      "Feet": "Item Name",
      "Ring 1": "Item Name",
      "Ring 2": "Item Name",
      "Trinket 1": "Item Name",
      "Trinket 2": "Item Name",
      "Main Hand": "Item Name",
      "Off Hand": "Item Name",
      "Ranged": "Item Name"
    }
  }
}

Make sure you output the raw JSON object and nothing else. Ensure your answers are highly accurate for TBC Phase 1 BIS items (e.g., Light's Justice, Nathrezim Mindblade, Spiteblade, Dragonspine Trophy, T4 pieces, etc.).
`

const chunks = [
  '- Warrior (Protection, Fury, Arms)\n- Paladin (Holy, Protection, Retribution)\n- Hunter (Beast Mastery, Survival, Marksmanship)',
  '- Rogue (Combat, Assassination)\n- Priest (Holy, Shadow)\n- Shaman (Restoration, Enhancement, Elemental)',
  '- Mage (Frost, Fire, Arcane)\n- Warlock (Affliction, Demonology, Destruction)\n- Druid (Feral, Restoration, Balance)'
]

const run = async () => {
  const flattened: Record<string, any> = {}
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(\`Requesting Phase 1 BIS JSON chunk \${i + 1}/3...\`)
    const prompt = getPrompt(chunks[i])
    const result = await model.generateContent(prompt)
    const jsonText = result.response.text()

    // Verify it's valid JSON
    let chunkData;
    try {
      const cleanedJson = jsonText.replace(/^\`\`\`json\n/, '').replace(/\n\`\`\`$/, '')
      chunkData = JSON.parse(cleanedJson)
    } catch (e) {
      console.error('Failed to parse JSON for chunk', i + 1, 'response was:', jsonText)
      throw e
    }

    // Flatten
    for (const className of Object.keys(chunkData)) {
      for (const specName of Object.keys(chunkData[className])) {
        flattened[\`\${className}-\${specName}\`] = chunkData[className][specName]
      }
    }
  }

  const outputPath = path.join(__dirname, '../data/bis_data.json')
  fs.writeFileSync(outputPath, JSON.stringify(flattened, null, 2))
  console.log(\`Successfully generated BIS data and wrote to \${outputPath}\`)
}

run().catch((error) => {
  console.error('Failed to generate BIS data:', error)
  process.exit(1)
})
