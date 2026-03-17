export const CHAT_MODELS = ['strategic', 'analytical'] as const;
export const RESPONSE_LENGTHS = ['short', 'medium', 'long'] as const;
export const THINKING_LEVELS = ['fast', 'balanced', 'deep'] as const;

export type ChatModel = typeof CHAT_MODELS[number];
export type ResponseLength = typeof RESPONSE_LENGTHS[number];
export type ThinkingLevel = typeof THINKING_LEVELS[number];

export type PrysmAskOptions = {
    chatModel: ChatModel;
    responseLength: ResponseLength;
    thinkingLevel?: ThinkingLevel;
    chatUuid?: string;
};
