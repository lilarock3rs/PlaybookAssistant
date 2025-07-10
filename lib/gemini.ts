import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { EmbeddingResponse } from '../types';

export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private embeddingModel: any;
  private chatModel: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.google.apiKey);
    this.embeddingModel = this.genAI.getGenerativeModel({ model: config.ai.embeddingModel });
    this.chatModel = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    try {
      const cleanText = this.cleanText(text);
      
      const result = await this.embeddingModel.embedContent({
        content: {
          parts: [{ text: cleanText }],
          role: 'user',
        },
      });

      return {
        embedding: result.embedding.values,
      };
    } catch (error) {
      console.error('Error generating embedding:', error);
      return {
        embedding: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async generateRecommendationReasoning(
    query: string,
    playbook: { title: string; description: string; category: string }
  ): Promise<string> {
    try {
      const prompt = `
        User Query: "${query}"
        
        Playbook:
        - Title: ${playbook.title}
        - Description: ${playbook.description}
        - Category: ${playbook.category}
        
        In 1-2 sentences, explain why this playbook is relevant to the user's query. Be specific and actionable.
      `;

      const result = await this.chatModel.generateContent({
        contents: [
          {
            parts: [{ text: prompt }],
            role: 'user',
          },
        ],
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.7,
        },
      });

      return result.response.text().trim();
    } catch (error) {
      console.error('Error generating recommendation reasoning:', error);
      return 'This playbook matches your query based on similar content and keywords.';
    }
  }

  async generateSearchSuggestions(query: string): Promise<string[]> {
    try {
      const prompt = `
        Based on this search query: "${query}"
        
        Generate 3 alternative search terms that might help find relevant playbooks.
        Return only the search terms, one per line, without numbers or bullets.
      `;

      const result = await this.chatModel.generateContent({
        contents: [
          {
            parts: [{ text: prompt }],
            role: 'user',
          },
        ],
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.8,
        },
      });

      const suggestions = result.response.text()
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .slice(0, 3);

      return suggestions;
    } catch (error) {
      console.error('Error generating search suggestions:', error);
      return [];
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?-]/g, '')
      .trim()
      .slice(0, 1000);
  }

  async categorizePlaybook(title: string, description: string, content: string): Promise<string> {
    try {
      const prompt = `
        Analyze this playbook and categorize it into one of these categories:
        - Sales
        - Marketing
        - Customer Success
        - Product
        - Engineering
        - HR
        - Operations
        - Finance
        - General
        
        Playbook:
        Title: ${title}
        Description: ${description}
        Content: ${content.slice(0, 500)}...
        
        Return only the category name.
      `;

      const result = await this.chatModel.generateContent({
        contents: [
          {
            parts: [{ text: prompt }],
            role: 'user',
          },
        ],
        generationConfig: {
          maxOutputTokens: 20,
          temperature: 0.3,
        },
      });

      const category = result.response.text().trim();
      
      const validCategories = [
        'Sales', 'Marketing', 'Customer Success', 'Product', 
        'Engineering', 'HR', 'Operations', 'Finance', 'General'
      ];
      
      return validCategories.includes(category) ? category : 'General';
    } catch (error) {
      console.error('Error categorizing playbook:', error);
      return 'General';
    }
  }
}