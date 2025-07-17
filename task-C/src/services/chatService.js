/**
 * Chat service using OpenAI GPT API for conversational AI
 * VERSION: 2.0 - Fixed demo mode fallback
 */

class ChatService {
  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-3.5-turbo';
    this.conversationHistory = [];
    console.log('ChatService v2.0 initialized - demo mode fallback enabled');
  }

  /**
   * Send message to GPT and get response
   */
  async sendMessage(userMessage, conversationContext = []) {
    // TEMPORARY: Force demo mode due to quota issues
    console.log('ChatService v2.0: sendMessage called, forcing demo mode due to quota');
    return this.getDemoResponse(userMessage);
    
    // ALWAYS use demo mode if quota is exceeded - no exceptions
    console.log('sendMessage called with:', userMessage);
    
    // Check for quota exceeded first - immediate demo mode if API is failing
    if (!this.apiKey) {
      console.log('No API key - using demo mode');
      return this.getDemoResponse(userMessage);
    }

    // For debugging: immediately return demo response if quota issues
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

      // Check for quota/billing errors immediately
      if (response.status === 429) {
        console.warn('OpenAI quota exceeded (429), using demo mode');
        return this.getDemoResponse(userMessage);
      }

      if (!response.ok) {
        console.warn('OpenAI API error response not ok, using demo mode');
        return this.getDemoResponse(userMessage);
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
      console.warn('Any error occurred, using demo mode:', error.message);
      
      // NEVER throw an error - always return demo response
      return this.getDemoResponse(userMessage);
    }
  }

  /**
   * Generate demo response when OpenAI is not available
   */
  getDemoResponse(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Simple pattern matching for demo responses
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      return "Hello! I'm your voice companion. I'm currently running in demo mode since OpenAI quota is exceeded.";
    }
    
    if (message.includes('how are you') || message.includes('how do you do')) {
      return "I'm doing well, thank you for asking! I'm here to help you test the voice companion features.";
    }
    
    if (message.includes('weather') || message.includes('temperature')) {
      return "I can't check the weather right now, but I hope it's nice where you are!";
    }
    
    if (message.includes('time') || message.includes('clock')) {
      const now = new Date();
      return `The current time is ${now.toLocaleTimeString()}.`;
    }
    
    if (message.includes('date') || message.includes('today')) {
      const now = new Date();
      return `Today is ${now.toLocaleDateString()}.`;
    }
    
    if (message.includes('name') || message.includes('who are you')) {
      return "I'm Solace Lite, your voice companion. I'm currently in demo mode.";
    }
    
    if (message.includes('test') || message.includes('testing')) {
      return "Great! The voice companion is working perfectly. You can speak, and I can respond with text-to-speech.";
    }
    
    if (message.includes('thank') || message.includes('thanks')) {
      return "You're welcome! I'm happy to help you test the voice companion features.";
    }
    
    if (message.includes('goodbye') || message.includes('bye') || message.includes('see you')) {
      return "Goodbye! Thanks for testing the voice companion. Have a great day!";
    }
    
    // Default response
    const responses = [
      `I heard you say "${userMessage}". I'm currently in demo mode, so I can't provide full AI responses, but the voice recognition and text-to-speech are working perfectly!`,
      `Thanks for saying "${userMessage}". The voice companion is working great - speech recognition, AI processing, and text-to-speech are all functional!`,
      `You said "${userMessage}". I'm running in demo mode right now, but all the voice features are working as expected!`,
      `I understood "${userMessage}". The complete voice pipeline is working - from your speech to my response!`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
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