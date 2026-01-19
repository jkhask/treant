import 'dotenv/config'
import { getBlizzardCredentials, getBlizzardToken } from '../src/services/blizzard'

const checkCharacter = async () => {
  try {
    console.log('Fetching credentials...')
    const creds = await getBlizzardCredentials()
    if (!creds) {
      console.error('No credentials found')
      return
    }

    console.log('Fetching token...')
    const token = await getBlizzardToken(creds.clientId, creds.clientSecret)

    const realm = 'dreamscythe'
    const character = 'owlminus'
    const namespaces = ['profile-classic-us', 'profile-classic1x-us']

    for (const ns of namespaces) {
      console.log(`\n=== Checking namespace: ${ns} ===`)
      const url = `https://us.api.blizzard.com/profile/wow/character/${realm}/${character}/equipment?namespace=${ns}&locale=en_US`

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      console.log(`Status: ${res.status} ${res.statusText}`)
      if (res.ok) {
        console.log('✅ SUCCESS!')
        const data = await res.json()
        console.log(`Equipped items count: ${(data as any).equipped_items?.length}`)
      } else {
        console.log('❌ Failed')
      }
    }
  } catch (e) {
    console.error(e)
  }
}

checkCharacter()
