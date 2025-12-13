import { openai } from '@ai-sdk/openai';
import { tool } from 'ai';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import { createTracedToolLoopAgent } from './lib/traced-agent';

const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  execute: async ({ location }) => {
    const temp = 15 + Math.floor(Math.random() * 20);
    const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];

    return {
      location,
      temperature: temp,
      condition,
      unit: 'celsius',
    };
  },
});

const translateTool = tool({
  description: 'Translate text to a target language',
  inputSchema: z.object({
    text: z.string(),
    targetLanguage: z.string(),
  }),
  execute: async ({ text, targetLanguage }) => {
    return {
      original: text,
      translated: `[Translated to ${targetLanguage}]: ${text}`,
      targetLanguage,
    };
  },
});

const dynamicAgent = createTracedToolLoopAgent(import.meta.url, {
  callOptionsSchema: z.object({
    model: z.custom<LanguageModel>().optional(),
    temperature: z.number().min(0).max(2).optional(),
    language: z.enum(['en', 'zh', 'ja', 'es']).optional(),
    enableTranslation: z.boolean().optional(),
    verbosity: z.enum(['brief', 'normal', 'detailed']).optional(),
  }),

  prepareCall: ({ options, prompt, ...rest }) => {
    const languageInstructions = {
      en: 'You are a helpful weather assistant. Respond in English.',
      zh: 'You are a helpful weather assistant. Respond in Traditional Chinese (繁體中文).',
      ja: 'You are a helpful weather assistant. Respond in Japanese.',
      es: 'You are a helpful weather assistant. Respond in Spanish.',
    };

    const verbosityInstructions = {
      brief: 'Be very concise and brief in your responses.',
      normal: 'Provide balanced, informative responses.',
      detailed: 'Provide detailed, comprehensive explanations.',
    };

    const language = options?.language ?? 'en';
    const verbosity = options?.verbosity ?? 'normal';

    const instructions = [
      languageInstructions[language as keyof typeof languageInstructions],
      verbosityInstructions[verbosity as keyof typeof verbosityInstructions],
    ].join(' ');

    const tools: Record<string, any> = {
      weather: weatherTool,
    };

    if (options?.enableTranslation) {
      tools.translate = translateTool;
    }

    const result: any = {
      ...rest,
      instructions,
      tools,
      temperature: options?.temperature ?? 0.7,
      prompt,
    };

    if (options?.model) {
      result.model = options.model;
    }

    return result;
  },

  onStepFinish: ({ request, usage }) => {
    console.log('\n--- Step Finished ---');
    const body = request.body as { model?: string; temperature?: number };
    console.log('Model:', body.model);
    console.log('Temperature:', body.temperature);
    console.log('Tokens used:', usage?.totalTokens);
  },
});

async function main() {
  console.log('='.repeat(60));
  console.log('🤖 Dynamic Agent Configuration Example');
  console.log('='.repeat(60));

  console.log('\n📍 Scenario 1: English, Brief');
  console.log('-'.repeat(60));
  const result1 = await dynamicAgent.stream({
    prompt: "What's the weather like in Tokyo?",
    options: {
      language: 'en' as const,
      verbosity: 'brief' as const,
      temperature: 0.5,
    },
  } as any);

  for await (const chunk of result1.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\n');

  console.log('\n📍 Scenario 2: Chinese, Detailed, With Translation');
  console.log('-'.repeat(60));
  const result2 = await dynamicAgent.stream({
    prompt: "What's the weather in Paris and London?",
    options: {
      language: 'zh' as const,
      verbosity: 'detailed' as const,
      enableTranslation: true,
      temperature: 0.8,
    },
  } as any);

  for await (const chunk of result2.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\n');

  console.log('\n📍 Scenario 3: Using GPT-4o (Smarter Model)');
  console.log('-'.repeat(60));
  const result3 = await dynamicAgent.stream({
    prompt: 'Compare the weather patterns in San Francisco and New York',
    options: {
      model: openai('gpt-4o'),
      language: 'en' as const,
      verbosity: 'detailed' as const,
      temperature: 0.3,
    },
  } as any);

  for await (const chunk of result3.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\n');

  console.log('='.repeat(60));
  console.log('✅ All scenarios completed!');
  console.log('='.repeat(60));
}

main().catch(console.error);
