import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import * as path from 'path'
import { BedrockAgent } from './constructs/bedrock-agent'
import { VoiceWorker } from './constructs/voice-worker'

export class TreantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

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

    // Bedrock Agent Construct
    const bedrockAgent = new BedrockAgent(this, 'BedrockAgent', {
      blizzardCredentialsVerify: blizzardCredentials,
    })

    // Discord Bot Lambda Function
    const botFunction = new nodejs.NodejsFunction(this, 'DiscordBotFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../src/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        DISCORD_PUBLIC_KEY_SECRET_NAME: discordPublicKey.secretName,
        BLIZZARD_SECRET_NAME: blizzardCredentials.secretName,
        BEDROCK_AGENT_ID: bedrockAgent.agent.agentId,
        BEDROCK_AGENT_ALIAS_ID: bedrockAgent.agent.testAlias.aliasId,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    })

    // Grant Lambda permission to read the secret
    discordPublicKey.grantRead(botFunction)
    blizzardCredentials.grantRead(botFunction)

    // Grant Bedrock Agent permissions
    botFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['bedrock:InvokeAgent'],
        resources: [bedrockAgent.agent.testAlias.aliasArn],
      }),
    )

    // DynamoDB Table for Gold Price History
    const goldPriceTable = new cdk.aws_dynamodb.Table(this, 'GoldPriceHistoryTable', {
      partitionKey: { name: 'type', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: cdk.aws_dynamodb.AttributeType.NUMBER },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    })

    goldPriceTable.grantReadWriteData(botFunction)
    botFunction.addEnvironment('GOLD_PRICE_TABLE_NAME', goldPriceTable.tableName)

    // Discord Command Queue (SQS) - for async processing like /judge
    const commandQueue = new cdk.aws_sqs.Queue(this, 'DiscordCommandQueue', {
      visibilityTimeout: cdk.Duration.seconds(30), // Lambda timeout
    })

    // Grant permissions and add event source
    commandQueue.grantSendMessages(botFunction)
    commandQueue.grantConsumeMessages(botFunction)
    botFunction.addEventSource(new SqsEventSource(commandQueue))
    botFunction.addEnvironment('COMMAND_QUEUE_URL', commandQueue.queueUrl)

    // Voice Worker Construct
    const voiceWorker = new VoiceWorker(this, 'VoiceWorker')

    // Grant Lambda permission to send messages to Voice Queue
    voiceWorker.voiceQueue.grantSendMessages(botFunction)
    botFunction.addEnvironment('VOICE_QUEUE_URL', voiceWorker.voiceQueue.queueUrl)

    // API Gateway to expose the Lambda
    const api = new cdk.aws_apigateway.LambdaRestApi(this, 'DiscordBotApi', {
      handler: botFunction,
      // proxy: true is default, ensuring we get headers for verification
    })

    // Output the API URL and Secret Name
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
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

    new cdk.CfnOutput(this, 'BedrockAgentId', {
      value: bedrockAgent.agent.agentId,
      description: 'The ID of the Bedrock Agent',
    })

    new cdk.CfnOutput(this, 'BotFunctionArn', {
      value: botFunction.functionArn,
      description: 'The ARN of the Discord Bot Lambda function',
    })
  }
}
