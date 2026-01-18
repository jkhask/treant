import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { verifyKey } from 'discord-interactions'
import { secretsClient } from '../../clients'

const SECRET_NAME = process.env.DISCORD_PUBLIC_KEY_SECRET_NAME
let cachedPublicKey: string | undefined

export const getPublicKey = async () => {
  if (cachedPublicKey) return cachedPublicKey
  if (!SECRET_NAME) throw new Error('Secret name not defined')
  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }))
  if (!response.SecretString) throw new Error('Could not retrieve public key from secrets manager')
  cachedPublicKey = response.SecretString
  return cachedPublicKey
}

export const verifyDiscordSignature = async (
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string,
) => {
  return await verifyKey(body, signature, timestamp, publicKey)
}
