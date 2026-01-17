import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as path from 'path'

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
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    })

    // Grant Lambda permission to read the secret
    discordPublicKey.grantRead(botFunction)
    blizzardCredentials.grantRead(botFunction)

    // DynamoDB Table for Gold Price History
    const goldPriceTable = new cdk.aws_dynamodb.Table(this, 'GoldPriceHistoryTable', {
      partitionKey: { name: 'type', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: cdk.aws_dynamodb.AttributeType.NUMBER },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    })

    goldPriceTable.grantReadWriteData(botFunction)
    botFunction.addEnvironment('GOLD_PRICE_TABLE_NAME', goldPriceTable.tableName)

    // --- Voice Worker Infrastructure ---

    // 1. Voice Command Queue
    const voiceQueue = new cdk.aws_sqs.Queue(this, 'VoiceCommandQueue', {
      visibilityTimeout: cdk.Duration.seconds(45), // > worker processing time
    })

    // Grant Lambda permission to send messages
    voiceQueue.grantSendMessages(botFunction)
    botFunction.addEnvironment('VOICE_QUEUE_URL', voiceQueue.queueUrl)

    // 2. VPC for Fargate (Public subnets only for cost efficiency/simplicity)
    const vpc = new cdk.aws_ec2.Vpc(this, 'TreantVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
        },
      ],
      // Avoid creating unnecessary endpoints for this simple bot to save cost
    })

    // 3. ECS Cluster
    const cluster = new cdk.aws_ecs.Cluster(this, 'TreantCluster', {
      vpc: vpc,
    })

    // 4. Secret for Discord Token (Full Token)
    const discordTokenSecret = new cdk.aws_secretsmanager.Secret(this, 'DiscordTokenSecret', {
      description: 'Discord Bot Token for Voice Worker',
      secretName: 'TreantDiscordToken',
    })

    // 5. Fargate Task Definition
    const taskDefinition = new cdk.aws_ecs.FargateTaskDefinition(this, 'VoiceWorkerTask', {
      memoryLimitMiB: 512,
      cpu: 256,
    })

    // Grant Task permissions
    discordTokenSecret.grantRead(taskDefinition.taskRole)
    voiceQueue.grantConsumeMessages(taskDefinition.taskRole)

    // Grant Polly permission
    taskDefinition.taskRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
      }),
    )

    // 6. Container
    taskDefinition.addContainer('VoiceWorkerContainer', {
      image: cdk.aws_ecs.ContainerImage.fromAsset(path.join(__dirname, '../src/voice-worker')),
      logging: cdk.aws_ecs.LogDrivers.awsLogs({ streamPrefix: 'TreantVoiceWorker' }),
      environment: {
        QUEUE_URL: voiceQueue.queueUrl,
        DISCORD_TOKEN_SECRET_NAME: discordTokenSecret.secretName,
        AWS_REGION: this.region,
      },
    })

    // 7. Fargate Service
    new cdk.aws_ecs.FargateService(this, 'VoiceWorkerService', {
      cluster,
      taskDefinition,
      assignPublicIp: true, // Needed for outgoing internet access (Discord/SQS) since we have no NAT
      desiredCount: 1, // Always on
    })

    // --- End Voice Worker Infrastructure ---

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

    new cdk.CfnOutput(this, 'BotFunctionArn', {
      value: botFunction.functionArn,
      description: 'The ARN of the Discord Bot Lambda function',
    })
  }
}
