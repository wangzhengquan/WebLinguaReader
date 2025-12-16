import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message } from '../types';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY is missing from environment variables");
    // Depending on app behavior, might want to throw or handle gracefully
  }
  return new GoogleGenAI({ apiKey: apiKey || 'dummy-key-for-dev' });
};

export const generateResponse = async (
  currentHistory: Message[], 
  pageContext: string,
  userPrompt: string
): Promise<string> => {
  try {
    const ai = getClient();
    
    // Construct a context-aware prompt
    // In a production app, we might use the 'systemInstruction' for the persona
    // and pass the PDF content as context in the user prompt or system prompt.
    
    const contextPrompt = `
You are a helpful PDF assistant. 
Here is the content of the current page the user is reading:
"""
${pageContext}
"""

User Question: ${userPrompt}

Answer the user's question based on the provided text. If the answer isn't in the text, state that.
    `.trim();

    // We only send the last few messages to maintain context without blowing up tokens 
    // if the conversation is long, though 2.5 Flash has a huge window.
    // For simplicity here, we are doing a single turn generation with context, 
    // but we could map history to the proper chat format.
    
    // Let's use chat mode for better conversational flow
    const chat = ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: "You are an intelligent and helpful assistant helping a user read a PDF document. Keep answers concise and relevant to the provided document context.",
      }
    });

    // We can seed history if needed, but for now, we just send the structured prompt
    const response: GenerateContentResponse = await chat.sendMessage({ 
      message: contextPrompt 
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  try {
    const ai = getClient();
    const prompt = `Translate the following text to ${targetLanguage}. \n\nText:\n"${text}"\n\nReturn ONLY the translated text without any introductory or concluding remarks.`;
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Translation failed.";
  } catch (error) {
    console.error("Translation Error:", error);
    return "Error: Could not translate text.";
  }
};