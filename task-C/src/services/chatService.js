/**
 * Chat service using OpenAI GPT API for conversational AI
 */

class ChatService {
  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-3.5-turbo';
    this.conversationHistory = [];
  }

  /**
   * Send message to GPT and get response
   */
  async sendMessage(userMessage, conversationContext = []) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Build conversation with context
      const messages = [
        {
          role: 'system',
          content: 'You are a helpful voice companion. Keep responses concise and conversational, as they will be spoken aloud. Respond in 1-3 sentences maximum.'
        },
        ...conversationContext,
        {
          role: 'user',
          content: userMessage
        }
      ];

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          max_tokens: 150,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`GPT API error: ${error.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      const aiResponse = result.choices[0].message.content.trim();

      // Update local conversation history
      this.conversationHistory.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: aiResponse }
      );

      // Keep only last 10 messages to avoid token limits
      if (this.conversationHistory.length > 10) {
        this.conversationHistory = this.conversationHistory.slice(-10);
      }

      return aiResponse;

    } catch (error) {
      console.error('Chat service failed:', error);
      throw new Error(`Chat failed: ${error.message}`);
    }
  }

  /**
   * Get conversation history for context
   */
  getConversationHistory() {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Load conversation history from external source
   */
  loadHistory(history) {
    this.conversationHistory = history || [];
  }

  /**
   * Check if service is properly configured
   */
  isConfigured() {
    return !!this.apiKey;
  }
}

export default ChatService; 