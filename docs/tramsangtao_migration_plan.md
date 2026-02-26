# Kế Hoạch Chuyển Đổi API: Từ Gemini sang Tramsangtao

Mục tiêu: Thay thế hoàn toàn các lệnh gọi Google Gemini API (`@google/genai`) sang API của hệ thống `api.tramsangtao.com` cho toàn bộ các chức năng xử lý và tạo ảnh trong ứng dụng `sdvn_apix`.

## Tóm Tắt Quy Trình

Việc chuyển đổi đòi hỏi việc kiến trúc lại file `services/gemini/baseService.ts` để sử dụng HTTP request tiêu chuẩn thay vì SDK của Google. Các tham số như `model` (nano-banana, nano-banana-pro), `aspect_ratio`, và `speed` (mặc định 'fast') sẽ cần được map từ UI controls xuống API payload một cách chính xác.

Hơn nữa, API của Tramsangtao là **bất đồng bộ (asynchronous)**. Không giống như Gemini trả về ảnh ngay lập tức, Tramsangtao sẽ trả về một `job_id`. Code sẽ cần có một cơ chế **polling (gọi định kỳ)** bằng GET request (`/jobs/{job_id}`) để lấy kết quả khi bức ảnh đã tạo xong (status: 'completed').

## Chi Tiết Các Bước Chuyển Đổi (Dành cho Agent)

### Khởi tạo Quản lý API Key (UI)
- **Thêm icon Cài Đặt (⚙️)**: Tại thanh công cụ `components/AppToolbar.tsx`, đặt cạnh nút ngôn ngữ.
- **Modal Cài Đặt Tích Hợp**: Khi bấm vào ⚙️ sẽ hiện popup có 2 trường nhập để hỗ trợ chia tính năng:
  - **TramSangTao API Key**: Dùng cho phần sinh ảnh và chỉnh sửa ảnh (lưu vào `localStorage` như `tramsangtao_api_key`).
  - **Gemini API Key**: Dùng cho phần LLM/Text để tinh chỉnh câu lệnh (Refine Prompt) cho các model creator (lưu vào `localStorage` như `gemini_api_key`).
- **Context/Helper**: Trong `components/uiContexts.tsx` hoặc `lib/utils` tạo các hàm lấy key tương ứng. Ưu tiên lấy từ `localStorage`, nếu không có thì fallback sang biến môi trường (nếu có). 

### Bước 1: Thiết lập lại Base Service (`services/gemini/baseService.ts`)

- **Tạo hàm `uploadImage(imageDataUrl: string)`**:
  - Tác vụ I2I bắt buộc phải upload ảnh gốc lên API trước để lấy URL.
  - Sử dụng endpoint: `https://api.tramsangtao.com/v1/files/upload/kling` (Lưu ý: Endpoint này mang tên "kling" nhưng thực chất là API chung dùng để upload ảnh lên hệ thống Tramsangtao).
  - Chuyển `imageDataUrl` thành dạng binary Blob. Gửi POST `multipart/form-data` với field name là `file`.
  - Hàm phải parse response và lấy giá trị `url` trả về.

- **Tạo hàm `generateTramsangtaoImage(payload)`**: 
  - Thực hiện gửi POST request (`multipart/form-data`) tới endpoint `https://api.tramsangtao.com/v1/image/generate`. 
  - Token xác thực Bearer lấy từ hàm Get Key ở phần UI.
  - Các Params:
    - Nếu `globalConfig.modelVersion` đang là `'v2'` -> gửi `model: "nano-banana"`
    - Nếu `globalConfig.modelVersion` đang là `'v3'` -> gửi `model: "nano-banana-pro"`
    - Tích hợp tham số mặc định: `speed: "fast"`, `resolution` ('1k', '2k', '4k'), `aspect_ratio`.
    - `input_image`: NẾU CÓ URL ảnh (từ hàm `uploadImage` ở trên), thì truyền URL này vào.

- **Tạo hàm `pollJobStatus(jobId)`**: 
  - Viết vòng lặp gọi GET request lên `https://api.tramsangtao.com/v1/jobs/${jobId}`. 
  - **Cơ chế Polling:** Delay **mỗi 5 giây** gọi 1 lần.
  - **Timeout:** Gắn giới hạn timeout tối đa là **15 phút**. Nếu quá 15 phút mà `status` chưa `completed`, throw error "Timeout: Tác vụ vượt quá thời gian chờ".
  - Đợi cho đến khi `response.status === 'completed'`. Trả về `response.result`.

### Bước 2: Tự Động Định Tuyến / Chuyển Đổi Các Tác Vụ Gốc
- Thiết kế lại hàm Wrapper (thay thế cho `callGeminiWithRetry` cũ):
  1. Kiểm tra request hiện tại xem có chứa thông tin hình ảnh đính kèm (base64) không.
  2. NẾU CÓ HÌNH ẢNH (I2I): 
     - Bắt buộc phải gọi `const uploadedUrl = await uploadImage(image)` (API upload kling) để lấy URL.
     - Sau đó nhồi `uploadedUrl` này vào thuộc tính `input_image` của `generateTramsangtaoImage`.
  3. NẾU KHÔNG CÓ HÌNH ẢNH (Text2Img): Bỏ qua bước upload, gọi thẳng `generateTramsangtaoImage`.

### Bước 3: Di chuyển Tool Xóa Nền (Background Removal)
- Tramsangtao không có mô hình/endpoint riêng biệt cho chức năng xóa nền.
- Do đó, để thay thế hàm `removeImageBackground` cũ, bạn vẫn gọi qua luồng I2I (Upload ảnh hiện tại lên trước lấy URL).
- Sau đó gửi request POST tạo ảnh với `prompt` cứng: **"Xóa nền, nền trong suốt"**. Sử dụng model mặc định (ví dụ `nano-banana-pro`).

### Bước 4: Refactor Hàng Loạt Service Module Từng Chức Năng
Hiện tại ứng dụng có hệ thống service đa dạng (như `avatarCreatorService.ts`, `swapStyleService.ts`, v.v.). Bạn cần làm các bước sau ở *từng file*:
1.  **Chỉnh sửa hàm Prompt Tinh Chỉnh (Refine Prompt):** Bạn **VẪN GIỮ QUY TRÌNH** dùng LLM (`ai.models.generateContent` của Gemini) để chuẩn bị text. Tuy nhiên:
    - Yêu cầu User nhập `Gemini API Key` ở Bước UI trên (⚙️) thay vì dùng key lưu cứng trên server. Code khởi tạo `ai` cũ (GoogleGenAI) ở `services/gemini/client.ts` phải đổi sang nhận API key linh hoạt từ client context (localStorage).
2.  **Đổi Hàm Build Payload Tramsangtao:** Xóa toàn bộ logic rườm rà chuẩn bị ảnh bằng đối tượng dạng `{ inlineData: { mimeType, data } }` dùng cho Gemini Image Mode.
    - **Lưu ý CỰC KỲ QUAN TRỌNG:** API endpoint lên TramSangTao là `files/upload/kling` BẮT BUỘC NHẬN MỘT OBJECT DẠNG BINARY `File` HOẶC `Blob`. Bạn phải có bước parse cái chuỗi raw DataURL / base64 từ Canvas/crop ra thành `Blob`, sau đó ghép `Blob` này vào đối tượng `FormData` với `formData.append('file', blob, 'image.png')` rồi mới được POST đi.
3.  **Thay Thế Hàm Gọi Cuối Cùng:** Trỏ lệnh gọi sinh ảnh tại điểm cuối cùng của file về hàm `callTramsangtaoService` ở Bước 2, truyền vào đúng format cho Tramsangtao (chuỗi Text đã được refine bằng Gemini LLM ở trên, và raw DataURL để baseService xử lý trọn luồng upload -> lấy URL -> call create task).

### Lưu ý Quan trọng cho UI

Do cơ chế là polling chờ kết quả qua Job ID (thay vì websocket stream real-time), UI Spinner mặc định của React có thể cần phải show rõ ràng trạng thái "Đang chờ lấy kết quả (Polling...)" nếu thời gian vượt quá 10 giây để UX không có cảm giác bị đơ. Bằng cách cập nhật cơ chế ở `baseService.ts`, tất cả các màn hình sẽ tự động thừa hưởng trạng thái Async này.
