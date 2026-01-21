import * as cdk from 'aws-cdk-lib'
import { Template, Match } from 'aws-cdk-lib/assertions'
import * as Treant from '../lib/treant-stack'

test('Treant Stack Created', () => {
  const app = new cdk.App()
  // WHEN
  const stack = new Treant.TreantStack(app, 'MyTestStack')
  // THEN
  const template = Template.fromStack(stack)

  // Verify Secret Created
  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    Description: 'The Public Key for the Discord Application',
  })

  template.hasResourceProperties('AWS::SecretsManager::Secret', {
    Description: 'Client ID and Secret for Blizzard API',
  })

  // Verify Bedrock Agent Created
  template.hasResourceProperties('AWS::Bedrock::Agent', {
    AgentName: 'TreantAgent',
  })

  // Verify Lambda Function Created
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs24.x',
    Environment: {
      Variables: {
        DISCORD_PUBLIC_KEY_SECRET_NAME: Match.anyValue(),
        BLIZZARD_SECRET_NAME: Match.anyValue(),
        BEDROCK_AGENT_ID: Match.anyValue(),
      },
    },
  })

  // Verify API Gateway Created
  template.hasResourceProperties('AWS::ApiGateway::RestApi', {
    Name: 'DiscordBotApi',
  })
})
