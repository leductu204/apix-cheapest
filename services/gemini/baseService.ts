/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import ai from './client'; // Import the shared client instance

// --- Global Configuration Store ---
interface GlobalConfig {
    modelVersion: 'v2' | 'v3';
    imageResolution: '1K' | '2K' | '4K';
}

let globalConfig: GlobalConfig = {
    modelVersion: 'v2',
    imageResolution: '1K'
};

export const setGlobalModelConfig = (version: 'v2' | 'v3', resolution: '1K' | '2K' | '4K') => {
    globalConfig = { modelVersion: version, imageResolution: resolution };
};

export const getModelConfig = () => globalConfig;

export const getTextModel = () => globalConfig.modelVersion === 'v3' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
export const getImageModel = () => globalConfig.modelVersion === 'v3' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

// --- Centralized Error Processor ---
export function processApiError(error: unknown): Error {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);

    if (errorMessage.includes('ReadableStream uploading is not supported')) {
        return new Error("Ứng dụng tạm thời chưa tương thích ứng dụng di động, mong mọi người thông cảm");
    }
    if (errorMessage.toLowerCase().includes('api key not valid')) {
        return new Error("API Key không hợp lệ. Vui lòng liên hệ quản trị viên để được hỗ trợ.");
    }
    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('resource_exhausted')) {
        return new Error("Ứng dụng tạm thời đạt giới hạn sử dụng trong ngày, hãy quay trở lại vào ngày tiếp theo.");
    }
    if (errorMessage.toLowerCase().includes('safety') || errorMessage.toLowerCase().includes('blocked')) {
        return new Error("Yêu cầu của bạn đã bị chặn vì lý do an toàn. Vui lòng thử với một hình ảnh hoặc prompt khác.");
    }
    
    // Return original Error object or a new one for other cases
    if (error instanceof Error) {
        return new Error("Đã xảy ra lỗi không mong muốn từ AI. Vui lòng thử lại sau. Chi tiết: " + error.message);
    }
    return new Error("Đã có lỗi không mong muốn từ AI: " + errorMessage);
}

/**
 * Parses a data URL string to extract its mime type and base64 data.
 * @param imageDataUrl The data URL to parse.
 * @returns An object containing the mime type and data.
 */
export function parseDataUrl(imageDataUrl: string): { mimeType: string; data: string } {
    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!match) {
        throw new Error("Invalid image data URL format. Expected 'data:image/...;base64,...'");
    }
    const [, mimeType, data] = match;
    return { mimeType, data };
}

/**
 * Processes the Gemini API response, extracting the image or throwing an error if none is found.
 * @param response The response from the generateContent call.
 * @returns A data URL string for the generated image.
 */
export function processGeminiResponse(response: GenerateContentResponse): string {
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        return `data:${mimeType};base64,${data}`;
    }

    const textResponse = response.text;
    console.error("API did not return an image. Response:", textResponse);
    throw new Error(`The AI model responded with text instead of an image: "${textResponse || 'No text response received.'}"`);
}

/**
 * A wrapper for the Gemini API call that includes a retry mechanism for internal server errors
 * and for responses that don't contain an image.
 * @param parts An array of parts for the request payload (e.g., image parts, text parts).
 * @param config Optional configuration object for the generateContent call.
 * @returns The GenerateContentResponse from the API.
 */
export async function callGeminiWithRetry(parts: object[], config: any = {}): Promise<GenerateContentResponse> {
    const maxRetries = 3;
    const initialDelay = 1000;
    let lastError: Error | null = null;

    const model = getImageModel();
    const extraConfig = globalConfig.modelVersion === 'v3' 
        ? { imageConfig: { imageSize: globalConfig.imageResolution, ...config.imageConfig } }
        : {};

    const finalConfig = {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
        ...config,
        ...extraConfig
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: { parts },
                config: finalConfig,
            });

            // Validate that the response contains an image.
            const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
            if (imagePart?.inlineData) {
                return response; // Success! The response is valid.
            }

            // If no image is found, treat it as a failure and prepare for retry.
            const textResponse = response.text || "No text response received.";
            lastError = new Error(`The AI model responded with text instead of an image: "${textResponse}"`);
            console.warn(`Attempt ${attempt}/${maxRetries}: No image returned. Retrying... Response text: ${textResponse}`);

        } catch (error) {
            const processedError = processApiError(error);
            lastError = processedError;
            const errorMessage = processedError.message;
            console.error(`Error calling Gemini API (Attempt ${attempt}/${maxRetries}):`, errorMessage);

            // Don't retry on critical errors like invalid API key or quota issues.
            if (errorMessage.includes('API Key không hợp lệ') || errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('resource_exhausted')) {
                throw processedError;
            }

            // If it's not a retriable server error and we're out of retries, fail.
            const isInternalError = errorMessage.includes('"code":500') || errorMessage.includes('INTERNAL');
            if (!isInternalError && attempt >= maxRetries) {
                throw processedError;
            }
        }
        
        // Wait before the next attempt, but not after the last one.
        if (attempt < maxRetries) {
            const delay = initialDelay * Math.pow(2, attempt - 1);
            console.log(`Waiting ${delay}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // If the loop completes without returning, all retries have failed. Throw the last error.
    throw lastError || new Error("Gemini API call failed after all retries without returning a valid image.");
}

/**
 * Takes a user's prompt and asks a generative model to expand and enrich it.
 * @param userPrompt The user's original, potentially simple, prompt.
 * @returns A promise that resolves to a more descriptive and detailed prompt string.
 */
export async function enhancePrompt(userPrompt: string): Promise<string> {
    const metaPrompt = `Bạn là một chuyên gia viết prompt cho AI tạo ảnh như Imagen. Nhiệm vụ của bạn là lấy một prompt đơn giản từ người dùng và mở rộng nó thành một prompt có độ mô tả cao và hiệu quả để tạo ra một hình ảnh tuyệt đẹp. Hãy thêm các chi tiết phong phú về phong cách, ánh sáng, bố cục, tâm trạng và các kỹ thuật nghệ thuật. Đầu ra PHẢI bằng tiếng Việt.

Prompt của người dùng: "${userPrompt}"

**Đầu ra:** Chỉ xuất ra văn bản prompt đã được tinh chỉnh, không có bất kỳ cụm từ giới thiệu nào.`;
    
    try {
        const response = await ai.models.generateContent({
            model: getTextModel(),
            contents: metaPrompt,
        });

        const text = response.text;
        if (text && text.trim()) {
            return text.trim();
        }
        // Fallback if the model returns an empty string
        return userPrompt;
    } catch (error) {
        // Process the error for logging/user feedback but return the original prompt as a safe fallback
        const processedError = processApiError(error);
        console.error("Error during prompt enhancement:", processedError);
        return userPrompt;
    }
}

// --- TramSangTao API Integration ---

const getTstKey = () => {
    // @ts-ignore
    const key = localStorage.getItem('tramsangtao_api_key') || import.meta.env.VITE_TRAMSANGTAO_API_KEY || '';
    if (!key) {
        throw new Error('Bạn chưa cấu hình TramSangTao API Key. Vui lòng vào Cài đặt (⚙️) để nhập key.');
    }
    return key;
};

const TST_BASE_URL = '/tst-api/v1';

export interface UploadedImageInfo {
    url: string;
    parsedFilename: string;
}

export async function uploadImage(imageDataUrl: string, filename: string = 'image.png'): Promise<UploadedImageInfo> {
    const { mimeType, data } = parseDataUrl(imageDataUrl);
    // Convert base64 to Blob
    const byteCharacters = atob(data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, filename);

    const response = await fetch(`${TST_BASE_URL}/files/upload/kling`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getTstKey()}`
            // Content-Type is automatically set with boundary for FormData
        },
        body: formData
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Upload ảnh lên hệ thống thất bại: ${response.status} - ${err}`);
    }

    const result = await response.json();
    const url = result.url || result.data?.url || result.data;
    const id = result.id || result.data?.id || '';
    
    // Attempt to parse extension from mimeType
    let ext = mimeType.split('/')[1] || 'png';
    if (ext === 'jpeg') ext = 'jpg';
    
    let parsedFilename = filename;
    if (id) {
        parsedFilename = `${id}.${ext}`;
    }

    return { url, parsedFilename };
}

export async function generateTramsangtaoImage(
    prompt: string, 
    opts: { img_url?: string | string[]; aspect_ratio?: string; resolution?: string } = {}
): Promise<string> {
    const model = getModelConfig().modelVersion === 'v3' ? 'nano-banana-pro' : 'nano-banana';
    
    const defaultResolution = getModelConfig().imageResolution.toLowerCase(); // '1K' -> '1k'
    
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', model);
    
    let aspectRatioToSend = opts.aspect_ratio || '1:1';
    if (aspectRatioToSend === 'Giữ nguyên' || aspectRatioToSend === 'auto') {
        aspectRatioToSend = 'auto';
    }
    formData.append('aspect_ratio', aspectRatioToSend);

    if (model !== 'nano-banana') {
        formData.append('resolution', opts.resolution || defaultResolution);
    }
    
    formData.append('speed', 'fast');

    if (opts.img_url) {
        const urls = Array.isArray(opts.img_url) ? opts.img_url : [opts.img_url];
        urls.forEach(url => formData.append('img_url', url));
    }

    const response = await fetch(`${TST_BASE_URL}/image/generate`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getTstKey()}`
            // Removing Content-Type so fetch sets the correct multipart boundary
        },
        body: formData
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Yêu cầu tạo ảnh thất bại: ${response.status} - ${err}`);
    }

    const result = await response.json();
    // According to docs, we receive {"job_id": "xxx"}
    const jobId = result.job_id || result.id;
    if (!jobId) {
        console.error("Generate API returned:", result);
        throw new Error("Không nhận được Job ID từ server.");
    }
    return jobId;
}

export async function pollJobStatus(jobId: string): Promise<string> {
    const startTime = Date.now();
    const timeout = 15 * 60 * 1000; // 15 minutes max
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < timeout) {
        const response = await fetch(`${TST_BASE_URL}/jobs/${jobId}`, {
            headers: {
                'Authorization': `Bearer ${getTstKey()}`
            }
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Lỗi kiểm tra trạng thái: ${response.status} - ${err}`);
        }

        const result = await response.json();
        const status = result.status?.toLowerCase();
        
        if (status === 'succeeded' || status === 'completed') {
            const url = result.output?.[0]?.url || result.url || result.data?.image_url || result.data?.url || result.image_url || result.result;
            if (!url) {
                console.error("Success response missing URL:", result);
                throw new Error("Tác vụ thành công nhưng không tìm thấy URL ảnh trả về.");
            }
            return url;
        } else if (status === 'failed') {
            throw new Error(`Tác vụ thất bại: ${JSON.stringify(result.error || result.message)}`);
        }

        // Delay before the next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Tác vụ vượt quá thời gian chờ (15 phút)');
}

export async function callTramsangtaoService(
    prompt: string, 
    imageDataUrl?: string | string[],
    opts?: { aspect_ratio?: string; resolution?: string; filenames?: string[] }
): Promise<string> {
    let inputImageUrls: string[] | undefined = undefined;
    let finalPrompt = prompt;
    
    // For Image-to-Image tasks, first we upload the kling image blobs
    if (imageDataUrl) {
        const dataUrls = Array.isArray(imageDataUrl) ? imageDataUrl : [imageDataUrl];
        const uploadResults = await Promise.all(
            dataUrls.map((url, i) => uploadImage(url, opts?.filenames?.[i]))
        );
        inputImageUrls = uploadResults.map(upload => upload.url);
        
        // Dynamically replace placeholders like {filename0}, {filename1} in the prompt
        // with the IDs generated by the TST server.
        uploadResults.forEach((upload, index) => {
            finalPrompt = finalPrompt.replace(new RegExp(`\\{filename${index}\\}`, 'g'), upload.parsedFilename);
        });
    }

    // Call the create API to get jobId
    const jobId = await generateTramsangtaoImage(finalPrompt, { img_url: inputImageUrls, ...opts });
    
    // Poll the status to wait for completion
    return await pollJobStatus(jobId);
}