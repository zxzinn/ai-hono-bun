import { agent, agentToolCallEvent, agentToolCallResultEvent } from '@llamaindex/workflow'
import { openai } from '@llamaindex/openai'
import { tool } from 'llamaindex'
import { z } from 'zod'
import { runAgentWithArgs } from './lib/agent-runner'
import { initOpenLumixTracing } from './lib/openlumix-tracing'
import { trace, type Span } from '@opentelemetry/api'

const tracer = trace.getTracer('llamaindex-agent')

initOpenLumixTracing('agent-llamaindex')

const weatherAgent = agent({
  llm: openai({ model: 'gpt-4o-mini' }),
  tools: [
    tool({
      name: 'getWeather',
      description: 'Get the current weather for a city',
      parameters: z.object({
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

    tool({
      name: 'getPopulation',
      description: 'Get the population of a city',
      parameters: z.object({
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

    tool({
      name: 'getTimeZone',
      description: 'Get the timezone of a city',
      parameters: z.object({
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

    tool({
      name: 'getCurrency',
      description: 'Get the currency used in a city',
      parameters: z.object({
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
  ],
  verbose: false,
})

interface ToolCallInfo {
  id: string
  name: string
  input: unknown
  startTime: number
  endTime?: number
  span?: Span
}

const toolCalls = new Map<string, ToolCallInfo>()

async function runPrompt(prompt: string) {
  toolCalls.clear()
  console.log('\n' + '─'.repeat(60))
  console.log('🦙 LlamaIndex.TS Agent with OpenLumix Tracing')
  console.log('─'.repeat(60))

  const startTime = Date.now()

  await tracer.startActiveSpan('agent.run', async (agentSpan) => {
    agentSpan.setAttribute('agent.framework', 'llamaindex')
    agentSpan.setAttribute('agent.prompt', prompt)

    try {
      const events = weatherAgent.runStream(prompt)

      for await (const event of events) {
        if (agentToolCallEvent.include(event)) {
          const toolCallId = event.data.toolId
          const toolName = event.data.toolName
          const toolInput = event.data.toolKwargs

          const toolSpan = tracer.startSpan(`tool.${toolName}`, {
            attributes: {
              'tool.name': toolName,
              'tool.input': JSON.stringify(toolInput),
            },
          })

          const toolCall: ToolCallInfo = {
            id: toolCallId,
            name: toolName,
            input: toolInput,
            startTime: Date.now(),
            span: toolSpan,
          }
          toolCalls.set(toolCallId, toolCall)

          console.log(`\n🔧 [${toolName}] Starting...`)
          console.log(`   Input: ${JSON.stringify(toolInput)}`)
        } else if (agentToolCallResultEvent.include(event)) {
          const toolCallId = event.data.toolId
          const toolCall = toolCalls.get(toolCallId)

          if (toolCall?.span) {
            toolCall.endTime = Date.now()
            const duration = toolCall.endTime - toolCall.startTime

            toolCall.span.setAttribute('tool.output', JSON.stringify(event.data.toolOutput))
            toolCall.span.setAttribute('tool.duration_ms', duration)
            toolCall.span.end()

            console.log(`✅ [${toolCall.name}] Completed in ${duration}ms`)
            console.log(`   Output: ${JSON.stringify(event.data.toolOutput.result)}`)
          }
        }
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

        console.log(`✨ Tools called: ${toolCalls.size}`)
        console.log(`⚡ Total execution time: ${totalTime}ms`)
        console.log(`🔧 Sum of individual tool times: ${totalSequentialTime}ms`)
        if (totalSequentialTime > totalTime) {
          const savedTime = totalSequentialTime - totalTime
          const speedup = Math.round((totalSequentialTime / totalTime) * 100) - 100
          console.log(`🚀 Parallel speedup: ${savedTime}ms saved (${speedup}% faster)`)
        }
      }

      agentSpan.setAttribute('agent.duration_ms', totalTime)
      agentSpan.setAttribute('agent.tool_calls_count', toolCalls.size)
    } catch (error) {
      agentSpan.recordException(error as Error)
      agentSpan.setStatus({ code: 2, message: (error as Error).message })
      throw error
    } finally {
      agentSpan.end()
    }
  })

  console.log('\n')
}

async function chat() {
  const welcome = [
    '🦙 LlamaIndex.TS Agent with OpenLumix Tracing',
    '='.repeat(60),
    'This agent uses LlamaIndex.TS with manual OpenTelemetry tracing.',
    'Try asking about multiple cities to see tool execution.\n',
    'Example: "Tell me about Tokyo, New York, and London"\n',
  ].join('\n')

  await runPrompt(welcome)
}

runAgentWithArgs(runPrompt, chat)
