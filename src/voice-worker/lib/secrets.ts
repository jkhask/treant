import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

const DISCORD_TOKEN_SECRET = process.env.DISCORD_TOKEN_SECRET_NAME || 'DiscordToken'
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' })

export const getDiscordToken = async (): Promise<string> => {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: DISCORD_TOKEN_SECRET }),
  )
  if (!response.SecretString) throw new Error('SecretString is empty')
  try {
    const json = JSON.parse(response.SecretString)
    return json.DISCORD_TOKEN || json.token || response.SecretString
  } catch {
    return response.SecretString
  }
}
