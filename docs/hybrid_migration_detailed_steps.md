# Chi Tiết Từng Bước Chuyển Đổi Tới Kiến Trúc Hybrid (Gemini + TramSangTao)

Tài liệu này cung cấp hướng dẫn ở mức độ **cực kỳ chi tiết (mức độ Code Diffs)**, bóc tách cụ thể từng file, từng dòng code đã thay đổi từ quá khứ (khi gọi `ai.models.generateContent` của Gemini để vẽ ảnh) cho tới hiện tại (gọi qua API Kling của `tramsangtao.com`).

---

## 1. Mở Rộng Storage Cho API Key Mới
Trước đây, ứng dụng cấu hình duy nhất 1 key trong file `.env`. Giờ đây, chúng ta tách bạch LLM Key và Render Key để linh hoạt.

### 1.1 Thêm Storage tại `src/contexts/uiContexts.tsx`
**Mục tiêu:** Tạo interface để toàn bộ app gọi API Key của TramSangTao theo thứ tự ưu tiên: UI Nhập -> Biến môi trường.
```typescript
// THÊM MỚI: 
export const getTramsangtaoApiKey = () => {
  return localStorage.getItem('tramsangtao_api_key') || import.meta.env.VITE_TRAMSANGTAO_API_KEY || '';
};
```

### 1.2 Nạp Động Key Gemini tại `src/services/gemini/client.ts`
**Trước đây:**
```typescript
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
export default ai;
```
**Thay đổi thành (Bọc qua hàm trung gian):**
```typescript
const getGeminiApiKey = () => localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';

const ai = new Proxy({} as any, {
    get: (target, prop) => {
        const apiKey = getGeminiApiKey();
        const client = new GoogleGenAI({ apiKey });
        return (client as any)[prop];
    }
});
export default ai;
```

---

## 2. Nền Tảng Render Động Vị: `src/services/gemini/baseService.ts`
File chứa những thay đổi khổng lồ mang tính rẽ nhánh. Đây là cầu nối trung gian gọi TST.

### 2.1 Viết hàm `uploadImage()` cho I2I
Trước đây, Gemini nhận thẳng Base64 Data URL qua `inlineData: { mimeType, data }`. TST Kling nghiêm ngặt hơn, chỉ nhận Upload qua `/files/upload/kling`.
**Code Thêm Mới 100%:**
```typescript
export async function uploadImage(imageDataUrl: string): Promise<string> {
    const { mimeType, data } = parseDataUrl(imageDataUrl);
    // Chuyển DataURL -> Blob
    const byteCharacters = atob(data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, 'image.png');

    // Bắn lên api upload
    const response = await fetch(`${TST_BASE_URL}/files/upload/kling`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getTstKey()}` },
        body: formData // Form data tự handle header content-type boundary
    });
    const result = await response.json();
    return result.url; // Phục vụ làm img_url ở bước sau
}
```

### 2.2 Hàm `generateTramsangtaoImage()`: Sự Cố JSON vs FormData
Ban đầu tôi code hàm POST gửi Payload chuỗi JSON. Tuyệt nhiên hệ thống Kling từ chối các biến như `img_url`, suy ra nó rơi vào chế độ Text-to-Image cơ bản.
**Giải pháp: Chuyển toàn bộ Payload về `FormData`:**
```typescript
export async function generateTramsangtaoImage(prompt: string, opts: { img_url?: string | string[]; aspect_ratio?: string; resolution?: string } = {}): Promise<string> {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', 'nano-banana-pro'); // hoặc nano-banana
    formData.append('aspect_ratio', opts.aspect_ratio || '1:1');
    formData.append('resolution', opts.resolution || defaultResolution);
    formData.append('speed', 'fast');

    // Mấu chốt đa hình (Cho phép 1 ảnh hoặc 1 mảng ảnh gắn vào)
    if (opts.img_url) {
        const urls = Array.isArray(opts.img_url) ? opts.img_url : [opts.img_url];
        urls.forEach(url => formData.append('img_url', url));
    }

    const response = await fetch(`${TST_BASE_URL}/image/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getTstKey()}` }, // Xoá bỏ Content-Type: application/json
        body: formData
    });
    return (await response.json()).job_id;
}
```

### 2.3 Cơ chế Polling (Bắt buộc cho Kiến trúc Bất đồng bộ)
Gemini trả JSON chứa thẳng cái ảnh Base64. (Synchronous).
TST trả về `job_id`, hệ thống Frontend phải treo request hỏi TST liên tục (Polling) cho đến khi ảnh trỏ URL ra.
**Code Polling (Thêm Mới):**
```typescript
export async function pollJobStatus(jobId: string): Promise<string> {
    const startTime = Date.now();
    while (Date.now() - startTime < 15 * 60 * 1000) { // Timeout 15p
        const result = await (await fetch(`${TST_BASE_URL}/jobs/${jobId}`, { headers: auth })).json();
        
        if (result.status === 'succeeded' || result.status === 'completed') {
            // Bao phủ toàn bộ các case property trả về possible của Kling
            return result.output?.[0]?.url || result.url || result.data?.url || result.result;
        } else if (result.status === 'failed') throw new Error("Thất bại");
        
        await new Promise(r => setTimeout(r, 5000)); // Sleep 5s
    }
}
```

---

## 3. Cập Nhật Cấp Từng Service Chuyên Biệt (`src/services/gemini/*CreatorService.ts`)

Quy tắc bất di bất dịch cho 10 file (Avatar, MidAutumn, v.v.):

### 3.1 Dọn Bỏ Sự Phụ Thuộc Cũ
**Bỏ đi các đoạn Import vô dụng:**
```typescript
- import { callGeminiWithRetry, processGeminiResponse } from './baseService';
```
**Bỏ đi khối lệnh Gọi Gemini Cũ (Thường rất dài và bọc payload Base64):**
```typescript
- const imagePart = { inlineData: { mimeType, data } };
- const response = await callGeminiWithRetry([...imagePart, textPart]);
- return processGeminiResponse(response);
```

### 3.2 Tích Hợp TramSangTao Vào Mọi Mặt Trận Ngữ Cảnh I2I
**Sửa đổi Hàng Loạt (Hàng ngàn dòng code xoay quanh việc đổi Point):**
```typescript
+ import { callTramsangtaoService } from './baseService';

// Bắn Prompt Tinh Giản Tiếng Việt (Thực thi trực tiếp) và Kèm tỷ lệ gốc
+ return await callTramsangtaoService(prompt, imageDataUrl, { aspect_ratio: options.aspectRatio });
```

---

## 4. Đặc Trị Các Service Cụ Thể Gây Lỗi Trước Đây

### 4.1 Tính Năng Lắp Đồ `dressTheModelService.ts`
Do Gemini làm I2I bằng trò nhét 2 Base64 vào 1 mảng Prompt rồi yêu cầu con Bot phân giải:
**Trước Đây:**
```typescript
- const modelPart = { inlineData: { mimeType: m, data: md } };
- const clothingPart = { inlineData: { mimeType: c, data: cd } };
- await callGeminiWithRetry([clothingPart, modelPart, 'Mặc áo này lên người mẫu này']);
```
**Bây Giờ (Chơi đúng chuẩn FormData Kling Endpoint):** Ném thành 1 list Ảnh trực diện không nói lòng vòng. Base Service tự tách luồng Upload -> Gắn vào `img_url`.
```typescript
+ return await callTramsangtaoService(prompt, [clothingImageDataUrl, modelImageDataUrl], { aspect_ratio: options.aspectRatio });
```

### 4.2 Tính Năng Sinh N Nhiều Ảnh Tư Do `freeGenerationService.ts`
Gemini đời AI Image Generator xịn, cho phép config API trả n ảnh trong 1 Turn HTTP (Payload Result Object). Kling/TST hiện nay chỉ xử 1 output/1 task T2I.
**Cách Lách Luật Frontend (Đồng Bộ Đa Luồng Multi-Promise):**
```typescript
// Xóa bộ config cũ của ảnh đếm count.
- // await callGemini(..., { generationConfig: { candidateCount: numberOfImages }});
  
// Bơm Request Vòng Lặp Ngang Hàng
+ const generatePromises: Promise<string>[] = [];
+ for (let i = 0; i < numberOfImages; i++) {
+    generatePromises.push(
+        callTramsangtaoService(fullPrompt, allImageUrls, { aspect_ratio: aspectRatio })
+    );
+ }
+ return await Promise.all(generatePromises); // Bắt luồng đồng loạt n ảnh 
```

---
Phía trên là toàn bộ Báo cáo Bóc Tách cực chuyên sâu. Mọi thứ được xử lý theo triết lý bảo vệ Logic Text/Prompt cũ để không đứt gãy tính năng, thay đổi toàn bộ hệ tiêu hóa ở Tầng Socket I/O thành FormData/Polling.
