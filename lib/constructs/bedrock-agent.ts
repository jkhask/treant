import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as cr from 'aws-cdk-lib/custom-resources'
import * as path from 'path'

interface BedrockAgentProps {
  blizzardCredentialsVerify: secretsmanager.ISecret
}

export class BedrockAgent extends Construct {
  public readonly agent: bedrock.Agent

  constructor(scope: Construct, id: string, props: BedrockAgentProps) {
    super(scope, id)

    const { blizzardCredentialsVerify } = props

    // Bedrock Agent
    this.agent = new bedrock.Agent(this, 'TreantAgent', {
      name: 'TreantAgent',
      instruction: `You are a wise and ancient Treant from the World of Warcraft universe.
      You are also a World of Warcraft Classic gear expert, and you are here to judge the gear of players.
      Keep your tone constructive but slightly judgmental like a raid leader.
      You are an ancient treant. Old and wise, but still a raid leader.
      IMPORTANT: Your response must be strictly under 1000 characters. Be concise.`,
      foundationModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_SONNET_V1_0,
    })

    // Tool: Game Data Function
    const gameDataFunction = new nodejs.NodejsFunction(this, 'GameDataFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../src/tools/game-data.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      environment: {
        BLIZZARD_SECRET_NAME: blizzardCredentialsVerify.secretName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    })

    // Grant explicit permission for Bedrock to invoke this lambda
    blizzardCredentialsVerify.grantRead(gameDataFunction)

    // Allow Bedrock to invoke the Lambda
    gameDataFunction.addPermission('BedrockInvoke', {
      principal: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: this.agent.agentArn,
    })

    // Action Group
    const actionGroup = new bedrock.AgentActionGroup({
      name: 'GameData',
      description: 'Tools for fetching World of Warcraft game data',
      executor: bedrock.ActionGroupExecutor.fromlambdaFunction(gameDataFunction),
      enabled: true,
      functionSchema: {
        functions: [
          {
            name: 'get_character_equipment',
            description: 'Get the equipped items for a WoW Classic character',
            parameters: {
              character: {
                description: 'The name of the character',
                required: true,
                type: 'string',
              },
              realm: {
                description: 'The realm slug (default: dreamscythe)',
                required: false,
                type: 'string',
              },
            },
          },
        ],
      },
    })

    this.agent.addActionGroup(actionGroup)

    // Auto-prepare the agent on deployment
    const prepareAgentRequest = {
      action: 'prepareAgent',
      service: 'BedrockAgent',
      parameters: {
        agentId: this.agent.agentId,
      },
      physicalResourceId: cr.PhysicalResourceId.of(`PrepareAgent-${Date.now().toString()}`),
    }

    const prepareResource = new cr.AwsCustomResource(this, 'PrepareAgentResource', {
      onCreate: prepareAgentRequest,
      onUpdate: prepareAgentRequest,
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.agent.agentArn],
      }),
    })

    // Ensure action group is attached before preparing
    // Find all ActionGroup resources and add them as dependencies
    const actionGroups = this.agent.node.findAll().filter((child) => {
      return (child as cdk.CfnResource).cfnResourceType === 'AWS::Bedrock::AgentActionGroup'
    })

    actionGroups.forEach((ag) => {
      prepareResource.node.addDependency(ag)
    })
  }
}
