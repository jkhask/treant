import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as path from 'path'

export class VoiceWorker extends Construct {
  public readonly voiceQueue: sqs.Queue

  constructor(scope: Construct, id: string) {
    super(scope, id)

    // 1. Voice Command Queue
    this.voiceQueue = new sqs.Queue(this, 'VoiceCommandQueue', {
      visibilityTimeout: cdk.Duration.seconds(45), // > worker processing time
    })

    // 2. VPC for Fargate (Public subnets only for cost efficiency/simplicity)
    const vpc = new ec2.Vpc(this, 'TreantVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    })

    // 3. ECS Cluster
    const cluster = new ecs.Cluster(this, 'TreantCluster', {
      vpc: vpc,
    })

    // 4. Secret for Discord Token (Full Token)
    const discordTokenSecret = new secretsmanager.Secret(this, 'DiscordTokenSecret', {
      description: 'Discord Bot Token for Voice Worker',
    })

    // 5. Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'VoiceWorkerTask', {
      memoryLimitMiB: 512,
      cpu: 256,
    })

    // Grant Task permissions
    discordTokenSecret.grantRead(taskDefinition.taskRole)
    this.voiceQueue.grantConsumeMessages(taskDefinition.taskRole)

    // Grant Polly permission
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
      }),
    )

    // 6. Container
    taskDefinition.addContainer('VoiceWorkerContainer', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../src/voice-worker')),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'TreantVoiceWorker' }),
      environment: {
        QUEUE_URL: this.voiceQueue.queueUrl,
        DISCORD_TOKEN_SECRET_NAME: discordTokenSecret.secretName,
        AWS_REGION: cdk.Stack.of(this).region,
      },
    })

    // 7. Fargate Service
    new ecs.FargateService(this, 'VoiceWorkerService', {
      cluster,
      taskDefinition,
      assignPublicIp: true, // Needed for outgoing internet access (Discord/SQS) since we have no NAT
      desiredCount: 1, // Always on
    })
  }
}
