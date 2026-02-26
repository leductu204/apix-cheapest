# Bản Đồ Chuyển Đổi Kiến Trúc: Tự Động Hóa Từ Gemini Sang Hybrid (Gemini + TramSangTao)

Tài liệu này tổng hợp lại **toàn bộ quá trình** chuyển đổi `sdvn_apix` từ việc sử dụng 100% Google Gemini sang một kiến trúc lai (Hybrid): Dùng Gemini để xử lý ngôn ngữ/prompt và dùng API TramSangTao (Kling) để thực thi việc tạo & chỉnh sửa ảnh.

---

## Giai đoạn 0: Trạng thái ban đầu (Pure Gemini)
*   **Kiến trúc cũ:** Mọi tác vụ từ hiểu ý định người dùng (Text) đến sinh/chỉnh sửa ảnh (Image) đều dồn qua thư viện `@google/genai`.
*   **Vấn đề:** Các model như `gemini-2.5-flash` xử lý prompt rất tốt nhưng chất lượng/tính năng chỉnh sửa ảnh chuyên sâu (I2I, thay đồ, giữ nguyên mặt) bị hạn chế.
*   **Mục tiêu (Migration):** Chuyển toàn bộ gánh nặng Render ảnh sang API TramSangTao (sử dụng base model Kling: `nano-banana`, `nano-banana-pro`), và chỉ giữ Gemini lại như một "bộ não" phân tích ngôn ngữ.

## Giai đoạn 1: Xây dựng Nền tảng Giao tiếp API TramSangTao (`baseService.ts`)
Đây là bước đặt móng. Xóa bỏ sự phụ thuộc vào hàm `genai` để render ảnh, thay bằng các hàm tương tác HTTP với server TramSangTao (TST).

1.  **Quản lý API Key:** Thêm hàm lấy `tramsangtao_api_key` từ `localStorage` (người dùng nhập qua UI Cài đặt) hoặc biến môi trường `VITE_TRAMSANGTAO_API_KEY`.
2.  **Xử lý Upload Ảnh (Image-to-Image):** 
    *   Tạo hàm `uploadImage(imageDataUrl)` gọi endpint `POST /files/upload/kling`.
    *   Logic: Chuyển đổi chuỗi base64 (`DataUrl`) thành kiểu `Blob` -> đóng gói vào `FormData` -> Gửi lên TST và nhận về một URL ảnh (ví dụ: `https://...cloudfront.net/...jpg`).
3.  **Tạo hàm Render Ảnh Cốt Lõi (`generateTramsangtaoImage`):**
    *   Endpoint: `POST /image/generate` (Kling).
    *   **Fix quan trọng:** Định dạng request phải là `multipart/form-data` thay vì JSON. Sử dụng đối tượng `FormData`.
    *   Truyền cấu hình `model`, `prompt`, `speed` (fast).
    *   Truyền thông số mở rộng **Động**: `aspect_ratio` (từ UI) và `resolution` (1k/2k/4k cài đặt toàn cục).
    *   Xử lý ảnh đầu vào (`img_url`): Nhận array `string[]` để append nhiều ảnh vào FormData (dùng cho MixStyle, DressModel).
    *   Trả về: `job_id` (Task bất đồng bộ).
4.  **Cơ chế Polling (Chờ kết quả):**
    *   API TST là bất đồng bộ. Tạo hàm `pollJobStatus(jobId)` gọi vòng lặp `GET /jobs/{jobId}` mỗi 5 giây.
    *   Timeout sau 15 phút.
    *   Khi status = `succeeded`, trích xuất URL ảnh (parse qua các trường `output[0].url`, `result.url`, `result.result`, `data.url`).
5.  **Hàm Tổng hợp (`callTramsangtaoService`):**
    *   Hàm bọc (Wrapper) cho các Service bên trên gọi: Nhận `prompt` và `(các) imageDataUrl`.
    *   Tự động map Upload ảnh -> Xin `job_id` -> Polling chờ ảnh cuối.

## Giai đoạn 2: Phân tách Nhiệm vụ - Kiến trúc Hybrid LLM + Render
Trong các file như `imageEditingService.ts`, chúng ta xây dựng luồng đi "Lai":

1.  **Giữ nguyên Gemini cho Logic (Não bộ):**
    *   Các hàm `refinePrompt`, `analyzePromptForImageGenerationParams`, `enhancePrompt`, `refineArchitecturePrompt` giữ nguyên lệnh gọi `ai.models.generateContent`.
    *   Nhiệm vụ: Phân tích prompt tiếng Việt lủng củng của User -> Trích xuất số lượng ảnh, tỷ lệ khung hình -> Viết thành 1 câu lệnh (Prompt) siêu chuẩn xác mang tính hành động.
2.  **Đổi engine Render (Tay chân):**
    *   Các hàm thực thi cuối như `editImageWithPrompt`, `removeImageBackground`, `generateFromMultipleImages` thay đổi điểm kết thúc: 
    *   *Xóa bỏ* `callGeminiWithRetry`.
    *   *Thay bằng* `callTramsangtaoService` với Prompt đã được Gemini tinh chỉnh ở bước trên.

## Giai đoạn 3: Cập nhật Toàn bộ Hệ sinh thái Services
Apply mô hình "Gemini nghĩ -> TramSangTao vẽ" cho tất cả 12 module cung cấp tính năng của App:

1.  **Các Service 1 Ảnh (I2I):** Cập nhật `avatarCreator`, `babyPhoto`, `beauty`, `entrepreneur`, `midAutumn`, `architecture`, `imageToReal`, `photoRestoration`, `swapStyle`, `toyModel`.
    *   Truyền `aspectRatio` xuống hàm `callTramsangtaoService`.
2.  **Các Service Lắp Ghép Nhiều Ảnh:**
    *   `dressTheModelService.ts`: Thay vì bắt Gemini tưởng tượng 2 tấm ảnh (Quần áo + Người), ta truyền thẳng mảng `[clothingImageDataUrl, modelImageDataUrl]` qua `FormData` của `callTramsangtaoService` lên TST Kling.
    *   `mixStyleService.ts`: Tương tự.
3.  **Tạo Ảnh Tự Do (Nhiều kết quả):**
    *   `freeGenerationService.ts`: TST chỉ trả về 1 ảnh mỗi Job. Thay đổi logic từ Generate 1 lần sinh ra Array 4 ảnh sang luồng: Dùng vòng lặp `for` -> Tạo mảng `generatePromises` -> Bắn song song N request `callTramsangtaoService` -> Dùng `Promise.all` thu thập đủ kết quả.
4.  **Prompt Engineering Mới:**
    *   Xóa bỏ các cụm từ dành riêng cho Gemini (ví dụ: yêu cầu AI tự cắt ghép chi tiết rườm rà) do Kling xử lý hình khối I2I tự nhiên tốt hơn. Thiết lập các prompt Mệnh lệnh ngắn gọn, tập trung bắt tỷ lệ khung hình và yêu cầu `aspectRatio`.

## Giai đoạn 4: Dọn dẹp & Khắc phục Lỗi TypeScript (Bước cuối)
*   **Vấn đề phát sinh:** Do việc đồng bộ hóa `aspectRatio` từ UI Components (`AvatarCreator.tsx`, `Storyboarding.tsx`...) cuống sâu tầng Services, Type Interface của một số hàm/biến chưa khớp (báo undefined).
*   **Cách giải quyết (Đang thực thi):** Cập nhật Type Definitions tại Frontend (Ví dụ: Thêm `aspectRatio` vào `AvatarOptions`) để Component tuân thủ nghiêm ngặt Schema của API mới sinh ra.

---
**Tóm tắt Lợi Ích của Kiến Trúc Mới:**
*   **Thông minh hơn:** Vẫn giữ được Gemini để hiểu tiếng Việt tự nhiên phức tạp.
*   **Đẹp hơn:** Khai thác tối đa chất lượng ảnh Cinematic của Kling Model (V2/V3 - Nano Banana).
*   **Hoạt động ổn định:** Chấp nhận Request FormData và Polling an toàn cho các tác vụ gen ảnh mất nhiều thời gian.
