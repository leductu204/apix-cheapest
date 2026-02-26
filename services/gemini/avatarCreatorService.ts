/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Type } from "@google/genai";
import ai from './client';
import { 
    processApiError, 
    parseDataUrl, 
    callTramsangtaoService
} from './baseService';

/**
 * Creates the primary prompt for the patriotic theme.
 * @param idea The creative idea (e.g., "Áo dài đỏ sao vàng").
 * @param customPrompt Optional additional instructions for modification.
 * @param removeWatermark A boolean to request watermark removal.
 * @param aspectRatio The target aspect ratio.
 * @returns The main prompt string.
 */
function getPrimaryPrompt(idea: string, customPrompt?: string, removeWatermark?: boolean, aspectRatio?: string): string {
    const modificationText = customPrompt ? ` Yêu cầu chỉnh sửa bổ sung: "${customPrompt}".` : '';
    const watermarkText = removeWatermark ? ' Yêu cầu quan trọng: Kết quả cuối cùng không được chứa bất kỳ watermark, logo, hay chữ ký nào.' : '';
    const aspectRatioText = (aspectRatio && aspectRatio !== 'Giữ nguyên') ? `Bức ảnh kết quả BẮT BUỘC phải có tỷ lệ khung hình chính xác là ${aspectRatio}.` : '';

    return `${aspectRatioText}\nTạo một bức ảnh chụp chân thật và tự nhiên của người trong ảnh gốc, trong bối cảnh "${idea}".${modificationText}${watermarkText} YÊU CẦU QUAN TRỌNG NHẤT: Phải giữ lại chính xác tuyệt đối 100% các đặc điểm trên khuôn mặt, đường nét, và biểu cảm của người trong ảnh gốc. Không được thay đổi hay chỉnh sửa khuôn mặt. Bức ảnh phải thể hiện được niềm tự hào dân tộc Việt Nam một cách sâu sắc. Ảnh phải có chất lượng cao, sắc nét, với tông màu đỏ của quốc kỳ làm chủ đạo nhưng vẫn giữ được sự hài hòa, tự nhiên. Tránh tạo ra ảnh theo phong cách vẽ hay hoạt hình.`;
}


/**
 * Creates a fallback prompt to use when the primary one is blocked.
 * @param idea The creative idea (e.g., "Áo dài đỏ sao vàng").
 * @param customPrompt Optional additional instructions for modification.
 * @param removeWatermark A boolean to request watermark removal.
 * @param aspectRatio The target aspect ratio.
 * @returns The fallback prompt string.
 */
function getFallbackPrompt(idea: string, customPrompt?: string, removeWatermark?: boolean, aspectRatio?: string): string {
    const modificationText = customPrompt ? ` Yêu cầu bổ sung: "${customPrompt}".` : '';
    const watermarkText = removeWatermark ? ' Yêu cầu thêm: Không có watermark, logo, hay chữ ký trên ảnh.' : '';
    const aspectRatioText = (aspectRatio && aspectRatio !== 'Giữ nguyên') ? `Bức ảnh kết quả BẮT BUỘC phải có tỷ lệ khung hình chính xác là ${aspectRatio}.` : '';

    return `${aspectRatioText}\nTạo một bức ảnh chụp chân dung của người trong ảnh này với chủ đề "${idea}".${modificationText}${watermarkText} Bức ảnh cần trông thật và tự nhiên. YÊU CẦU QUAN TRỌNG NHẤT: Phải giữ lại chính xác tuyệt đối 100% các đặc điểm trên khuôn mặt của người trong ảnh gốc. Không được thay đổi khuôn mặt.`;
}

async function analyzePatrioticConceptImage(styleImageDataUrl: string): Promise<string> {
    const { mimeType, data } = parseDataUrl(styleImageDataUrl);
    const imagePart = { inlineData: { mimeType, data } };

    const prompt = `Phân tích hình ảnh này và mô tả concept yêu nước của nó. Tập trung vào không khí, ánh sáng, bối cảnh, trang phục và các yếu tố biểu tượng. Mô tả phải phù hợp để hướng dẫn AI tái tạo một chủ đề yêu nước tương tự.`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, {text: prompt}] },
        });

        const text = response.text;
        if (!text) {
             throw new Error("AI không thể phân tích được concept từ ảnh.");
        }
        return text.trim();
    } catch (error) {
        console.error("Error in analyzePatrioticConceptImage:", error);
        throw new Error("Lỗi khi phân tích ảnh concept.");
    }
}


/**
 * Generates a patriotic-themed image from a source image and an idea.
 * It includes a fallback mechanism for prompts that might be blocked.
 * @param imageDataUrl A data URL string of the source image (e.g., 'data:image/png;base64,...').
 * @param idea The creative idea string (e.g., "Áo dài đỏ sao vàng").
 * @param customPrompt Optional additional instructions for modification.
 * @param removeWatermark Optional boolean to request watermark removal.
 * @param aspectRatio Optional target aspect ratio.
 * @param styleReferenceImageDataUrl Optional data URL for a style reference image, which overrides the 'idea'.
 * @returns A promise that resolves to a base64-encoded image data URL of the generated image.
 */
export async function generatePatrioticImage(
    imageDataUrl: string, 
    idea: string, 
    customPrompt?: string, 
    removeWatermark?: boolean, 
    aspectRatio?: string,
    styleReferenceImageDataUrl?: string | null
): Promise<string> {
    // For TramSangTao, we just use the primary prompt
    let finalIdea = idea;
    if (styleReferenceImageDataUrl) {
        finalIdea = await analyzePatrioticConceptImage(styleReferenceImageDataUrl);
    }

    try {
        console.log("Attempting generation via TramSangTao...");
        const prompt = getPrimaryPrompt(finalIdea, customPrompt, removeWatermark, aspectRatio);
        return await callTramsangtaoService(prompt, imageDataUrl, { aspect_ratio: aspectRatio });
    } catch (error) {
        console.error("Error during image generation:", error);
        throw error;
    }
}

/**
 * Analyzes a person's photo to suggest suitable concept categories.
 * @param imageDataUrl The data URL of the image to analyze.
 * @param categories The list of available categories.
 * @returns A promise resolving to an array of suggested category names.
 */
export async function analyzeAvatarForConcepts(
    imageDataUrl: string,
    categories: { category: string; ideas: string[] }[]
): Promise<string[]> {
    const { mimeType, data: base64Data } = parseDataUrl(imageDataUrl);
    const imagePart = { inlineData: { mimeType, data: base64Data } };

    const categoryNames = categories.map(c => c.category).filter(c => c !== 'Tự động' && c !== 'Automatic');

    const prompt = `Phân tích người trong ảnh được cung cấp. Dựa trên giới tính, độ tuổi biểu kiến, biểu cảm (cảm xúc), và bối cảnh chung, hãy chọn ra từ 1 đến 3 danh mục phù hợp nhất từ danh sách sau đây cho một bộ ảnh sáng tạo theo chủ đề yêu nước.

    Các danh mục có sẵn:
    ${categoryNames.join('\n')}

    Phản hồi của bạn phải là một đối tượng JSON có một khóa duy nhất "suggested_categories" là một mảng chuỗi chứa các danh mục đã chọn. Các chuỗi trong mảng phải khớp chính xác với danh sách được cung cấp.
    `;

    try {
        console.log("Analyzing avatar for concept suggestions...");
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, { text: prompt }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suggested_categories: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                        },
                    },
                    required: ["suggested_categories"],
                }
            }
        });

        const jsonText = response.text.trim();
        const parsed = JSON.parse(jsonText);
        if (parsed.suggested_categories && Array.isArray(parsed.suggested_categories)) {
            // Ensure the returned categories are valid
            const validCategories = parsed.suggested_categories.filter((cat: string) => categoryNames.includes(cat));
            if (validCategories.length > 0) {
                return validCategories;
            }
        }
        
        // Fallback if JSON is empty or invalid
        console.warn("AI returned no valid categories, using fallback.");
        const shuffled = categoryNames.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 2);

    } catch (error) {
        console.error("Error analyzing avatar for concepts:", error);
        // Fallback: return a few random categories if AI fails.
        const shuffled = categoryNames.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 2);
    }
}