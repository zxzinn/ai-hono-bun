import { tool, type TextStreamPart } from 'ai'
import { z } from 'zod'
import { runAgentWithArgs, createChatLoop } from './lib/agent-runner'
import { createTracedToolLoopAgent } from './lib/traced-agent'

const agent = createTracedToolLoopAgent(import.meta.url, {
  instructions: 'You are a helpful assistant that can fetch information from multiple sources simultaneously. When asked about multiple things, use all relevant tools in parallel for efficiency.',
  tools: {
    getWeather: tool({
      description: 'Get the current weather for a city',
      inputSchema: z.object({
        city: z.string().describe('City name'),
      }),
      execute: async ({ city }) => {
        await new Promise(resolve => setTimeout(resolve, 1000))
        return {
          city,
          temperature: Math.floor(Math.random() * 30) + 10,
          condition: ['sunny', 'cloudy', 'rainy', 'partly cloudy'][Math.floor(Math.random() * 4)],
          humidity: Math.floor(Math.random() * 40) + 40,
        }
      },
    }),

    getPopulation: tool({
      description: 'Get the population of a city',
      inputSchema: z.object({
        city: z.string().describe('City name'),
      }),
      execute: async ({ city }) => {
        await new Promise(resolve => setTimeout(resolve, 1200))
        const populations: Record<string, number> = {
          'Tokyo': 13960000,
          'New York': 8336000,
          'London': 8982000,
          'Paris': 2161000,
          'Sydney': 5312000,
        }
        return {
          city,
          population: populations[city] || Math.floor(Math.random() * 5000000) + 1000000,
        }
      },
    }),

    getTimeZone: tool({
      description: 'Get the timezone of a city',
      inputSchema: z.object({
        city: z.string().describe('City name'),
      }),
      execute: async ({ city }) => {
        await new Promise(resolve => setTimeout(resolve, 800))
        const timezones: Record<string, string> = {
          'Tokyo': 'Asia/Tokyo (UTC+9)',
          'New York': 'America/New_York (UTC-5)',
          'London': 'Europe/London (UTC+0)',
          'Paris': 'Europe/Paris (UTC+1)',
          'Sydney': 'Australia/Sydney (UTC+11)',
        }
        return {
          city,
          timezone: timezones[city] || 'UTC+0',
        }
      },
    }),

    getCurrency: tool({
      description: 'Get the currency used in a city',
      inputSchema: z.object({
        city: z.string().describe('City name'),
      }),
      execute: async ({ city }) => {
        await new Promise(resolve => setTimeout(resolve, 900))
        const currencies: Record<string, string> = {
          'Tokyo': 'JPY (Japanese Yen)',
          'New York': 'USD (US Dollar)',
          'London': 'GBP (British Pound)',
          'Paris': 'EUR (Euro)',
          'Sydney': 'AUD (Australian Dollar)',
        }
        return {
          city,
          currency: currencies[city] || 'USD',
        }
      },
    }),
  },
})

interface ToolCallInfo {
  id: string
  name: string
  input: unknown
  startTime: number
  endTime?: number
}

const toolCalls = new Map<string, ToolCallInfo>()

async function runPrompt(prompt: string) {
  toolCalls.clear()
  console.log('\n' + '─'.repeat(60))

  const startTime = Date.now()
  const result = await agent.stream({ prompt })

  for await (const event of result.fullStream) {
    handleEvent(event)
  }

  const totalTime = Date.now() - startTime

  if (toolCalls.size > 0) {
    console.log('\n' + '─'.repeat(60))
    console.log('📊 Performance Summary:')
    console.log('─'.repeat(60))

    const callsArray = Array.from(toolCalls.values())
    const totalSequentialTime = callsArray.reduce((sum, call) => {
      return sum + (call.endTime ? call.endTime - call.startTime : 0)
    }, 0)

    console.log(`✨ Tools called in parallel: ${toolCalls.size}`)
    console.log(`⚡ Actual execution time: ${totalTime}ms`)
    console.log(`🐌 Sequential would take: ${totalSequentialTime}ms`)
    console.log(`🚀 Time saved: ${totalSequentialTime - totalTime}ms (${Math.round((1 - totalTime / totalSequentialTime) * 100)}% faster)`)
  }

  console.log('\n')
}

async function chat() {
  const welcome = [
    '🚀 Parallel Tool Calling Agent',
    '='.repeat(60),
    'This agent can call multiple tools simultaneously!',
    'Try asking about multiple cities to see parallel execution.\n',
    'Example: "Tell me about Tokyo, New York, and London"\n',
    'Type your message (Ctrl+C to exit):\n'
  ].join('\n')

  await createChatLoop(runPrompt, welcome)
}

function handleEvent(event: TextStreamPart<typeof agent.tools>) {
  switch (event.type) {
    case 'tool-call': {
      const toolCall: ToolCallInfo = {
        id: event.toolCallId,
        name: event.toolName,
        input: event.input,
        startTime: Date.now(),
      }
      toolCalls.set(event.toolCallId, toolCall)

      console.log(`\n🔧 [${event.toolName}] Starting...`)
      console.log(`   Input: ${JSON.stringify(event.input)}`)
      break
    }

    case 'tool-result': {
      const toolCall = toolCalls.get(event.toolCallId)
      if (toolCall) {
        toolCall.endTime = Date.now()
        const duration = toolCall.endTime - toolCall.startTime
        console.log(`✅ [${toolCall.name}] Completed in ${duration}ms`)
        console.log(`   Output: ${JSON.stringify(event.output)}`)
      }
      break
    }

    case 'text-delta':
      process.stdout.write(event.text)
      break

    case 'finish':
      console.log('\n\n✓ Response complete')
      break

    case 'error':
      console.error(`\n❌ Error: ${event.error}`)
      break
  }
}

runAgentWithArgs(runPrompt, chat)
