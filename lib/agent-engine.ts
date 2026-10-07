import { ai, ThinkingLevel } from './gemini';
import { Agent, ChatMessage } from './types';
import { getToolDeclarations, executeToolCall } from './tools/registry';
import { DatabaseStore } from './db/store';
import { ModelRouter } from './providers/router';

export interface ChatEngineOptions {
  agent: Agent;
  message: string;
  conversationId?: string;
  projectId: string;
  apiKeyId?: string;
  userId?: string;
  overrideThinkingLevel?: 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF';
  overrideModel?: string;
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
}

export class AgentEngine {
  private static async resolveSystemInstruction(agent: Agent, userId?: string): Promise<string> {
    const base = agent.system_instructions || '';
    if (!userId || agent.memory_enabled === false) return base;
    const owner = await DatabaseStore.getUserById(userId);
    if (owner?.preferences?.memory_enabled === false) return base;
    const memories = await DatabaseStore.listUserMemories(userId);
    if (!memories.length) return base;
    const notes = memories
      .slice(0, 12)
      .map((m) => `- ${m.content}`)
      .join('\n');
    return `${base}\n\nUser memory notes (private to this user):\n${notes}`;
  }

  /**
   * Standard Unary Chat Execution
   */
  static async executeChat(options: ChatEngineOptions): Promise<ChatEngineResult> {
    const startTime = Date.now();
    const { agent, message, projectId, apiKeyId } = options;
    const systemInstruction = await AgentEngine.resolveSystemInstruction(agent, options.userId);

    // Resolve or create conversation
    const conversation = await DatabaseStore.getOrCreateConversation(
      options.conversationId,
      projectId,
      agent.id,
      message.slice(0, 40),
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

    // Persist user prompt
    await DatabaseStore.saveMessage(conversation.id, 'user', message);

    // Determine model and thinking level
    const modelToUse = options.overrideModel || agent.model || 'gemini-3.8-flash';
    const providerId = agent.provider_id || 'gemini';
    const useExternalProvider =
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
      messagesForPayload.push({
        role: 'user' as const,
        content: message,
      });

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
        const response = await ModelRouter.generate(providerId, params, agent.fallback_provider_id);
        const finalResponseText = response.text || '';
        const latencyMs = Date.now() - startTime;
        const promptTokens = response.usage?.promptTokens || Math.ceil(message.length / 4) + 60;
        const candidateTokens = response.usage?.candidateTokens || Math.ceil(finalResponseText.length / 4);
        const totalTokens = promptTokens + candidateTokens;

        // Save model reply to conversation
        await DatabaseStore.saveMessage(
          conversation.id,
          'model',
          finalResponseText,
          [],
          [],
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
          model: modelToUse,
        };
      } catch (err: any) {
        // Fallback option if Fallback Provider is configured
        if (agent.fallback_provider_id && agent.fallback_provider_id !== providerId) {
          console.warn(`Primary provider ${providerId} failed, attempting fallback to ${agent.fallback_provider_id}`);
          const fallbackModel = agent.fallback_model || agent.model || 'gemini-3.8-flash';
          return await AgentEngine.executeChat({
            ...options,
            overrideModel: fallbackModel,
            agent: {
              ...agent,
              provider_id: agent.fallback_provider_id,
              fallback_provider_id: undefined, // Prevent loops
            }
          });
        }

        const latencyMs = Date.now() - startTime;
        const errorMessage = err.message || 'API Error';

        await DatabaseStore.logUsage({
          project_id: projectId,
          agent_id: agent.id,
          api_key_id: apiKeyId || null,
          user_id: options.userId || null,
          endpoint: '/api/v1/chat',
          model: modelToUse,
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

    // Build Gemini contents array
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{ text?: string }>;
    }> = [];

    // Append prior history (limit last 20 messages for context safety)
    const recentHistory = historyMessages.slice(-20);
    for (const h of recentHistory) {
      if (h.role === 'user' || h.role === 'model') {
        contents.push({
          role: h.role,
          parts: [{ text: h.content }],
        });
      }
    }

    // Append current prompt
    contents.push({
      role: 'user',
      parts: [{ text: message }],
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
      };
    } catch (err: unknown) {
      if (agent.fallback_provider_id && agent.fallback_provider_id !== providerId) {
        const fallbackModel = agent.fallback_model || agent.model || 'gemini-3.8-flash';
        return await AgentEngine.executeChat({
          ...options,
          overrideModel: fallbackModel,
          agent: {
            ...agent,
            provider_id: agent.fallback_provider_id,
            fallback_provider_id: undefined,
          },
        });
      }
      const latencyMs = Date.now() - startTime;
      const errorMessage = (err as Error).message || 'Gemini API Error';

      await DatabaseStore.logUsage({
        project_id: projectId,
        agent_id: agent.id,
        api_key_id: apiKeyId || null,
        user_id: options.userId || null,
        endpoint: '/api/v1/chat',
        model: modelToUse,
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
    const systemInstruction = await AgentEngine.resolveSystemInstruction(agent, options.userId);

    const conversation = await DatabaseStore.getOrCreateConversation(
      options.conversationId,
      projectId,
      agent.id,
      message.slice(0, 40),
      options.userId
    );

    let historyMessages: ChatMessage[] = [];
    if (agent.memory_enabled) {
      const convData = await DatabaseStore.getConversation(conversation.id);
      if (convData) {
        historyMessages = convData.messages;
      }
    }

    await DatabaseStore.saveMessage(conversation.id, 'user', message);

    const modelToUse = options.overrideModel || agent.model || 'gemini-3.8-flash';
    const providerId = agent.provider_id || 'gemini';
    const useExternalProvider =
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
      messagesForPayload.push({
        role: 'user' as const,
        content: message,
      });

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
        const stream = await ModelRouter.generateStream(providerId, params, agent.fallback_provider_id);
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
                    model: modelToUse,
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
                      // Skip comment rows or malformed chunks
                    }
                  }
                }
              }

              const promptTokens = Math.ceil(message.length / 4) + 60;
              const candidateTokens = Math.ceil(accumulatedText.length / 4);
              const totalTokens = promptTokens + candidateTokens;
              const latencyMs = Date.now() - startTimeStream;

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
        // Fallback for stream
        if (agent.fallback_provider_id && agent.fallback_provider_id !== providerId) {
          console.warn(`Primary streaming provider ${providerId} failed, attempting fallback to ${agent.fallback_provider_id}`);
          const fallbackModel = agent.fallback_model || agent.model || 'gemini-3.8-flash';
          return await AgentEngine.executeChatStream({
            ...options,
            overrideModel: fallbackModel,
            agent: {
              ...agent,
              provider_id: agent.fallback_provider_id,
              fallback_provider_id: undefined,
            }
          });
        }
        throw err;
      }
    }

    const isProModel = modelToUse.includes('pro');
    const thinkingLevelSetting = options.overrideThinkingLevel || agent.thinking_level || 'OFF';
    const isHighThinking = isProModel && thinkingLevelSetting === 'HIGH';

    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{ text?: string }>;
    }> = [];

    for (const h of historyMessages.slice(-20)) {
      if (h.role === 'user' || h.role === 'model') {
        contents.push({ role: h.role, parts: [{ text: h.content }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

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
