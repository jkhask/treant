import { SQSEvent } from 'aws-lambda'
import { CommandPayload } from './services/sqs'
import { processJudgeCommandAsync } from './commands/judge'
import { processGoldCommandAsync } from './commands/gold'

export const handler = async (event: SQSEvent): Promise<void> => {
  console.log('Received SQS Event:', JSON.stringify(event, null, 2))
  for (const record of event.Records) {
    try {
      const payload = JSON.parse(record.body) as CommandPayload
      console.log('Processing SQS Message:', payload)

      if (payload.command === 'judge') {
        await processJudgeCommandAsync(payload)
      } else if (payload.command === 'gold') {
        await processGoldCommandAsync(payload)
      }
      // Add other async command handlers here
    } catch (error) {
      console.error('Error processing SQS record:', error)
      // Throwing error here would send message back to DLQ if configured, or retry.
      // For now we log and continue to process other records.
    }
  }
}
