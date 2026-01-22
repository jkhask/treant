import QuickChart from 'quickchart-js'
import { PriceRecord } from '../db/price-history'

const getETOffset = (): number => {
  const now = new Date()
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
  const nyStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  return new Date(nyStr).getTime() - new Date(utcStr).getTime()
}

export const generateGoldChartUrl = (data: PriceRecord[], amount: number): string => {
  const chart = new QuickChart()
  const offset = getETOffset()

  // Create data points with x (timestamp) and y (price)
  // Shift timestamp by offset to show ET time on UTC chart
  const chartData = data.map((record) => ({
    x: record.timestamp + offset,
    y: Number((record.price * amount).toFixed(2)),
  }))

  chart.setConfig({
    type: 'line',
    data: {
      datasets: [
        {
          label: `Cost for ${amount.toLocaleString()} Gold (USD)`,
          data: chartData,
          fill: true,
          borderColor: '#FFD700', // Gold hex
          backgroundColor: 'rgba(255, 215, 0, 0.2)', // Semi-transparent gold
          pointBackgroundColor: '#FFD700',
          pointBorderColor: '#fff',
          pointRadius: 3,
          tension: 0.4, // Smooth curves
        },
      ],
    },
    options: {
      title: {
        display: true,
        text: `Gold Price History (${amount.toLocaleString()}g)`,
        fontColor: '#eee',
        fontSize: 16,
      },
      legend: {
        labels: {
          fontColor: '#ccc',
        },
      },
      scales: {
        xAxes: [
          {
            type: 'time',
            time: {
              // unit: 'day', // Let Chart.js decide the unit automatically
              displayFormats: {
                day: 'MMM D',
                hour: 'MMM D, hA', // Show date with hour (e.g. Jan 21, 3PM)
              },
              tooltipFormat: 'MMM D, h:mm a',
            },
            ticks: {
              fontColor: '#aaa',
              autoSkip: true,
              maxTicksLimit: 6,
            },
            gridLines: {
              color: 'rgba(255, 255, 255, 0.05)',
              zeroLineColor: 'rgba(255, 255, 255, 0.1)',
            },
          },
        ],
        yAxes: [
          {
            ticks: {
              fontColor: '#aaa',
              // Use a callback to add dollar sign
              callback: (value: string | number) => {
                return '$' + value
              },
            },
            gridLines: {
              color: 'rgba(255, 255, 255, 0.05)',
              zeroLineColor: 'rgba(255, 255, 255, 0.1)',
            },
          },
        ],
      },
    },
  })

  // Use a customized gradient if I could, but simple rgba fill is generally safer and robust
  // Let's stick to the high contrast dark mode aesthetic

  chart.setBackgroundColor('#2f3136')
  chart.setWidth(600) // Slightly wider
  chart.setHeight(350)
  chart.setDevicePixelRatio(2.0) // Higher resolution

  return chart.getUrl()
}
