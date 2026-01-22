import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as path from 'path'

interface DiscordBotProps {
  discordPublicKey: cdk.aws_secretsmanager.ISecret
  blizzardCredentials: cdk.aws_secretsmanager.ISecret
  googleApiKey: cdk.aws_secretsmanager.ISecret
  goldPriceTable: cdk.aws_dynamodb.ITable
  voiceQueue: cdk.aws_sqs.IQueue
}

export class DiscordBot extends Construct {
  public readonly apiFunction: nodejs.NodejsFunction
  public readonly workerFunction: nodejs.NodejsFunction
  public readonly apiUrl: string

  constructor(scope: Construct, id: string, props: DiscordBotProps) {
    super(scope, id)

    // --- 1. SQS Queue for Async Commands ---
    // This queue sits between the API and the Worker
    const commandQueue = new cdk.aws_sqs.Queue(this, 'DiscordCommandQueue', {
      visibilityTimeout: cdk.Duration.seconds(90), // Longer than worker timeout
    })

    // --- 2. API Handler Lambda ---
    // Lightweight, fast, handles verification and dispatching to queues
    const apiFunction = new nodejs.NodejsFunction(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../src/api.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(3), // Fail fast
      memorySize: 128, // Lightweight
      environment: {
        DISCORD_PUBLIC_KEY_SECRET_NAME: props.discordPublicKey.secretName,
        COMMAND_QUEUE_URL: commandQueue.queueUrl,
        VOICE_QUEUE_URL: props.voiceQueue.queueUrl,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    })

    // Grant API permissions
    props.discordPublicKey.grantRead(apiFunction)
    commandQueue.grantSendMessages(apiFunction)
    props.voiceQueue.grantSendMessages(apiFunction)

    // --- 3. Worker Lambda ---
    // Heavy lifting, handles deferred responses (AI, etc.)
    const workerFunction = new nodejs.NodejsFunction(this, 'WorkerFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../src/worker.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60), // Allow time for AI/API calls
      memorySize: 1024,
      environment: {
        BLIZZARD_SECRET_NAME: props.blizzardCredentials.secretName,
        GOOGLE_API_KEY_SECRET_NAME: props.googleApiKey.secretName,
        GOLD_PRICE_TABLE_NAME: props.goldPriceTable.tableName,
        // Worker might need to send voice commands too? Not currently, but good practice if it generates voice.
        // For now, only API sends to voice queue directly via dispatch -> speak command.
        // But if async judge wants to speak, it would need this. Let's add it.
        VOICE_QUEUE_URL: props.voiceQueue.queueUrl,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    })

    // Grant Worker permissions
    props.blizzardCredentials.grantRead(workerFunction)
    props.googleApiKey.grantRead(workerFunction)
    props.goldPriceTable.grantReadWriteData(workerFunction)
    props.voiceQueue.grantSendMessages(workerFunction)

    // Wire Worker to SQS
    workerFunction.addEventSource(new SqsEventSource(commandQueue))

    // --- 4. API Gateway ---
    const api = new cdk.aws_apigateway.LambdaRestApi(this, 'DiscordBotApi', {
      handler: apiFunction,
      // proxy: true is default
    })

    this.apiUrl = api.url
    this.apiFunction = apiFunction
    this.workerFunction = workerFunction
  }
}
