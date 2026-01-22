import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as path from 'path'

export class VoiceWorker extends Construct {
  public readonly voiceQueue: cdk.aws_sqs.Queue

  constructor(scope: Construct, id: string) {
    super(scope, id)

    // 1. Voice Command Queue
    this.voiceQueue = new cdk.aws_sqs.Queue(this, 'VoiceCommandQueue', {
      visibilityTimeout: cdk.Duration.seconds(45), // > worker processing time
    })

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
    this.voiceQueue.grantConsumeMessages(taskDefinition.taskRole)

    // Grant Polly permission
    taskDefinition.taskRole.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
      }),
    )

    // 6. Container
    taskDefinition.addContainer('VoiceWorkerContainer', {
      image: cdk.aws_ecs.ContainerImage.fromAsset(path.join(__dirname, '../../src/voice-worker')),
      logging: cdk.aws_ecs.LogDrivers.awsLogs({ streamPrefix: 'TreantVoiceWorker' }),
      environment: {
        QUEUE_URL: this.voiceQueue.queueUrl,
        DISCORD_TOKEN_SECRET_NAME: discordTokenSecret.secretName,
        AWS_REGION: cdk.Stack.of(this).region,
      },
    })

    // 7. Fargate Service
    new cdk.aws_ecs.FargateService(this, 'VoiceWorkerService', {
      cluster,
      taskDefinition,
      assignPublicIp: true, // Needed for outgoing internet access (Discord/SQS) since we have no NAT
      desiredCount: 1, // Always on
    })
  }
}
