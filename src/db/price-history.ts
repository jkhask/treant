import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_NAME = process.env.GOLD_PRICE_TABLE_NAME
const RECORD_TYPE = 'GOLD_G2G'
const THIRTY_MINUTES_MS = 30 * 60 * 1000

const client = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(client)

export interface PriceRecord {
  type: string
  timestamp: number
  price: number
}

export const getGoldPriceHistory = async (limit: number = 24): Promise<PriceRecord[]> => {
  if (!TABLE_NAME) return []

  try {
    const queryCommand = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':type': RECORD_TYPE,
      },
      Limit: limit,
      ScanIndexForward: false, // Descending order (latest first)
    })

    const result = await docClient.send(queryCommand)
    // Reverse to return ascending order (oldest to newest) for charting
    return (result.Items as PriceRecord[]).reverse()
  } catch (error) {
    console.error('Error fetching gold price history:', error)
    return []
  }
}

export const recordGoldPrice = async (price: number): Promise<void> => {
  if (!TABLE_NAME) {
    console.warn('GOLD_PRICE_TABLE_NAME not set, skipping price recording')
    return
  }

  try {
    // 1. Get the latest record
    const queryCommand = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':type': RECORD_TYPE,
      },
      Limit: 1,
      ScanIndexForward: false, // Descending order (latest first)
    })

    const result = await docClient.send(queryCommand)
    const latestRecord = result.Items?.[0] as PriceRecord | undefined

    const now = Date.now()

    // 2. Check rate limit
    if (latestRecord) {
      const timeDiff = now - latestRecord.timestamp
      if (timeDiff < THIRTY_MINUTES_MS) {
        console.log(
          `Skipping price recording. Last record was ${Math.floor(
            timeDiff / 1000 / 60,
          )} minutes ago.`,
        )
        return
      }
    }

    // 3. Write new record
    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        type: RECORD_TYPE,
        timestamp: now,
        price,
      },
    })

    await docClient.send(putCommand)
    console.log(`Recorded gold price: ${price}`)
  } catch (error) {
    console.error('Error recording gold price:', error)
    // Don't throw, we don't want to fail the user request just because stats failed
  }
}
