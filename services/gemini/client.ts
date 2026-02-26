/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";

const getClient = () => {
    // Vite uses import.meta.env for environment variables
    // @ts-ignore
    const key = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || '';
    if (!key) {
        console.warn('Gemini API key is missing. Please set it in Settings.');
    }
    return new GoogleGenAI({ apiKey: key });
};

// Use a proxy to always get a fresh client when a property is accessed
const ai = new Proxy({}, {
    get: (target, prop) => {
        const client = getClient();
        return (client as any)[prop];
    }
}) as GoogleGenAI;

export default ai;