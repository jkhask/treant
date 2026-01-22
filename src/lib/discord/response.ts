export const editOriginalResponse = async (
  applicationId: string,
  token: string,
  payload: { content?: string; embeds?: any[] },
) => {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`
  console.log('Sending response to Discord...')
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    console.log(`Discord response status: ${response.status}`)
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Discord Error Body:', errorText)
    }
  } catch (error) {
    console.error('Failed to send response to Discord:', error)
  }
}
