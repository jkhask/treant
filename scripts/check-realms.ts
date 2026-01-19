import 'dotenv/config'
import { getBlizzardCredentials, getBlizzardToken } from '../src/services/blizzard'

const checkRealms = async () => {
  try {
    console.log('Fetching credentials...')
    const creds = await getBlizzardCredentials()
    if (!creds) {
      console.error('No credentials found')
      return
    }

    console.log('Fetching token...')
    const token = await getBlizzardToken(creds.clientId, creds.clientSecret)

    const namespaces = ['dynamic-classic-us', 'dynamic-classic1x-us']
    const slugs = ['dreamscythe', 'dreamscythe-classic', 'nightslayer', 'doomhowl']

    for (const ns of namespaces) {
      console.log(`\n=== Checking namespace: ${ns} ===`)

      for (const slug of slugs) {
        const url = `https://us.api.blizzard.com/data/wow/realm/${slug}?namespace=${ns}&locale=en_US`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          console.log(`✅ FOUND ${slug} in ${ns}!`)
          const data = await res.json()
          // console.log(JSON.stringify(data, null, 2))
        } else {
          console.log(`❌ ${slug} in ${ns}: ${res.status} ${res.statusText}`)
        }
      }
    }
  } catch (e) {
    console.error(e)
  }
}

checkRealms()
