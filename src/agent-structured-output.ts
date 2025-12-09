import { openai } from '@ai-sdk/openai'
import { ToolLoopAgent, tool, Output, type TextStreamPart } from 'ai'
import { z } from 'zod'

const weatherSchema = z.object({
  cities: z.array(
    z.object({
      name: z.string(),
      temperature: z.number(),
      condition: z.enum(['sunny', 'cloudy', 'rainy']),
      humidity: z.number(),
    })
  ),
  summary: z.string(),
})

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a weather assistant. Always provide structured weather data.',
  output: Output.object({
    schema: weatherSchema,
  }),
  tools: {
    getWeather: tool({
      description: 'Get the weather in a location',
      inputSchema: z.object({
        city: z.string(),
      }),
      execute: async ({ city }) => {
        return {
          city,
          temperature: Math.floor(Math.random() * 30) + 10,
          condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
          humidity: Math.floor(Math.random() * 40) + 40,
        }
      },
    }),
  },
})

async function chat() {
  console.log('Structured Output Agent ready. Type your message (Ctrl+C to exit):\n')

  for await (const line of console) {
    const prompt = line.trim()
    if (!prompt) continue

    console.log('\n[Streaming partial JSON...]\n')

    const result = await agent.stream({ prompt })

    for await (const partialObject of result.partialOutputStream) {
      console.clear()
      console.log('[Partial Object]:\n')
      console.log(JSON.stringify(partialObject, null, 2))
    }

    console.log('\n\n[✅ Final Object]:')
    console.log(JSON.stringify(await result.output, null, 2))
    console.log('\n')
  }
}

chat()
