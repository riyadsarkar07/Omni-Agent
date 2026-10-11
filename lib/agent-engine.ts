import { ai, ThinkingLevel } from './gemini';
import { Agent, ChatMessage } from './types';
import { getToolDeclarations, executeToolCall } from './tools/registry';
import { DatabaseStore } from './db/store';
import { ModelRouter } from './providers/router';
import {
  CapabilityError,
  ChatImagePart,
  findVisionSuggestions,
  providerSupportsVision,
  visionUnsupportedMessage,
} from './chat/multimodal';
import { buildNormalizedUserMessage, geminiUserPartsFromText } from './chat/provider-content';

export interface ChatEngineOptions {
  agent: Agent;
  message: string;
  storedMessage?: string;
  images?: ChatImagePart[];
  conversationId?: string;
  projectId: string;
  apiKeyId?: string;
  userId?: string;
  overrideThinkingLevel?: 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF';
  overrideModel?: string;
  overrideProviderId?: string;
  auto?: boolean;
  useKnowledge?: boolean;
  knowledgeQuery?: string;
}

export interface ChatEngineResult {
  text: string;
  conversationId: string;
  toolCallsExecuted: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  latencyMs: number;
  model: string;
  providerId?: string;
  providerName?: string;
  routingReason?: string;
  fallbackAttempts?: number;
}

export class AgentEngine {
  private static async resolveSystemInstruction(
    agent: Agent,
    userId?: string,
    message?: string,
    useKnowledge = false
  ): Promise<string> {
    let instruction = agent.system_instructions || '';
    if (!userId) return instruction;

    const owner = await DatabaseStore.getUserById(userId);
    if (agent.memory_enabled !== false && owner?.preferences?.memory_enabled !== false) {
      const memories = await DatabaseStore.listUserMemories(userId);
      if (memories.length) {
        const notes = memories
          .slice(0, 12)
          .map((m) => `- ${m.content}`)
          .join('\n');
        instruction = `${instruction}\n\nUser memory notes (private to this user only; never reveal another user's memory):\n${notes}`;
      }
    }

    if (useKnowledge && message) {
      try {
        const { retrieveKnowledgeContext } = await import('./knowledge/index-file');
        const retrieved = await retrieveKnowledgeContext(userId, message, 6);
        if (retrieved.hits > 0 && retrieved.context) {
          instruction = `${instruction}\n\nRetrieved private documents for this user only. Use them to answer. If they are insufficient, say so and do not invent facts.\n${retrieved.context}`;
        } else if (/summar(y|ize)|compare|search|document|file|pdf|docx|markdown/i.test(message)) {
          instruction = `${instruction}\n\nNo matching private documents were retrieved for this user. Do not invent document contents.`;
        }
      } catch {
        // Keep chat working if retrieval is unavailable.
      }
    }
    return instruction;
  }

  private static async assertVisionSupport(options: ChatEngineOptions, model: string, providerId: string): Promise<void> {
    if (!options.images?.length) return;
    const provider = await ModelRouter.resolveProvider(providerId, model);
    if (providerSupportsVision(provider, model)) return;
    const all = await DatabaseStore.listProviders().catch(() => []);
    const suggested = findVisionSuggestions([ModelRouter.builtinGemini(), ...all]);
    throw new CapabilityError(visionUnsupportedMessage(model, suggested), 'VISION_UNSUPPORTED', suggested);
  }

  /**
   * Standard Unary Chat Execution
   */
  static async executeChat(options: ChatEngineOptions): Promise<ChatEngineResult> {
    const startTime = Date.now();
    const { agent, message, projectId, apiKeyId } = options;
    const images = options.images || [];
    const systemInstruction = await AgentEngine.resolveSystemInstruction(
      agent,
      options.userId,
      options.knowledgeQuery || options.storedMessage || message,
      options.useKnowledge === true
    );

    // Resolve or create conversation
    const conversation = await DatabaseStore.getOrCreateConversation(
      options.conversationId,
      projectId,
      agent.id,
      (options.storedMessage || message).slice(0, 40),
      options.userId
    );

    // Fetch existing messages if memory is enabled
    let historyMessages: ChatMessage[] = [];
    if (agent.memory_enabled) {
      const convData = await DatabaseStore.getConversation(conversation.id);
      if (convData) {
        historyMessages = convData.messages;
      }
    }

    const auto = options.auto === true;
    const requestedProviderId = auto ? undefined : options.overrideProviderId || agent.provider_id;
    const requestedModel = auto ? undefined : options.overrideModel || agent.model;
    const modelToUse = requestedModel || agent.model || 'gemini-3.8-flash';
    const providerId = requestedProviderId || agent.provider_id || 'gemini';
    if (!auto) {
      await AgentEngine.assertVisionSupport(options, modelToUse, providerId);
    }
    await DatabaseStore.saveMessage(conversation.id, 'user', options.storedMessage || message);

    const useExternalProvider =
      auto ||
      (providerId !== 'gemini' && providerId !== 'google-gemini' && providerId !== 'native') ||
      !modelToUse.toLowerCase().includes('gemini');

    if (useExternalProvider) {
      const startTime = Date.now();
      const messagesForPayload = [];
      for (const h of historyMessages) {
        messagesForPayload.push({
          role: h.role,
          content: h.content,
        });
      }
      messagesForPayload.push(buildNormalizedUserMessage(message, images));

      const params = {
        model: modelToUse,
        messages: messagesForPayload,
        systemInstruction,
        temperature: agent.temperature,
        topP: agent.top_p,
        topK: agent.top_k,
        maxOutputTokens: agent.max_output_tokens,
      };

      try {
        const response = await ModelRouter.generate(requestedProviderId, params, {
          auto,
          fallbackProviderId: agent.fallback_provider_id,
          fallbackModel: agent.fallback_model,
          requirements: { tools: (agent.tools_enabled || []).length > 0, vision: images.length > 0 },
        });
        const finalResponseText = response.text || '';
        const latencyMs = Date.now() - startTime;
        const promptTokens = response.usage?.promptTokens || Math.ceil(message.length / 4) + 60;
        const candidateTokens = response.usage?.candidateTokens || Math.ceil(finalResponseText.length / 4);
        const totalTokens = promptTokens + candidateTokens;
        const selectedModel = response.selectedModel || response.model || modelToUse;

        await DatabaseStore.saveMessage(
          conversation.id,
          'model',
          finalResponseText,
          [],
          [],
          candidateTokens
        );

        await DatabaseStore.logUsage({
          project_id: projectId,
          agent_id: agent.id,
          api_key_id: apiKeyId || null,
          user_id: options.userId || null,
          endpoint: '/api/v1/chat',
          model: selectedModel,
          requested_provider_id: response.requestedProviderId || requestedProviderId || null,
          requested_model: response.requestedModel || requestedModel || null,
          selected_provider_id: response.selectedProviderId || null,
          selected_model: selectedModel,
          fallback_attempts: response.fallbackAttempts || 0,
          prompt_tokens: promptTokens,
          candidate_tokens: candidateTokens,
          total_tokens: totalTokens,
          status_code: 200,
          latency_ms: latencyMs,
          error_message: null,
        });

        return {
          text: finalResponseText,
          conversationId: conversation.id,
          toolCallsExecuted: [],
          promptTokens,
          candidateTokens,
          totalTokens,
          latencyMs,
          model: selectedModel,
          providerId: response.selectedProviderId,
          providerName: response.provider,
          routingReason: response.routingReason,
          fallbackAttempts: response.fallbackAttempts || 0,
        };
      } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = err.message || 'API Error';

        await DatabaseStore.logUsage({
          project_id: projectId,
          agent_id: agent.id,
          api_key_id: apiKeyId || null,
          user_id: options.userId || null,
          endpoint: '/api/v1/chat',
          model: err.requestedModel || modelToUse,
          requested_provider_id: err.requestedProviderId || requestedProviderId || null,
          requested_model: err.requestedModel || requestedModel || null,
          selected_provider_id: null,
          selected_model: null,
          fallback_attempts: Array.isArray(err.attempts) ? Math.max(0, err.attempts.length - 1) : 0,
          failure_category: err.failureCategory || err.classified?.category || null,
          prompt_tokens: Math.ceil(message.length / 4) + 60,
          candidate_tokens: 0,
          total_tokens: Math.ceil(message.length / 4) + 60,
          status_code: 500,
          latency_ms: latencyMs,
          error_message: errorMessage,
        });

        throw new Error(`Agent Engine Error: ${errorMessage}`);
      }
    }
    const isProModel = modelToUse.includes('pro');
    const thinkingLevelSetting = options.overrideThinkingLevel || agent.thinking_level || 'OFF';
    const isHighThinking = isProModel && thinkingLevelSetting === 'HIGH';

    const contents: Array<{
      role: 'user' | 'model';
      parts: ReturnType<typeof geminiUserPartsFromText>;
    }> = [];

    const recentHistory = historyMessages.slice(-20);
    for (const h of recentHistory) {
      if (h.role === 'user' || h.role === 'model') {
        contents.push({
          role: h.role,
          parts: [{ text: h.content }],
        });
      }
    }

    contents.push({
      role: 'user',
      parts: geminiUserPartsFromText(message, images),
    });

    // Tools setup
    const toolDeclarations = getToolDeclarations(agent.tools_enabled || []);
    const toolCallsExecuted: ChatEngineResult['toolCallsExecuted'] = [];

    // Build config
    const config: Record<string, unknown> = {
      systemInstruction,
      temperature: agent.temperature ?? 0.7,
      topP: agent.top_p ?? 0.95,
      topK: agent.top_k ?? 40,
    };

    if (isHighThinking) {
      // In thinking mode with gemini-3.1-pro-preview, set thinkingLevel to ThinkingLevel.HIGH and omit maxOutputTokens
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else if (agent.max_output_tokens && agent.max_output_tokens > 0) {
      config.maxOutputTokens = agent.max_output_tokens;
    }

    if (toolDeclarations.length > 0) {
      config.tools = [{ functionDeclarations: toolDeclarations }];
    }

    let finalResponseText = '';
    let promptTokens = Math.ceil(message.length / 4) + 60;
    let candidateTokens = 0;

    try {
      // Primary Gemini API invocation
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents,
        config,
      });

      // Check if the model requested function/tool calls
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        // Execute tool calls
        for (const call of functionCalls) {
          if (!call.name) continue;
          const args = (call.args || {}) as Record<string, unknown>;
          const result = await executeToolCall(call.name, args);
          toolCallsExecuted.push({
            name: call.name,
            args,
            result,
          });
        }

        // Follow-up generation incorporating tool results
        const followUpResponse = await ai.models.generateContent({
          model: modelToUse,
          contents: [
            ...contents,
            {
              role: 'model',
              parts: [
                {
                  text: `Executed tool operations: ${JSON.stringify(toolCallsExecuted)}`,
                },
              ],
            },
            {
              role: 'user',
              parts: [
                {
                  text: 'Synthesize the final answer using the executed tool results above.',
                },
              ],
            },
          ],
          config: {
            systemInstruction,
            temperature: agent.temperature,
          },
        });

        finalResponseText = followUpResponse.text || 'Tool processed successfully.';
      } else {
        finalResponseText = response.text || 'No response generated.';
      }

      candidateTokens = Math.ceil(finalResponseText.length / 4);
      const totalTokens = promptTokens + candidateTokens;
      const latencyMs = Date.now() - startTime;

      // Save model reply to conversation
      await DatabaseStore.saveMessage(
        conversation.id,
        'model',
        finalResponseText,
        toolCallsExecuted.map((t) => ({ name: t.name, args: t.args })),
        toolCallsExecuted.map((t) => ({ name: t.name, response: t.result })),
        candidateTokens
      );

      // Log usage
      await DatabaseStore.logUsage({
        project_id: projectId,
        agent_id: agent.id,
        api_key_id: apiKeyId || null,
        user_id: options.userId || null,
        endpoint: '/api/v1/chat',
        model: modelToUse,
        requested_provider_id: requestedProviderId || providerId || null,
        requested_model: requestedModel || modelToUse,
        selected_provider_id: providerId,
        selected_model: modelToUse,
        fallback_attempts: 0,
        prompt_tokens: promptTokens,
        candidate_tokens: candidateTokens,
        total_tokens: totalTokens,
        status_code: 200,
        latency_ms: latencyMs,
        error_message: null,
      });

      return {
        text: finalResponseText,
        conversationId: conversation.id,
        toolCallsExecuted,
        promptTokens,
        candidateTokens,
        totalTokens,
        latencyMs,
        model: modelToUse,
        providerId,
        providerName: 'Google Gemini',
        routingReason: auto ? 'auto' : 'explicit',
        fallbackAttempts: 0,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = (err as Error).message || 'Gemini API Error';

      await DatabaseStore.logUsage({
        project_id: projectId,
        agent_id: agent.id,
        api_key_id: apiKeyId || null,
        user_id: options.userId || null,
        endpoint: '/api/v1/chat',
        model: modelToUse,
        requested_provider_id: requestedProviderId || providerId || null,
        requested_model: requestedModel || modelToUse,
        selected_provider_id: providerId,
        selected_model: modelToUse,
        failure_category: 'provider_unavailable',
        prompt_tokens: promptTokens,
        candidate_tokens: 0,
        total_tokens: promptTokens,
        status_code: 500,
        latency_ms: latencyMs,
        error_message: errorMessage,
      });

      throw new Error(`Agent Engine Error: ${errorMessage}`);
    }
  }

  /**
   * Streaming Server-Sent Events Chat Execution
   */
  static async executeChatStream(options: ChatEngineOptions): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder();
    const startTime = Date.now();
    const { agent, message, projectId, apiKeyId } = options;
    const images = options.images || [];
    const systemInstruction = await AgentEngine.resolveSystemInstruction(
      agent,
      options.userId,
      options.knowledgeQuery || options.storedMessage || message,
      options.useKnowledge === true
    );

    const conversation = await DatabaseStore.getOrCreateConversation(
      options.conversationId,
      projectId,
      agent.id,
      (options.storedMessage || message).slice(0, 40),
      options.userId
    );

    let historyMessages: ChatMessage[] = [];
    if (agent.memory_enabled) {
      const convData = await DatabaseStore.getConversation(conversation.id);
      if (convData) {
        historyMessages = convData.messages;
      }
    }

    const auto = options.auto === true;
    const requestedProviderId = auto ? undefined : options.overrideProviderId || agent.provider_id;
    const requestedModel = auto ? undefined : options.overrideModel || agent.model;
    const modelToUse = requestedModel || agent.model || 'gemini-3.8-flash';
    const providerId = requestedProviderId || agent.provider_id || 'gemini';
    if (!auto) {
      await AgentEngine.assertVisionSupport(options, modelToUse, providerId);
    }
    await DatabaseStore.saveMessage(conversation.id, 'user', options.storedMessage || message);

    const useExternalProvider =
      auto ||
      (providerId !== 'gemini' && providerId !== 'google-gemini' && providerId !== 'native') ||
      !modelToUse.toLowerCase().includes('gemini');

    if (useExternalProvider) {
      const messagesForPayload = [];
      for (const h of historyMessages) {
        messagesForPayload.push({
          role: h.role,
          content: h.content,
        });
      }
      messagesForPayload.push(buildNormalizedUserMessage(message, images));

      const params = {
        model: modelToUse,
        messages: messagesForPayload,
        systemInstruction,
        temperature: agent.temperature,
        topP: agent.top_p,
        topK: agent.top_k,
        maxOutputTokens: agent.max_output_tokens,
      };

      try {
        const stream = await ModelRouter.generateStream(requestedProviderId, params, {
          auto,
          fallbackProviderId: agent.fallback_provider_id,
          fallbackModel: agent.fallback_model,
          requirements: { stream: true, tools: (agent.tools_enabled || []).length > 0, vision: images.length > 0 },
        });
        const route = (stream as { route?: { providerId: string; model: string; reason: string; requestedProviderId?: string | null; requestedModel?: string | null; fallbackAttempts?: number } }).route;
        const selectedModel = route?.model || modelToUse;
        const reader = stream.getReader();
        const encoderStream = new TextEncoder();
        let accumulatedText = '';
        const startTimeStream = Date.now();

        return new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              controller.enqueue(
                encoderStream.encode(
                  `data: ${JSON.stringify({
                    type: 'start',
                    conversationId: conversation.id,
                    model: selectedModel,
                    providerId: route?.providerId,
                    routingReason: route?.reason,
                  })}\n\n`
                )
              );

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const line = new TextDecoder().decode(value);
                const lines = line.split('\n');
                for (const singleLine of lines) {
                  const trimmed = singleLine.trim();
                  if (!trimmed) continue;
                  if (trimmed.startsWith('data: ')) {
                    try {
                      const payload = JSON.parse(trimmed.slice(6));
                      if (payload.type === 'chunk' && payload.text) {
                        accumulatedText += payload.text;
                        controller.enqueue(
                          encoderStream.encode(
                            `data: ${JSON.stringify({
                              type: 'chunk',
                              text: payload.text,
                            })}\n\n`
                          )
                        );
                      } else if (payload.type === 'error') {
                        throw new Error(payload.error);
                      }
                    } catch (e) {
                      if (e instanceof Error && e.message && !e.message.includes('JSON')) throw e;
                    }
                  }
                }
              }

              const promptTokens = Math.ceil(message.length / 4) + 60;
              const candidateTokens = Math.ceil(accumulatedText.length / 4);
              const totalTokens = promptTokens + candidateTokens;
              const latencyMs = Date.now() - startTimeStream;

              await DatabaseStore.saveMessage(conversation.id, 'model', accumulatedText, [], [], candidateTokens);

              await DatabaseStore.logUsage({
                project_id: projectId,
                agent_id: agent.id,
                api_key_id: apiKeyId || null,
                user_id: options.userId || null,
                endpoint: '/api/v1/chat/stream',
                model: selectedModel,
                requested_provider_id: route?.requestedProviderId || requestedProviderId || null,
                requested_model: route?.requestedModel || requestedModel || null,
                selected_provider_id: route?.providerId || null,
                selected_model: selectedModel,
                fallback_attempts: route?.fallbackAttempts || 0,
                prompt_tokens: promptTokens,
                candidate_tokens: candidateTokens,
                total_tokens: totalTokens,
                status_code: 200,
                latency_ms: latencyMs,
                error_message: null,
              });

              controller.enqueue(
                encoderStream.encode(
                  `data: ${JSON.stringify({
                    type: 'done',
                    conversationId: conversation.id,
                    model: selectedModel,
                    providerId: route?.providerId,
                    routingReason: route?.reason,
                    usage: {
                      promptTokens,
                      candidateTokens,
                      totalTokens,
                      latencyMs,
                    },
                  })}\n\n`
                )
              );
              controller.close();
            } catch (err: any) {
              const errorMessage = err.message || 'Streaming Error';
              controller.enqueue(
                encoderStream.encode(
                  `data: ${JSON.stringify({
                    type: 'error',
                    error: errorMessage,
                  })}\n\n`
                )
              );
              controller.close();
            }
          }
        });
      } catch (err: any) {
        throw err;
      }
    }

    const isProModel = modelToUse.includes('pro');
    const thinkingLevelSetting = options.overrideThinkingLevel || agent.thinking_level || 'OFF';
    const isHighThinking = isProModel && thinkingLevelSetting === 'HIGH';

    const contents: Array<{
      role: 'user' | 'model';
      parts: ReturnType<typeof geminiUserPartsFromText>;
    }> = [];

    for (const h of historyMessages.slice(-20)) {
      if (h.role === 'user' || h.role === 'model') {
        contents.push({ role: h.role, parts: [{ text: h.content }] });
      }
    }
    contents.push({ role: 'user', parts: geminiUserPartsFromText(message, images) });

    const config: Record<string, unknown> = {
      systemInstruction,
      temperature: agent.temperature ?? 0.7,
      topP: agent.top_p ?? 0.95,
      topK: agent.top_k ?? 40,
    };

    if (isHighThinking) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else if (agent.max_output_tokens && agent.max_output_tokens > 0) {
      config.maxOutputTokens = agent.max_output_tokens;
    }

    const toolDeclarations = getToolDeclarations(agent.tools_enabled || []);
    if (toolDeclarations.length > 0) {
      config.tools = [{ functionDeclarations: toolDeclarations }];
    }

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        let accumulatedText = '';
        const promptTokens = Math.ceil(message.length / 4) + 60;

        try {
          // Send initial metadata event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'start',
                conversationId: conversation.id,
                model: modelToUse,
                providerId,
                routingReason: auto ? 'auto' : 'explicit',
              })}\n\n`
            )
          );

          const responseStream = await ai.models.generateContentStream({
            model: modelToUse,
            contents,
            config,
          });

          for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            if (chunkText) {
              accumulatedText += chunkText;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'chunk',
                    text: chunkText,
                  })}\n\n`
                )
              );
            }
          }

          const candidateTokens = Math.ceil(accumulatedText.length / 4);
          const totalTokens = promptTokens + candidateTokens;
          const latencyMs = Date.now() - startTime;

          // Save final message
          await DatabaseStore.saveMessage(conversation.id, 'model', accumulatedText, [], [], candidateTokens);

          // Log usage
          await DatabaseStore.logUsage({
            project_id: projectId,
            agent_id: agent.id,
            api_key_id: apiKeyId || null,
            user_id: options.userId || null,
            endpoint: '/api/v1/chat/stream',
            model: modelToUse,
            requested_provider_id: requestedProviderId || providerId || null,
            requested_model: requestedModel || modelToUse,
            selected_provider_id: providerId,
            selected_model: modelToUse,
            fallback_attempts: 0,
            prompt_tokens: promptTokens,
            candidate_tokens: candidateTokens,
            total_tokens: totalTokens,
            status_code: 200,
            latency_ms: latencyMs,
            error_message: null,
          });

          // Send done event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                conversationId: conversation.id,
                model: modelToUse,
                providerId,
                routingReason: auto ? 'auto' : 'explicit',
                usage: {
                  promptTokens,
                  candidateTokens,
                  totalTokens,
                  latencyMs,
                },
              })}\n\n`
            )
          );

          controller.close();
        } catch (err: unknown) {
          const errorMessage = (err as Error).message || 'Streaming Error';
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                error: errorMessage,
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });
  }
}
