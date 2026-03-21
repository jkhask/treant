interface G2GResponse {
  payload: {
    converted_unit_price: number
  }
}

// const kangId = 'G1744089054578IF'
const cnlTeamId = 'G1744088746970DY'

export const getG2GGoldPrice = async (): Promise<number> => {
  const url = `https://sls.g2g.com/offer/${cnlTeamId}?currency=USD&country=US&include_out_of_stock=1`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`G2G API responded with status: ${response.status}`)
    }
    const data = (await response.json()) as G2GResponse
    // payload.converted_unit_price is the price per 1 unit (1 gold)
    return data.payload.converted_unit_price
  } catch (error) {
    console.error('Error fetching G2G gold price:', error)
    throw error
  }
}
