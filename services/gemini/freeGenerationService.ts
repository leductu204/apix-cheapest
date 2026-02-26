/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { 
    callTramsangtaoService
} from './baseService';

export async function generateFreeImage(
    prompt: string,
    numberOfImages: number,
    aspectRatio: string,
    imageDataUrl1?: string,
    imageDataUrl2?: string,
    imageDataUrl3?: string,
    imageDataUrl4?: string,
    removeWatermark?: boolean
): Promise<string[]> {
    try {
        const allImageUrls = [imageDataUrl1, imageDataUrl2, imageDataUrl3, imageDataUrl4].filter(Boolean) as string[];
        const promptParts = [prompt];
        if (allImageUrls.length > 0) {
            promptParts.push('Thực hiện yêu cầu trong prompt để tạo ra một bức ảnh mới dựa trên hình ảnh đã cho.');
        }
        if (removeWatermark) {
            promptParts.push('Yêu cầu đặc biệt: Không được có bất kỳ watermark, logo, hay chữ ký nào trên ảnh kết quả.');
        }
        const fullPrompt = promptParts.join('\n');

        // TramSangTao API generation (multiple concurrent requests)
        const generatePromises: Promise<string>[] = [];
        for (let i = 0; i < numberOfImages; i++) {
            console.log(`Generating free image ${i + 1}/${numberOfImages} via TramSangTao...`);
            generatePromises.push(callTramsangtaoService(fullPrompt, allImageUrls.length > 0 ? allImageUrls : undefined, { aspect_ratio: aspectRatio }));
        }

        const results = await Promise.all(generatePromises);
        return results;

    } catch (error) {
        console.error("Error during free image generation:", error);
        throw error;
    }
}