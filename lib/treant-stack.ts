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
      runtime: lambda.Runtime.NODEJS_20_X,
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
