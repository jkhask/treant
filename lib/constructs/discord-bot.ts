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
  public readonly botFunction: nodejs.NodejsFunction
  public readonly apiUrl: string

  constructor(scope: Construct, id: string, props: DiscordBotProps) {
    super(scope, id)

    // Discord Bot Lambda Function
    this.botFunction = new nodejs.NodejsFunction(this, 'DiscordBotFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../src/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        DISCORD_PUBLIC_KEY_SECRET_NAME: props.discordPublicKey.secretName,
        BLIZZARD_SECRET_NAME: props.blizzardCredentials.secretName,
        GOOGLE_API_KEY_SECRET_NAME: props.googleApiKey.secretName,
        GOLD_PRICE_TABLE_NAME: props.goldPriceTable.tableName,
        VOICE_QUEUE_URL: props.voiceQueue.queueUrl,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    })

    // Grant Lambda permission to read the secrets
    props.discordPublicKey.grantRead(this.botFunction)
    props.blizzardCredentials.grantRead(this.botFunction)
    props.googleApiKey.grantRead(this.botFunction)

    // Grant permissions to DynamoDB
    props.goldPriceTable.grantReadWriteData(this.botFunction)

    // Grant permissions to Voice Queue
    props.voiceQueue.grantSendMessages(this.botFunction)

    // Discord Command Queue (SQS) - for async processing like /judge
    const commandQueue = new cdk.aws_sqs.Queue(this, 'DiscordCommandQueue', {
      visibilityTimeout: cdk.Duration.seconds(30), // Lambda timeout
    })

    // Grant permissions and add event source
    commandQueue.grantSendMessages(this.botFunction)
    commandQueue.grantConsumeMessages(this.botFunction)
    this.botFunction.addEventSource(new SqsEventSource(commandQueue))
    this.botFunction.addEnvironment('COMMAND_QUEUE_URL', commandQueue.queueUrl)

    // API Gateway to expose the Lambda
    const api = new cdk.aws_apigateway.LambdaRestApi(this, 'DiscordBotApi', {
      handler: this.botFunction,
      // proxy: true is default, ensuring we get headers for verification
    })

    this.apiUrl = api.url
  }
}
