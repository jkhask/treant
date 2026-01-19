import { SecretsManagerClient, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation'
import 'dotenv/config'

const STACK_NAME = 'TreantStack'

;(async () => {
  try {
    const cfClient = new CloudFormationClient({})
    console.log(`Fetching Stack Outputs from: ${STACK_NAME}...`)
    const stackResponse = await cfClient.send(new DescribeStacksCommand({ StackName: STACK_NAME }))

    const stacks = stackResponse.Stacks
    if (!stacks || stacks.length === 0) {
      throw new Error(`Stack ${STACK_NAME} not found`)
    }
    const outputs = stacks[0].Outputs || []
    const smClient = new SecretsManagerClient({})

    // 1. Update Discord Public Key
    const discordPublicKey = process.env.DISCORD_PUBLIC_KEY
    if (discordPublicKey) {
      console.log('Found DISCORD_PUBLIC_KEY in .env, updating secret...')

      const discordOutput = outputs.find((o) => o.OutputKey && o.OutputKey.startsWith('SecretName'))

      if (discordOutput && discordOutput.OutputValue) {
        const secretName = discordOutput.OutputValue
        await smClient.send(
          new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: discordPublicKey,
          }),
        )
        console.log(`✅ Successfully updated Discord Public Key (${secretName})`)
      } else {
        console.warn('⚠️ Could not find SecretName output for Discord Key in CloudFormation stack')
      }
    } else {
      console.log('ℹ️ DISCORD_PUBLIC_KEY not in .env, skipping.')
    }

    // 2. Update Blizzard Credentials
    const clientId = process.env.BLIZZARD_CLIENT_ID
    const clientSecret = process.env.BLIZZARD_CLIENT_SECRET

    if (clientId && clientSecret) {
      console.log('Found BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET in .env, updating secret...')

      const blizzardOutput = outputs.find(
        (o) => o.OutputKey && o.OutputKey.startsWith('BlizzardSecretName'),
      )

      if (blizzardOutput && blizzardOutput.OutputValue) {
        const secretName = blizzardOutput.OutputValue
        await smClient.send(
          new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: JSON.stringify({ clientId, clientSecret }),
          }),
        )
        console.log(`✅ Successfully updated Blizzard Credentials (${secretName})`)
      } else {
        console.warn('⚠️ Could not find BlizzardSecretName output in CloudFormation stack')
      }
    } else {
      console.log('ℹ️ BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET not in .env, skipping.')
    }

    // 3. Update Google API Key
    const googleApiKey = process.env.GOOGLE_API_KEY
    if (googleApiKey) {
      console.log('Found GOOGLE_API_KEY in .env, updating secret...')

      const googleOutput = outputs.find(
        (o) => o.OutputKey && o.OutputKey.startsWith('GoogleApiKeySecretName'),
      )

      if (googleOutput && googleOutput.OutputValue) {
        const secretName = googleOutput.OutputValue
        await smClient.send(
          new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: googleApiKey,
          }),
        )
        console.log(`✅ Successfully updated Google API Key (${secretName})`)
      } else {
        console.warn('⚠️ Could not find GoogleApiKeySecretName output in CloudFormation stack')
      }
    } else {
      console.log('ℹ️ GOOGLE_API_KEY not in .env, skipping.')
    }
  } catch (error) {
    console.error('❌ Error updating secrets:', error)
    process.exit(1)
  }
})()
