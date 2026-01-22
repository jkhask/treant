import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { VoiceWorker } from './constructs/voice-worker'
import { DiscordBot } from './constructs/discord-bot'

export class TreantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // --- Shared Resources ---

    // Discord Public Key Secret
    const discordPublicKey = new cdk.aws_secretsmanager.Secret(this, 'DiscordPublicKeySecret', {
      description: 'The Public Key for the Discord Application',
    })

    // Blizzard Credentials Secret
    const blizzardCredentials = new cdk.aws_secretsmanager.Secret(
      this,
      'BlizzardCredentialsSecret',
      {
        description: 'Client ID and Secret for Blizzard API',
      },
    )

    // Google API Key Secret
    const googleApiKey = new cdk.aws_secretsmanager.Secret(this, 'GoogleApiKeySecret', {
      description: 'API Key for Google Gemini',
    })

    // DynamoDB Table for Gold Price History
    const goldPriceTable = new cdk.aws_dynamodb.Table(this, 'GoldPriceHistoryTable', {
      partitionKey: { name: 'type', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: cdk.aws_dynamodb.AttributeType.NUMBER },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    })

    // --- Constructs ---

    // 1. Voice Worker
    const voiceWorker = new VoiceWorker(this, 'VoiceWorker')

    // 2. Discord Bot
    const discordBot = new DiscordBot(this, 'DiscordBot', {
      discordPublicKey,
      blizzardCredentials,
      googleApiKey,
      goldPriceTable,
      voiceQueue: voiceWorker.voiceQueue,
    })

    // --- Outputs ---

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: discordBot.apiUrl,
      description: 'The URL of the API Gateway',
    })

    new cdk.CfnOutput(this, 'SecretName', {
      value: discordPublicKey.secretName,
      description: 'The name of the secret in Secrets Manager',
    })

    new cdk.CfnOutput(this, 'BlizzardSecretName', {
      value: blizzardCredentials.secretName,
      description: 'The name of the Blizzard secret in Secrets Manager',
    })

    new cdk.CfnOutput(this, 'GoogleApiKeySecretName', {
      value: googleApiKey.secretName,
      description: 'The name of the Google API Key secret in Secrets Manager',
    })

    new cdk.CfnOutput(this, 'BotFunctionArn', {
      value: discordBot.botFunction.functionArn,
      description: 'The ARN of the Discord Bot Lambda function',
    })
  }
}
