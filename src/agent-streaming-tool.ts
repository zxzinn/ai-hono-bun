import { openai } from '@ai-sdk/openai'
import { ToolLoopAgent, tool, type TextStreamPart } from 'ai'
import { z } from 'zod'
import { runAgentWithArgs, createChatLoop } from './lib/agent-runner'
import { initPhoenixTracing } from './lib/phoenix-tracing'

initPhoenixTracing('agent-streaming-tool')

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant that can fetch weather data.',
  tools: {
    getWeather: tool({
      description: 'Get the weather in a location (with streaming progress)',
      inputSchema: z.object({
        city: z.string(),
      }),
      async *execute({ city }) {
        yield { status: 'connecting', message: 'Connecting to weather service...' }
        await new Promise(resolve => setTimeout(resolve, 800))

        yield { status: 'fetching', message: 'Fetching weather data...', progress: 30 }
        await new Promise(resolve => setTimeout(resolve, 800))

        yield { status: 'processing', message: 'Processing data...', progress: 70 }
        await new Promise(resolve => setTimeout(resolve, 800))

        yield {
          status: 'complete',
          data: {
            city,
            temperature: Math.floor(Math.random() * 30) + 10,
            condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
            humidity: Math.floor(Math.random() * 40) + 40,
          }
        }
      },
    }),
  },
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'agent-streaming-tool',
  },
})

async function runPrompt(prompt: string) {
  const result = await agent.stream({ prompt })

  for await (const event of result.fullStream) {
    handleEvent(event)
  }

  console.log('\n')
}

async function chat() {
  await createChatLoop(runPrompt, 'Streaming Tool Agent ready. Type your message (Ctrl+C to exit):\n')
}

function handleEvent(event: TextStreamPart<typeof agent.tools>) {
  switch (event.type) {
    case 'tool-call':
      console.log(`\n[🔧 Calling tool: ${event.toolName}]`)
      console.log(`[📝 Input: ${JSON.stringify(event.input)}]`)
      break

    case 'tool-result':
      if (event.preliminary) {
        console.log(`[⏳ Progress: ${JSON.stringify(event.output)}]`)
      } else {
        console.log(`[✅ Final Result: ${JSON.stringify(event.output, null, 2)}]\n`)
      }
      break

    case 'text-delta':
      process.stdout.write(event.text)
      break

    case 'finish':
      console.log('\n[✓ Done]')
      break

    case 'error':
      console.error(`[❌ Error: ${event.error}]`)
      break
  }
}

runAgentWithArgs(runPrompt, chat)
